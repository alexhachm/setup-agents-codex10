'use strict';

const fs = require('fs');
const path = require('path');

const METADATA_RELATIVE = path.join('.claude', 'knowledge', 'codebase', '.metadata.json');

function getMetadataPath(projectDir) {
  return path.join(projectDir, METADATA_RELATIVE);
}

function defaultMetadata() {
  return {
    last_indexed: null,
    changes_since_index: 0,
    domains: {},
    last_external_research: null,
    external_research_stale_topics: [],
  };
}

function defaultDomainEntry() {
  return { changes_since_research: 0, worker_patches: 0 };
}

function getMetadata(projectDir) {
  const metaPath = getMetadataPath(projectDir);
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultMetadata(), ...parsed };
  } catch {
    return defaultMetadata();
  }
}

function writeMetadata(projectDir, data) {
  const metaPath = getMetadataPath(projectDir);
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  const tmpPath = metaPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, metaPath);
}

function incrementChanges(projectDir, domain) {
  const meta = getMetadata(projectDir);
  meta.changes_since_index = (meta.changes_since_index || 0) + 1;
  if (domain) {
    if (!meta.domains) meta.domains = {};
    if (!meta.domains[domain]) meta.domains[domain] = defaultDomainEntry();
    meta.domains[domain].changes_since_research = (meta.domains[domain].changes_since_research || 0) + 1;
  }
  writeMetadata(projectDir, meta);
  return meta;
}

function incrementWorkerPatches(projectDir, domain) {
  const meta = getMetadata(projectDir);
  if (domain) {
    if (!meta.domains) meta.domains = {};
    if (!meta.domains[domain]) meta.domains[domain] = defaultDomainEntry();
    meta.domains[domain].worker_patches = (meta.domains[domain].worker_patches || 0) + 1;
  }
  writeMetadata(projectDir, meta);
  return meta;
}

function updateIndexTimestamp(projectDir) {
  const meta = getMetadata(projectDir);
  meta.last_indexed = new Date().toISOString();
  meta.changes_since_index = 0;
  writeMetadata(projectDir, meta);
  return meta;
}

function getDomainCoverage(projectDir) {
  const codebaseDir = path.join(projectDir, '.claude', 'knowledge', 'codebase', 'domains');
  const result = { domains: {} };

  // Single source of truth: .claude/knowledge/codebase/domains/
  try {
    if (fs.existsSync(codebaseDir) && fs.statSync(codebaseDir).isDirectory()) {
      for (const entry of fs.readdirSync(codebaseDir)) {
        const filePath = path.join(codebaseDir, entry);
        try {
          const stat = fs.statSync(filePath);
          const name = entry.replace(/\.md$/, '');
          if (stat.isFile() && entry.endsWith('.md')) {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            result.domains[name] = { source: 'codebase', exists: true, non_empty: content.length > 0 };
          } else if (stat.isDirectory()) {
            const readmePath = path.join(filePath, 'README.md');
            if (fs.existsSync(readmePath)) {
              const content = fs.readFileSync(readmePath, 'utf8').trim();
              result.domains[name] = { source: 'codebase', exists: true, non_empty: content.length > 0 };
            }
          }
        } catch {}
      }
    }
  } catch {}

  return result;
}

function getResearchCoverage(projectDir) {
  const researchDir = path.join(projectDir, '.codex', 'knowledge', 'research', 'topics');
  const result = { topics: {} };

  try {
    if (fs.existsSync(researchDir) && fs.statSync(researchDir).isDirectory()) {
      for (const topic of fs.readdirSync(researchDir)) {
        const topicDir = path.join(researchDir, topic);
        try {
          if (!fs.statSync(topicDir).isDirectory()) continue;
          const rollupPath = path.join(topicDir, '_rollup.md');
          if (fs.existsSync(rollupPath)) {
            const content = fs.readFileSync(rollupPath, 'utf8').trim();
            result.topics[topic] = { exists: true, non_empty: content.length > 0 };
          } else {
            result.topics[topic] = { exists: false, non_empty: false };
          }
        } catch {}
      }
    }
  } catch {}

  return result;
}

function getKnowledgeStatus(projectDir) {
  const meta = getMetadata(projectDir);
  const domainCoverage = getDomainCoverage(projectDir);
  const researchCoverage = getResearchCoverage(projectDir);

  // Check intent file
  const intentPath = path.join(projectDir, '.claude', 'knowledge', 'codebase', 'intent.md');
  let intentExists = false;
  try {
    intentExists = fs.existsSync(intentPath) && fs.readFileSync(intentPath, 'utf8').trim().length > 0;
  } catch {}

  // Check user preferences
  const prefsPath = path.join(projectDir, '.claude', 'knowledge', 'user-preferences.md');
  let prefsPopulated = false;
  try {
    prefsPopulated = fs.existsSync(prefsPath) && fs.readFileSync(prefsPath, 'utf8').trim().length > 0;
  } catch {}

  return {
    last_indexed: meta.last_indexed,
    changes_since_index: meta.changes_since_index,
    domains: meta.domains,
    domain_coverage: domainCoverage.domains,
    research_coverage: researchCoverage.topics,
    intent_exists: intentExists,
    user_preferences_populated: prefsPopulated,
    last_external_research: meta.last_external_research,
    external_research_stale_topics: meta.external_research_stale_topics,
  };
}

module.exports = {
  getMetadata,
  writeMetadata,
  incrementChanges,
  incrementWorkerPatches,
  updateIndexTimestamp,
  getDomainCoverage,
  getResearchCoverage,
  getKnowledgeStatus,
  getMetadataPath,
};
