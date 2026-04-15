'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db');
const knowledgeMeta = require('./knowledge-metadata');

const SAFE_DOMAIN_RE = /^[A-Za-z0-9_-]+$/;
const FAILURE_TASK_STATUSES = Object.freeze([
  'failed',
  'failed_needs_reroute',
  'failed_final',
]);

function isSafeDomainSlug(domain) {
  if (typeof domain !== 'string') return false;
  const trimmed = domain.trim();
  if (!trimmed) return false;
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return false;
  return SAFE_DOMAIN_RE.test(trimmed);
}

function parseJsonMaybe(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizePathList(value) {
  const parsed = parseJsonMaybe(value, []);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function normalizeTaskIds(value) {
  const parsed = parseJsonMaybe(value, []);
  if (!Array.isArray(parsed)) return [];
  const ids = [];
  for (const item of parsed) {
    const id = Number.parseInt(item, 10);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function pushCommand(commands, label, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) pushCommand(commands, label, item);
    return;
  }
  if (typeof value === 'object') {
    commands.push({ label, command: JSON.stringify(value) });
    return;
  }
  const command = String(value).trim();
  if (command) commands.push({ label, command });
}

function normalizeValidation(value) {
  const parsed = parseJsonMaybe(value, null);
  const commands = [];
  let shorthand = null;

  if (parsed === null) {
    return {
      raw: null,
      explicit_commands: commands,
      shorthand,
      note: 'No task validation payload was provided.',
    };
  }

  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (/^tier[\s_-]*\d+$/i.test(trimmed)) {
      shorthand = trimmed;
    } else {
      pushCommand(commands, 'validation', trimmed);
    }
  } else if (Array.isArray(parsed)) {
    for (const item of parsed) pushCommand(commands, 'validation', item);
  } else if (parsed && typeof parsed === 'object') {
    pushCommand(commands, 'build', parsed.build_cmd);
    pushCommand(commands, 'test', parsed.test_cmd);
    pushCommand(commands, 'lint', parsed.lint_cmd);
    pushCommand(commands, 'custom', parsed.custom);
  } else {
    pushCommand(commands, 'validation', parsed);
  }

  return {
    raw: parsed,
    explicit_commands: commands,
    shorthand,
    note: commands.length > 0
      ? 'Run explicit task validation commands before completion.'
      : 'No explicit validation command was provided; use the smallest relevant local check and report it.',
  };
}

function readTextExcerpt(filePath, { maxLines = 80, maxChars = 12000 } = {}) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return null;
    const lines = content.split(/\r?\n/).slice(0, maxLines).join('\n');
    return lines.length > maxChars ? lines.slice(0, maxChars) : lines;
  } catch {
    return null;
  }
}

function resolveDomainKnowledge(projectDir, domain) {
  if (!isSafeDomainSlug(domain)) {
    return {
      domain: domain || null,
      found: false,
      path: null,
      content: null,
      source: null,
    };
  }

  const knowledgeDir = path.join(projectDir, '.claude', 'knowledge');
  const candidates = [
    {
      source: 'codebase_domain',
      filePath: path.join(knowledgeDir, 'codebase', 'domains', `${domain}.md`),
    },
    {
      source: 'legacy_domain_readme',
      filePath: path.join(knowledgeDir, 'domains', domain, 'README.md'),
    },
    {
      source: 'legacy_domain_file',
      filePath: path.join(knowledgeDir, 'domain', `${domain}.md`),
    },
  ];

  for (const candidate of candidates) {
    const content = readTextExcerpt(candidate.filePath);
    if (content) {
      return {
        domain,
        found: true,
        path: candidate.filePath,
        content,
        source: candidate.source,
      };
    }
  }

  return {
    domain,
    found: false,
    path: candidates[0].filePath,
    content: null,
    source: 'codebase_domain',
  };
}

