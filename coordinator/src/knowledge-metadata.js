'use strict';

const fs = require('fs');
const path = require('path');

const METADATA_RELATIVE = path.join('.claude', 'knowledge', 'codebase', '.metadata.json');
const CODEBASE_DOMAINS_RELATIVE = path.join('.claude', 'knowledge', 'codebase', 'domains');
const LEGACY_DOMAINS_RELATIVE = path.join('.claude', 'knowledge', 'domains');
const RESEARCH_TOPICS_RELATIVE = path.join('.claude', 'knowledge', 'research', 'topics');
const SCAN_ARTIFACT_RELATIVES = [
  path.join('.claude', 'state', 'codebase-map.json'),
  path.join('.claude', 'knowledge', 'codebase-insights.md'),
];

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

function nowIso() {
  return new Date().toISOString();
}

function parseTimestampMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function statMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

function normalizeDomainEntry(entry) {
  return { ...defaultDomainEntry(), ...(entry && typeof entry === 'object' ? entry : {}) };
}

function normalizeMetadata(meta) {
  const normalized = { ...defaultMetadata(), ...(meta && typeof meta === 'object' ? meta : {}) };
  if (!normalized.domains || typeof normalized.domains !== 'object' || Array.isArray(normalized.domains)) {
    normalized.domains = {};
  }
  for (const [domain, entry] of Object.entries(normalized.domains)) {
    normalized.domains[domain] = normalizeDomainEntry(entry);
  }
  if (!Array.isArray(normalized.external_research_stale_topics)) {
    normalized.external_research_stale_topics = [];
  }
  return normalized;
}

function getMetadata(projectDir) {
  const metaPath = getMetadataPath(projectDir);
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeMetadata(parsed);
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
  const ts = nowIso();
  meta.changes_since_index = (meta.changes_since_index || 0) + 1;
  meta.last_changed = ts;
  if (domain) {
    if (!meta.domains) meta.domains = {};
    if (!meta.domains[domain]) meta.domains[domain] = defaultDomainEntry();
    meta.domains[domain].changes_since_research = (meta.domains[domain].changes_since_research || 0) + 1;
    meta.domains[domain].last_changed = ts;
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
  meta.last_indexed = nowIso();
  meta.changes_since_index = 0;
  writeMetadata(projectDir, meta);
  return meta;
}

function scanDomainDirectory(dir, source, result, { overwrite = true } = {}) {
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      for (const entry of fs.readdirSync(dir)) {
        const filePath = path.join(dir, entry);
        try {
          const stat = fs.statSync(filePath);
          const name = entry.replace(/\.md$/, '');
          if (!overwrite && result.domains[name]) continue;
          if (stat.isFile() && entry.endsWith('.md')) {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            result.domains[name] = {
              source,
              exists: true,
              non_empty: content.length > 0,
              updated_at: isoFromMs(stat.mtimeMs),
            };
          } else if (stat.isDirectory()) {
            const readmePath = path.join(filePath, 'README.md');
            if (fs.existsSync(readmePath)) {
              const readmeStat = fs.statSync(readmePath);
              const content = fs.readFileSync(readmePath, 'utf8').trim();
              result.domains[name] = {
                source,
                exists: true,
                non_empty: content.length > 0,
                updated_at: isoFromMs(readmeStat.mtimeMs),
              };
            }
          }
        } catch {}
      }
    }
  } catch {}
}

function getDomainCoverage(projectDir) {
  const result = { domains: {} };

  // Codebase domain docs are canonical, but keep the legacy path readable so
  // older worktrees do not look uncovered and trigger duplicate documentation.
  scanDomainDirectory(path.join(projectDir, CODEBASE_DOMAINS_RELATIVE), 'codebase', result);
  scanDomainDirectory(path.join(projectDir, LEGACY_DOMAINS_RELATIVE), 'legacy', result, { overwrite: false });

  return result;
}

function getResearchCoverage(projectDir) {
  const researchDir = path.join(projectDir, RESEARCH_TOPICS_RELATIVE);
  const result = { topics: {} };

  try {
    if (fs.existsSync(researchDir) && fs.statSync(researchDir).isDirectory()) {
      for (const topic of fs.readdirSync(researchDir)) {
        const topicDir = path.join(researchDir, topic);
        try {
          if (!fs.statSync(topicDir).isDirectory()) continue;
          const rollupPath = path.join(topicDir, '_rollup.md');
          if (fs.existsSync(rollupPath)) {
            const stat = fs.statSync(rollupPath);
            const content = fs.readFileSync(rollupPath, 'utf8').trim();
            result.topics[topic] = {
              exists: true,
              non_empty: content.length > 0,
              updated_at: isoFromMs(stat.mtimeMs),
            };
          } else {
            result.topics[topic] = { exists: false, non_empty: false };
          }
        } catch {}
      }
    }
  } catch {}

  return result;
}

