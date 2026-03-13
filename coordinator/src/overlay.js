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

function parseTaskValidation(validation) {
  if (!validation) return null;

  let parsed = validation;
  if (typeof parsed === 'string') {
    for (let i = 0; i < 3; i += 1) {
      const trimmed = parsed.trim();
      if (!trimmed) return null;
      try {
        const next = JSON.parse(trimmed);
        if (next === parsed) break;
        parsed = next;
        if (typeof parsed !== 'string') break;
      } catch {
        break;
      }
    }
  }
  return parsed;
}

function isValidationTierShorthand(value) {
  if (typeof value !== 'string') return false;
  return /^tier[23]$/i.test(value.trim());
}

function collectValidationLines(parsedValidation) {
  const commandLines = [];
  const shorthand = new Set();

  function collect(value, label = null) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (isValidationTierShorthand(trimmed)) {
        shorthand.add(trimmed.toLowerCase());
        return;
      }
      if (label) {
        commandLines.push(`- ${label}: \`${trimmed}\``);
      } else {
        commandLines.push(`- Command: \`${trimmed}\``);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) collect(item, label);
      return;
    }

    if (!value || typeof value !== 'object') return;

    collect(value.build_cmd, 'Build');
    collect(value.test_cmd, 'Test');
    collect(value.lint_cmd, 'Lint');
    collect(value.custom, 'Custom');
  }

  collect(parsedValidation);

  const lines = [];
  for (const tier of shorthand) {
    lines.push(`- Validation tier metadata: \`${tier}\``);
  }
  if (shorthand.size > 0) {
    lines.push('- `tier2`/`tier3` are workflow metadata, not shell commands. Run only explicit task-provided validation commands.');
  }
  lines.push(...commandLines);

  return lines;
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
    const parsedValidation = parseTaskValidation(task.validation);
    const validationLines = collectValidationLines(parsedValidation);
    if (validationLines.length > 0) {
      lines.push('## Validation');
      lines.push('');
      lines.push(...validationLines);
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
8. **Validate before shipping.** Run only explicit validation commands provided by the task/validator (\`tier2\`/\`tier3\` are metadata, not commands).
`;
}

module.exports = { generateOverlay, writeOverlay, buildTaskOverlay };
