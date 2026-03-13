'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Generate per-task instruction overlay for a worker.
 * Two-layer system:
 *   1. Base role doc — defines worker role + tools
 *   2. Task overlay — appended section with task-specific context
 */
function generateOverlay(task, worker, projectDir) {
  const workerAgentsMd = path.join(projectDir, '.claude', 'worker-agents.md');
  const workerClaudeMd = path.join(projectDir, '.claude', 'worker-claude.md');
  let base = '';
  try {
    if (fs.existsSync(workerAgentsMd)) {
      base = fs.readFileSync(workerAgentsMd, 'utf8');
    } else {
      base = fs.readFileSync(workerClaudeMd, 'utf8');
    }
  } catch {
    base = getDefaultWorkerBase();
  }

  const overlay = buildTaskOverlay(task, worker, projectDir);
  return base + '\n\n' + overlay;
}

const SAFE_DOMAIN_RE = /^[A-Za-z0-9_-]+$/;

function isSafeDomainSlug(domain) {
  if (typeof domain !== 'string') return false;
  const trimmed = domain.trim();
  if (!trimmed) return false;
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return false;
  return SAFE_DOMAIN_RE.test(trimmed);
}

function resolveDomainKnowledgePath(domain, knowledgeDir) {
  if (!isSafeDomainSlug(domain)) return null;
  const domainDir = path.resolve(knowledgeDir, 'domain');
  const filePath = path.resolve(domainDir, `${domain.trim()}.md`);
  const rel = path.relative(domainDir, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return filePath;
}

function parseValidationPayload(rawValidation) {
  if (rawValidation == null) return null;
  if (typeof rawValidation !== 'string') return rawValidation;
  const trimmed = rawValidation.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function isTierShorthand(value) {
  return typeof value === 'string' && /^tier[23]$/i.test(value.trim());
}

function pushTierMetadataNote(lines) {
  lines.push('- Note: `tier2`/`tier3` are workflow metadata. Run only explicit task commands; do not assume `npm run build`.');
}

function pushCommandLine(lines, label, value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  lines.push(`- ${label}: \`${trimmed}\``);
  return true;
}

function appendValidationObject(lines, value, flags) {
  let emitted = false;
  emitted = pushCommandLine(lines, 'Build', value.build_cmd) || emitted;
  emitted = pushCommandLine(lines, 'Test', value.test_cmd) || emitted;
  emitted = pushCommandLine(lines, 'Lint', value.lint_cmd) || emitted;
  emitted = pushCommandLine(lines, 'Command', value.command) || emitted;
  emitted = pushCommandLine(lines, 'Command', value.cmd) || emitted;

  if (Array.isArray(value.commands)) {
    for (const cmd of value.commands) {
      if (pushCommandLine(lines, 'Command', cmd)) emitted = true;
    }
  }

  if (typeof value.custom === 'string' && value.custom.trim()) {
    lines.push(`- Custom: ${value.custom.trim()}`);
    emitted = true;
  }

  if (typeof value.tier === 'string' && value.tier.trim()) {
    const tierValue = value.tier.trim();
    lines.push(`- Tier: \`${tierValue}\``);
    if (isTierShorthand(tierValue)) flags.needsTierNote = true;
    emitted = true;
  }

  if (!emitted) {
    const compact = JSON.stringify(value);
    if (compact && compact !== '{}') {
      lines.push(`- Validation metadata: \`${compact}\``);
      emitted = true;
    }
  }

  return emitted;
}

function appendValidationLines(lines, validation) {
  const flags = { needsTierNote: false };
  let emitted = false;

  if (typeof validation === 'string') {
    const trimmed = validation.trim();
    if (trimmed) {
      lines.push(`- Validation: \`${trimmed}\``);
      if (isTierShorthand(trimmed)) flags.needsTierNote = true;
      emitted = true;
    }
  } else if (Array.isArray(validation)) {
    for (const entry of validation) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        lines.push(`- Command: \`${trimmed}\``);
        if (isTierShorthand(trimmed)) flags.needsTierNote = true;
        emitted = true;
        continue;
      }
      if (entry && typeof entry === 'object') {
        emitted = appendValidationObject(lines, entry, flags) || emitted;
      }
    }
  } else if (validation && typeof validation === 'object') {
    emitted = appendValidationObject(lines, validation, flags) || emitted;
  }

  if (flags.needsTierNote) pushTierMetadataNote(lines);
  return emitted;
}