function getLatestScanArtifact(projectDir) {
  let latest = null;
  for (const relative of SCAN_ARTIFACT_RELATIVES) {
    const filePath = path.join(projectDir, relative);
    const mtimeMs = statMtimeMs(filePath);
    if (mtimeMs === null) continue;
    if (relative.endsWith('.json')) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const domains = parsed && parsed.domains;
        if (!domains || typeof domains !== 'object') continue;
      } catch {
        continue;
      }
    } else {
      try {
        if (fs.readFileSync(filePath, 'utf8').trim().length === 0) continue;
      } catch {
        continue;
      }
    }
    if (!latest || mtimeMs > latest.mtimeMs) latest = { path: filePath, mtimeMs };
  }
  return latest;
}

function reconcileIndexFromScanArtifacts(projectDir) {
  const meta = getMetadata(projectDir);
  const latest = getLatestScanArtifact(projectDir);
  if (!latest) return meta;

  const lastIndexedMs = parseTimestampMs(meta.last_indexed) || 0;
  if (latest.mtimeMs > lastIndexedMs + 500) {
    meta.last_indexed = isoFromMs(latest.mtimeMs);
    meta.changes_since_index = 0;
    meta.last_index_artifact = path.relative(projectDir, latest.path);
    writeMetadata(projectDir, meta);
  }
  return meta;
}

function resetDomainResearch(projectDir, domain, researchedAt = null) {
  if (!domain) return getMetadata(projectDir);
  const meta = getMetadata(projectDir);
  const ts = researchedAt || nowIso();
  if (!meta.domains) meta.domains = {};
  meta.domains[domain] = {
    ...normalizeDomainEntry(meta.domains[domain]),
    changes_since_research: 0,
    last_researched: ts,
  };
  meta.last_external_research = ts;
  meta.external_research_stale_topics = (meta.external_research_stale_topics || [])
    .filter((topic) => topic !== domain);
  writeMetadata(projectDir, meta);
  return meta;
}

function reconcileDomainResearchFromRollups(projectDir, meta = getMetadata(projectDir)) {
  const researchCoverage = getResearchCoverage(projectDir);
  let changed = false;
  for (const [domain, entry] of Object.entries(meta.domains || {})) {
    const coverage = researchCoverage.topics[domain];
    if (!coverage || !coverage.exists || !coverage.non_empty || !coverage.updated_at) continue;
    const rollupMs = parseTimestampMs(coverage.updated_at);
    if (!rollupMs) continue;
    const normalizedEntry = normalizeDomainEntry(entry);
    const lastChangedMs = parseTimestampMs(normalizedEntry.last_changed);
    const lastResearchedMs = parseTimestampMs(normalizedEntry.last_researched);

    if (!lastResearchedMs || rollupMs > lastResearchedMs) {
      normalizedEntry.last_researched = coverage.updated_at;
      changed = true;
    }

    if ((normalizedEntry.changes_since_research || 0) > 0 && (!lastChangedMs || rollupMs >= lastChangedMs)) {
      normalizedEntry.changes_since_research = 0;
      normalizedEntry.last_researched = coverage.updated_at;
      changed = true;
    }
    meta.domains[domain] = normalizedEntry;
  }

  if (changed) writeMetadata(projectDir, meta);
  return meta;
}

function getKnowledgeStatus(projectDir) {
  let meta = reconcileIndexFromScanArtifacts(projectDir);
  meta = reconcileDomainResearchFromRollups(projectDir, meta);
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

const EXPECTED_KNOWLEDGE_FILES = [
  path.join('.claude', 'knowledge', 'mistakes.md'),
  path.join('.claude', 'knowledge', 'patterns.md'),
  path.join('.claude', 'knowledge', 'instruction-patches.md'),
  path.join('.claude', 'knowledge', 'worker-lessons.md'),
  path.join('.claude', 'knowledge', 'change-summaries.md'),
  path.join('.claude', 'knowledge', 'allocation-learnings.md'),
  path.join('.claude', 'knowledge', 'codebase-insights.md'),
  path.join('.claude', 'knowledge', 'user-preferences.md'),
];

const EXPECTED_KNOWLEDGE_DIRS = [
  CODEBASE_DOMAINS_RELATIVE,
  RESEARCH_TOPICS_RELATIVE,
];

function knowledgeHealthCheck(projectDir) {
  const missing = [];
  const present = [];

  for (const rel of EXPECTED_KNOWLEDGE_FILES) {
    const full = path.join(projectDir, rel);
    if (fs.existsSync(full)) {
      present.push(rel);
    } else {
      missing.push(rel);
    }
  }

  for (const rel of EXPECTED_KNOWLEDGE_DIRS) {
    const full = path.join(projectDir, rel);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        present.push(rel);
      } else {
        missing.push(rel);
      }
    } catch {
      missing.push(rel);
    }
  }

  return { ok: missing.length === 0, missing, present };
}

module.exports = {
  getMetadata,
  writeMetadata,
  incrementChanges,
  incrementWorkerPatches,
  updateIndexTimestamp,
  resetDomainResearch,
  reconcileIndexFromScanArtifacts,
  reconcileDomainResearchFromRollups,
  getDomainCoverage,
  getResearchCoverage,
  getKnowledgeStatus,
  knowledgeHealthCheck,
  getMetadataPath,
  EXPECTED_KNOWLEDGE_FILES,
  EXPECTED_KNOWLEDGE_DIRS,
};