function collectRelevantResearch(projectDir, domain, limit = 3) {
  if (!isSafeDomainSlug(domain)) return [];
  const researchDir = path.join(projectDir, '.claude', 'knowledge', 'research', 'topics');
  try {
    if (!fs.existsSync(researchDir)) return [];
    const domainLower = domain.toLowerCase();
    const topics = fs.readdirSync(researchDir)
      .filter((topic) => topic.toLowerCase().includes(domainLower))
      .sort();
    const results = [];
    for (const topic of topics) {
      const rollupPath = path.join(researchDir, topic, '_rollup.md');
      const content = readTextExcerpt(rollupPath, { maxLines: 40, maxChars: 6000 });
      if (!content) continue;
      results.push({ topic, path: rollupPath, content });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  }
}

function collectKnownPitfalls(projectDir) {
  const filePath = path.join(projectDir, '.claude', 'knowledge', 'mistakes.md');
  const content = readTextExcerpt(filePath, { maxLines: 120, maxChars: 16000 });
  return {
    path: filePath,
    content: content || '',
  };
}

function collectKnowledgeSignals(projectDir, domain) {
  let status = null;
  try {
    status = knowledgeMeta.getKnowledgeStatus(projectDir);
  } catch {
    status = null;
  }

  const domainEntry = status && status.domains && domain
    ? status.domains[domain] || null
    : null;
  const domainCoverage = status && status.domain_coverage && domain
    ? status.domain_coverage[domain] || null
    : null;

  return {
    changes_since_index: status ? status.changes_since_index || 0 : null,
    indexed_at: status ? status.indexed_at || null : null,
    domain_metadata: domainEntry,
    domain_coverage: domainCoverage,
  };
}

function selectWorkerFields(worker) {
  if (!worker) return null;
  return {
    id: worker.id,
    status: worker.status,
    domain: worker.domain,
    branch: worker.branch,
    worktree_path: worker.worktree_path,
    current_task_id: worker.current_task_id,
    backend: worker.backend || null,
    last_heartbeat: worker.last_heartbeat || null,
    launched_at: worker.launched_at || null,
  };
}

function selectRequestFields(request) {
  if (!request) return null;
  return {
    id: request.id,
    status: request.status,
    tier: request.tier,
    description: request.description,
    created_at: request.created_at,
    updated_at: request.updated_at,
    completed_at: request.completed_at,
    result: request.result,
  };
}

function selectTaskFields(task) {
  return {
    id: task.id,
    request_id: task.request_id,
    subject: task.subject,
    description: task.description,
    domain: task.domain,
    priority: task.priority,
    tier: task.tier,
    status: task.status,
    assigned_to: task.assigned_to,
    branch: task.branch,
    blocking: task.blocking,
    routing_class: task.routing_class,
    routed_model: task.routed_model,
    model_source: task.model_source,
    reasoning_effort: task.reasoning_effort,
    started_at: task.started_at,
    completed_at: task.completed_at,
    result: task.result,
  };
}

function selectSandboxFields(sandbox) {
  if (!sandbox) return null;
  return {
    id: sandbox.id,
    task_id: sandbox.task_id,
    worker_id: sandbox.worker_id,
    backend: sandbox.backend,
    status: sandbox.status,
    sandbox_name: sandbox.sandbox_name,
    sandbox_path: sandbox.sandbox_path,
    worktree_path: sandbox.worktree_path,
    branch: sandbox.branch,
    error: sandbox.error,
    started_at: sandbox.started_at,
    stopped_at: sandbox.stopped_at,
    cleaned_at: sandbox.cleaned_at,
  };
}

function collectRelatedTaskFailures(task, limit) {
  const domain = task.domain ? String(task.domain) : null;
  const clauses = ['id != ?', `status IN (${FAILURE_TASK_STATUSES.map(() => '?').join(',')})`];
  const params = [task.id, ...FAILURE_TASK_STATUSES];
  const related = ['request_id = ?'];
  const relatedParams = [task.request_id];
  if (domain) {
    related.push('domain = ?');
    relatedParams.push(domain);
  }

  const sql = `
    SELECT id, request_id, subject, domain, status, result, updated_at, completed_at
    FROM tasks
    WHERE ${clauses.join(' AND ')}
      AND (${related.join(' OR ')})
    ORDER BY datetime(COALESCE(completed_at, updated_at, created_at)) DESC, id DESC
    LIMIT ?
  `;
  return db.getDb().prepare(sql).all(...params, ...relatedParams, limit);
}

function collectRelatedMergeFailures(task, limit) {
  return db.getDb().prepare(`
    SELECT id, request_id, pr_url, branch, status, error, updated_at
    FROM merge_queue
    WHERE request_id = ?
      AND status = 'failed'
    ORDER BY datetime(COALESCE(updated_at, created_at)) DESC, id DESC
    LIMIT ?
  `).all(task.request_id, limit);
}

function collectRecentRelatedFailures(task, limit = 8) {
  return {
    tasks: collectRelatedTaskFailures(task, limit),
    merges: collectRelatedMergeFailures(task, limit),
  };
}

function buildTaskContextBundle({ taskId, projectDir, runtimeHealth = null } = {}) {
  const id = Number.parseInt(taskId, 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid task_id');
  const task = db.getTask(id);
  if (!task) throw new Error('Task not found');

  const request = db.getRequest(task.request_id);
  const worker = task.assigned_to ? db.getWorker(task.assigned_to) : null;
  const sandbox = db.getActiveTaskSandboxForTask(task.id);
  const domain = task.domain || null;
  const explicitFiles = normalizePathList(task.files);
  const overlapTaskIds = normalizeTaskIds(task.overlap_with);

  return {
    generated_at: new Date().toISOString(),
    project_dir: projectDir,
    task: selectTaskFields(task),
    assignment: {
      request: selectRequestFields(request),
      worker: selectWorkerFields(worker),
      task_sandbox: selectSandboxFields(sandbox),
    },
    safe_edit_files: {
      explicit: explicitFiles,
      overlap_task_ids: overlapTaskIds,
      mode: explicitFiles.length > 0 ? 'explicit_task_files' : 'domain_scoped',
      policy: explicitFiles.length > 0
        ? 'Edit only the listed files plus directly necessary adjacent tests or source helpers.'
        : 'No explicit files were supplied. Stay within the task domain and closely related source files; avoid generated/runtime paths.',
      context_map: path.join(projectDir, 'docs', 'agent-context-map.md'),
    },
    validation: normalizeValidation(task.validation),
    knowledge: {
      signals: collectKnowledgeSignals(projectDir, domain),
      domain: resolveDomainKnowledge(projectDir, domain),
      research: collectRelevantResearch(projectDir, domain),
      known_pitfalls: collectKnownPitfalls(projectDir),
    },
    recent_related_failures: collectRecentRelatedFailures(task),
    runtime_health: runtimeHealth,
  };
}

module.exports = {
  buildTaskContextBundle,
  normalizeValidation,
  normalizePathList,
  isSafeDomainSlug,
};
