'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const knowledgeMeta = require('../src/knowledge-metadata');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-km-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('knowledge-metadata', () => {
  describe('getMetadata', () => {
    it('returns defaults when no metadata file exists', () => {
      const meta = knowledgeMeta.getMetadata(tmpDir);
      assert.strictEqual(meta.last_indexed, null);
      assert.strictEqual(meta.changes_since_index, 0);
      assert.deepStrictEqual(meta.domains, {});
      assert.strictEqual(meta.last_external_research, null);
      assert.deepStrictEqual(meta.external_research_stale_topics, []);
    });

    it('reads existing metadata file', () => {
      const metaPath = knowledgeMeta.getMetadataPath(tmpDir);
      fs.mkdirSync(path.dirname(metaPath), { recursive: true });
      const data = {
        last_indexed: '2026-01-01T00:00:00Z',
        changes_since_index: 5,
        domains: { coordinator: { changes_since_research: 3, worker_patches: 1 } },
        last_external_research: null,
        external_research_stale_topics: [],
      };
      fs.writeFileSync(metaPath, JSON.stringify(data));

      const meta = knowledgeMeta.getMetadata(tmpDir);
      assert.strictEqual(meta.last_indexed, '2026-01-01T00:00:00Z');
      assert.strictEqual(meta.changes_since_index, 5);
      assert.strictEqual(meta.domains.coordinator.changes_since_research, 3);
      assert.strictEqual(meta.domains.coordinator.worker_patches, 1);
    });

    it('returns defaults for malformed JSON', () => {
      const metaPath = knowledgeMeta.getMetadataPath(tmpDir);
      fs.mkdirSync(path.dirname(metaPath), { recursive: true });
      fs.writeFileSync(metaPath, 'not-json');

      const meta = knowledgeMeta.getMetadata(tmpDir);
      assert.strictEqual(meta.changes_since_index, 0);
    });
  });

  describe('writeMetadata', () => {
    it('creates directories and writes atomically', () => {
      const data = { last_indexed: '2026-03-29T00:00:00Z', changes_since_index: 0, domains: {} };
      knowledgeMeta.writeMetadata(tmpDir, data);

      const metaPath = knowledgeMeta.getMetadataPath(tmpDir);
      assert.ok(fs.existsSync(metaPath));
      const read = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      assert.strictEqual(read.last_indexed, '2026-03-29T00:00:00Z');
    });
  });

  describe('incrementChanges', () => {
    it('increments global counter', () => {
      knowledgeMeta.incrementChanges(tmpDir, null);
      const meta = knowledgeMeta.getMetadata(tmpDir);
      assert.strictEqual(meta.changes_since_index, 1);
    });

    it('increments domain-specific counter', () => {
      knowledgeMeta.incrementChanges(tmpDir, 'coordinator');
      knowledgeMeta.incrementChanges(tmpDir, 'coordinator');
      const meta = knowledgeMeta.getMetadata(tmpDir);
      assert.strictEqual(meta.changes_since_index, 2);
      assert.strictEqual(meta.domains.coordinator.changes_since_research, 2);
    });

    it('creates domain entry if it does not exist', () => {
      knowledgeMeta.incrementChanges(tmpDir, 'frontend');
      const meta = knowledgeMeta.getMetadata(tmpDir);
      assert.strictEqual(meta.domains.frontend.changes_since_research, 1);
      assert.strictEqual(meta.domains.frontend.worker_patches, 0);
    });
  });

  describe('incrementWorkerPatches', () => {
    it('increments worker_patches for a domain', () => {
      knowledgeMeta.incrementWorkerPatches(tmpDir, 'coordinator');
      knowledgeMeta.incrementWorkerPatches(tmpDir, 'coordinator');
      const meta = knowledgeMeta.getMetadata(tmpDir);
      assert.strictEqual(meta.domains.coordinator.worker_patches, 2);
    });
  });

  describe('updateIndexTimestamp', () => {
    it('sets last_indexed and resets changes_since_index', () => {
      knowledgeMeta.incrementChanges(tmpDir, 'coordinator');
      knowledgeMeta.incrementChanges(tmpDir, 'coordinator');
      assert.strictEqual(knowledgeMeta.getMetadata(tmpDir).changes_since_index, 2);

      knowledgeMeta.updateIndexTimestamp(tmpDir);
      const meta = knowledgeMeta.getMetadata(tmpDir);
      assert.strictEqual(meta.changes_since_index, 0);
      assert.ok(meta.last_indexed);
    });
  });

  describe('getDomainCoverage', () => {
    it('returns empty when no domain files exist', () => {
      const coverage = knowledgeMeta.getDomainCoverage(tmpDir);
      assert.deepStrictEqual(coverage.domains, {});
    });

    it('detects codebase domain files', () => {
      const domainsDir = path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains');
      fs.mkdirSync(domainsDir, { recursive: true });
      fs.writeFileSync(path.join(domainsDir, 'coordinator.md'), '# Coordinator\nSome content');

      const coverage = knowledgeMeta.getDomainCoverage(tmpDir);
      assert.strictEqual(coverage.domains.coordinator.exists, true);
      assert.strictEqual(coverage.domains.coordinator.non_empty, true);
      assert.strictEqual(coverage.domains.coordinator.source, 'codebase');
    });

    it('detects empty domain files', () => {
      const domainsDir = path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains');
      fs.mkdirSync(domainsDir, { recursive: true });
      fs.writeFileSync(path.join(domainsDir, 'empty.md'), '');

      const coverage = knowledgeMeta.getDomainCoverage(tmpDir);
      assert.strictEqual(coverage.domains.empty.exists, true);
      assert.strictEqual(coverage.domains.empty.non_empty, false);
    });

    it('detects legacy domain files', () => {
      const legacyDir = path.join(tmpDir, '.claude', 'knowledge', 'domains');
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.writeFileSync(path.join(legacyDir, 'frontend.md'), 'Some knowledge');

      const coverage = knowledgeMeta.getDomainCoverage(tmpDir);
      assert.strictEqual(coverage.domains.frontend.exists, true);
      assert.strictEqual(coverage.domains.frontend.source, 'legacy');
    });

    it('codebase takes precedence over legacy', () => {
      const codebaseDir = path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains');
      const legacyDir = path.join(tmpDir, '.claude', 'knowledge', 'domains');
      fs.mkdirSync(codebaseDir, { recursive: true });
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.writeFileSync(path.join(codebaseDir, 'coordinator.md'), 'New content');
      fs.writeFileSync(path.join(legacyDir, 'coordinator.md'), 'Old content');

      const coverage = knowledgeMeta.getDomainCoverage(tmpDir);
      assert.strictEqual(coverage.domains.coordinator.source, 'codebase');
    });
  });

  describe('getResearchCoverage', () => {
    it('returns empty when no research topics exist', () => {
      const coverage = knowledgeMeta.getResearchCoverage(tmpDir);
      assert.deepStrictEqual(coverage.topics, {});
    });

    it('detects research topics with rollups', () => {
      const topicDir = path.join(tmpDir, '.codex', 'knowledge', 'research', 'topics', 'api-design');
      fs.mkdirSync(topicDir, { recursive: true });
      fs.writeFileSync(path.join(topicDir, '_rollup.md'), '# API Design\nBest practices...');

      const coverage = knowledgeMeta.getResearchCoverage(tmpDir);
      assert.strictEqual(coverage.topics['api-design'].exists, true);
      assert.strictEqual(coverage.topics['api-design'].non_empty, true);
    });

    it('marks topics without rollups', () => {
      const topicDir = path.join(tmpDir, '.codex', 'knowledge', 'research', 'topics', 'empty-topic');
      fs.mkdirSync(topicDir, { recursive: true });

      const coverage = knowledgeMeta.getResearchCoverage(tmpDir);
      assert.strictEqual(coverage.topics['empty-topic'].exists, false);
    });
  });

  describe('getKnowledgeStatus', () => {
    it('returns full status object', () => {
      // Create some files
      const domainsDir = path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains');
      fs.mkdirSync(domainsDir, { recursive: true });
      fs.writeFileSync(path.join(domainsDir, 'coordinator.md'), 'content');

      const prefsPath = path.join(tmpDir, '.claude', 'knowledge', 'user-preferences.md');
      fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
      fs.writeFileSync(prefsPath, 'user prefs');

      knowledgeMeta.incrementChanges(tmpDir, 'coordinator');

      const status = knowledgeMeta.getKnowledgeStatus(tmpDir);
      assert.strictEqual(status.changes_since_index, 1);
      assert.strictEqual(status.domain_coverage.coordinator.exists, true);
      assert.strictEqual(status.intent_exists, false);
      assert.strictEqual(status.user_preferences_populated, true);
    });

    it('detects intent file when present', () => {
      const intentPath = path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'intent.md');
      fs.mkdirSync(path.dirname(intentPath), { recursive: true });
      fs.writeFileSync(intentPath, 'Build a thing');

      const status = knowledgeMeta.getKnowledgeStatus(tmpDir);
      assert.strictEqual(status.intent_exists, true);
    });
  });
});