function buildTaskOverlay(task, worker, projectDir) {
  const lines = [
    '# Current Task',
    '',
    `**Task ID:** ${task.id}`,
    `**Request ID:** ${task.request_id}`,
    `**Subject:** ${task.subject}`,
    `**Tier:** ${task.tier}`,
    `**Priority:** ${task.priority}`,
    `**Domain:** ${task.domain || 'unset'}`,
    '',
    '## Description',
    '',
    task.description,
    '',
  ];

  if (task.files) {
    let files;
    try {
      files = typeof task.files === 'string' ? JSON.parse(task.files) : task.files;
    } catch { files = []; }
    if (Array.isArray(files) && files.length > 0) {
      lines.push('## Files to Modify');
      lines.push('');
      for (const f of files) lines.push(`- ${f}`);
      lines.push('');
    }
  }

  if (task.validation) {
    const val = parseValidationPayload(task.validation);
    if (val != null) {
      lines.push('## Validation');
      lines.push('');
      appendValidationLines(lines, val);
      lines.push('');
    }
  }

  // Add knowledge context if available
  const knowledgeDir = path.join(projectDir, '.claude', 'knowledge');
  const domainKnowledgePath = resolveDomainKnowledgePath(task.domain, knowledgeDir);
  if (domainKnowledgePath && fs.existsSync(domainKnowledgePath)) {
    try {
      const domainKnowledge = fs.readFileSync(domainKnowledgePath, 'utf8');
      if (domainKnowledge.trim()) {
        lines.push('## Domain Knowledge');
        lines.push('');
        lines.push(domainKnowledge.trim());
        lines.push('');
      }
    } catch {}
  }

  // Add recent mistakes if any
  try {
    const mistakes = fs.readFileSync(path.join(knowledgeDir, 'mistakes.md'), 'utf8');
    if (mistakes.trim()) {
      lines.push('## Known Pitfalls');
      lines.push('');
      lines.push(mistakes.trim());
      lines.push('');
    }
  } catch {}

  lines.push('## Worker Info');
  lines.push('');
  lines.push(`- Worker ID: ${worker.id}`);
  lines.push(`- Branch: ${worker.branch || `agent-${worker.id}`}`);
  lines.push(`- Worktree: ${worker.worktree_path || 'unknown'}`);
  lines.push('');
  lines.push('## Protocol');
  lines.push('');
  lines.push('Use `mac10` CLI for all coordination:');
  lines.push('- `mac10 start-task <worker_id> <task_id>` — Mark task as started');
  lines.push('- `mac10 heartbeat <worker_id>` — Send heartbeat (every 30s during work)');
  lines.push('- `mac10 complete-task <worker_id> <task_id> [pr_url] [branch] [result] [--usage JSON]` — Report completion (include usage telemetry when available)');
  lines.push('- `mac10 fail-task <worker_id> <task_id> <error>` — Report failure');
  lines.push('');

  return lines.join('\n');
}

function writeOverlay(task, worker, projectDir) {
  const content = generateOverlay(task, worker, projectDir);
  const worktreeDir = worker.worktree_path || path.join(projectDir, '.worktrees', `wt-${worker.id}`);
  const claudePath = path.join(worktreeDir, 'CLAUDE.md');
  const agentsPath = path.join(worktreeDir, 'AGENTS.md');

  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  // Keep legacy CLAUDE.md while also writing AGENTS.md for Codex compatibility.
  fs.writeFileSync(claudePath, content, 'utf8');
  fs.writeFileSync(agentsPath, content, 'utf8');

  return agentsPath;
}

function getDefaultWorkerBase() {
  return `# Worker Agent

You are a coding worker in the mac10 multi-agent system. You receive tasks from the coordinator and execute them autonomously.

## Core Rules

1. **One task at a time.** Check your task with \`mac10 my-task <worker_id>\`.
2. **Start before coding.** Run \`mac10 start-task <worker_id> <task_id>\` first.
3. **Heartbeat every 30s.** Run \`mac10 heartbeat <worker_id>\` periodically during work.
4. **Ship via /commit-push-pr.** Create a PR for your changes.
5. **Report completion.** Run \`mac10 complete-task <worker_id> <task_id> [pr_url] [branch] [result] [--usage JSON]\` and include usage telemetry when available.
6. **On failure.** Run \`mac10 fail-task <worker_id> <task_id> <error_description>\`.
7. **Stay in your domain.** Only modify files related to your assigned domain.
8. **Validate before shipping.** Build and test your changes before creating a PR.
`;
}

module.exports = { generateOverlay, writeOverlay, buildTaskOverlay };
