'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const overlay = require('../src/overlay');

let tmpDir;

function makeTask(overrides = {}) {
  return {
    id: 1,
    request_id: 'req-1',
    subject: 'Test task',
    tier: 2,
    priority: 'normal',
    description: 'Test description',
    domain: 'coordinator',
    ...overrides,
  };
}

const worker = { id: 1, branch: 'agent-1', worktree_path: '/wt-1' };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-overlay-'));
  // Create base directories
  fs.mkdirSync(path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'knowledge', 'domain'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Overlay knowledge injection', () => {
  describe('Codebase Context', () => {
    it('injects codebase context when domain file exists', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'),
        '# Coordinator\nHandles task routing\nUses SQLite database'
      );
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(content.includes('## Codebase Context'));
      assert.ok(content.includes('Handles task routing'));
    });

    it('omits codebase context when file does not exist', () => {
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(!content.includes('## Codebase Context'));
    });

    it('omits codebase context when file is empty', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'),
        ''
      );
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(!content.includes('## Codebase Context'));
    });

    it('trims to 10 lines max', () => {
      const longContent = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'),
        longContent
      );
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(content.includes('Line 10'));
      assert.ok(!content.includes('Line 11'));
    });
  });

  describe('Relevant Research', () => {
    it('injects research when matching rollup exists', () => {
      const topicDir = path.join(tmpDir, '.codex', 'knowledge', 'research', 'topics', 'coordinator-patterns');
      fs.mkdirSync(topicDir, { recursive: true });
      fs.writeFileSync(path.join(topicDir, '_rollup.md'), '## Current Recommended Approach\nUse event-driven architecture');

      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(content.includes('## Relevant Research'));
      assert.ok(content.includes('Use event-driven architecture'));
    });

    it('omits research when no matching topic', () => {
      const topicDir = path.join(tmpDir, '.codex', 'knowledge', 'research', 'topics', 'frontend-design');
      fs.mkdirSync(topicDir, { recursive: true });
      fs.writeFileSync(path.join(topicDir, '_rollup.md'), 'Frontend stuff');

      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(!content.includes('## Relevant Research'));
    });

    it('omits research when rollup is empty', () => {
      const topicDir = path.join(tmpDir, '.codex', 'knowledge', 'research', 'topics', 'coordinator-stuff');
      fs.mkdirSync(topicDir, { recursive: true });
      fs.writeFileSync(path.join(topicDir, '_rollup.md'), '');

      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(!content.includes('## Relevant Research'));
    });
  });

  describe('Owner Intent', () => {
    it('injects intent when intent.md exists', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'intent.md'),
        'Build a reliable multi-agent system'
      );
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(content.includes('## Owner Intent'));
      assert.ok(content.includes('Build a reliable multi-agent system'));
    });

    it('omits intent when file does not exist', () => {
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(!content.includes('## Owner Intent'));
    });

    it('trims to 5 lines max', () => {
      const longIntent = Array.from({ length: 10 }, (_, i) => `Intent line ${i + 1}`).join('\n');
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'intent.md'),
        longIntent
      );
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(content.includes('Intent line 5'));
      assert.ok(!content.includes('Intent line 6'));
    });
  });

  describe('Knowledge Gaps', () => {
    it('shows gap when domain has no codebase file', () => {
      const content = overlay.buildTaskOverlay(makeTask({ domain: 'newdomain' }), worker, tmpDir);
      assert.ok(content.includes('## Knowledge Gaps'));
      assert.ok(content.includes('No codebase research for domain "newdomain"'));
    });

    it('omits gap when domain has codebase coverage', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'),
        'Some content'
      );
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      // Should not have the "no codebase research" gap (may have other gaps)
      assert.ok(!content.includes('No codebase research for domain "coordinator"'));
    });

    it('shows staleness warning when changes exceed threshold', () => {
      const knowledgeMeta = require('../src/knowledge-metadata');
      // Write metadata with high changes count
      const metaPath = knowledgeMeta.getMetadataPath(tmpDir);
      fs.mkdirSync(path.dirname(metaPath), { recursive: true });
      knowledgeMeta.writeMetadata(tmpDir, {
        last_indexed: null,
        changes_since_index: 0,
        domains: { coordinator: { changes_since_research: 15, worker_patches: 0 } },
      });
      // Also create the domain file so we only test staleness
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'),
        'content'
      );

      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(content.includes('Domain knowledge may be stale'));
      assert.ok(content.includes('15 changes'));
    });

    it('shows worker patches warning when patches exceed threshold', () => {
      const knowledgeMeta = require('../src/knowledge-metadata');
      const metaPath = knowledgeMeta.getMetadataPath(tmpDir);
      fs.mkdirSync(path.dirname(metaPath), { recursive: true });
      knowledgeMeta.writeMetadata(tmpDir, {
        last_indexed: null,
        changes_since_index: 0,
        domains: { coordinator: { changes_since_research: 0, worker_patches: 5 } },
      });
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'),
        'content'
      );

      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(content.includes('Workers have patched this domain 5 times'));
    });

    it('omits Knowledge Gaps section when no gaps exist', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'),
        'content'
      );
      // No staleness, no patches — no gaps
      const content = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
      assert.ok(!content.includes('## Knowledge Gaps'));
    });
  });
});
