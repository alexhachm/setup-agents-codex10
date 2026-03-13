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

function formatValidationScalar(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function normalizeValidationPayload(validation) {
  if (validation == null) return null;

  let parsed = validation;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { type: 'string', value: trimmed };
    }
  }

  if (Array.isArray(parsed)) {
    const commands = parsed
      .map((item) => formatValidationScalar(item) || JSON.stringify(item))
      .filter((item) => item && item !== 'null');
    if (commands.length === 0) return null;
    return { type: 'array', commands };
  }

  if (parsed && typeof parsed === 'object') {
    return { type: 'object', value: parsed };
  }

  const scalar = formatValidationScalar(parsed);
  return scalar ? { type: 'string', value: scalar } : null;
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

  const validation = normalizeValidationPayload(task.validation);
  if (validation) {
    lines.push('## Validation');
    lines.push('');
    lines.push('- Note: `validation` shorthand (for example `tier2` / `tier3`) is workflow metadata. Run explicit task commands only; never infer implicit `npm run build`.');
    if (validation.type === 'string') {
      lines.push(`- Validation: \`${validation.value}\``);
    } else if (validation.type === 'array') {
      for (const command of validation.commands) {
        lines.push(`- Command: \`${command}\``);
      }
    } else {
      const val = validation.value;
      let hasStructuredField = false;
      if (val.build_cmd) {
        lines.push(`- Build: \`${val.build_cmd}\``);
        hasStructuredField = true;
      }
      if (val.test_cmd) {
        lines.push(`- Test: \`${val.test_cmd}\``);
        hasStructuredField = true;
      }
      if (val.lint_cmd) {
        lines.push(`- Lint: \`${val.lint_cmd}\``);
        hasStructuredField = true;
      }
      if (Array.isArray(val.custom)) {
        for (const customEntry of val.custom) {
          const custom = formatValidationScalar(customEntry) || JSON.stringify(customEntry);
          if (custom && custom !== 'null') {
            lines.push(`- Custom: ${custom}`);
            hasStructuredField = true;
          }
        }
      } else if (val.custom != null) {
        const custom = formatValidationScalar(val.custom) || JSON.stringify(val.custom);
        if (custom && custom !== 'null') {
          lines.push(`- Custom: ${custom}`);
          hasStructuredField = true;
        }
      }
      if (!hasStructuredField) {
        lines.push(`- Payload: \`${JSON.stringify(val)}\``);
      }
    }
    lines.push('');
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
  lines.push('- Validation policy: run only explicit task-provided commands. Treat shorthand values like `tier2`/`tier3` as metadata and never infer implicit `npm run build`.');
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
8. **Validate before shipping.** Run only explicit validation commands listed in the task details; treat shorthand values like \`tier2\`/\`tier3\` as metadata and never infer implicit \`npm run build\`.
`;
}

module.exports = { generateOverlay, writeOverlay, buildTaskOverlay };
