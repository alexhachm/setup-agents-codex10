'use strict';

const fs = require('fs');
const path = require('path');
const DOMAIN_TOKEN_PATTERN = /^[a-z0-9._-]+$/;

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
    const validationLines = formatValidation(task.validation);
    if (validationLines.length > 0) {
      lines.push('## Validation');
      lines.push('');
      lines.push(...validationLines);
      lines.push('');
    }
  }

  // Add knowledge context if available
  const knowledgeDir = path.join(projectDir, '.claude', 'knowledge');
  const domainKnowledgeDir = path.resolve(knowledgeDir, 'domain');
  const domainKnowledgePath = resolveDomainKnowledgePath(domainKnowledgeDir, task.domain);
  if (task.domain && !domainKnowledgePath) {
    console.warn(`[overlay] Invalid task domain "${task.domain}"; skipping domain knowledge.`);
  }

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
  lines.push('- `mac10 complete-task <worker_id> <task_id> <pr_url> <branch>` — Report completion');
  lines.push('- `mac10 fail-task <worker_id> <task_id> <error>` — Report failure');
  lines.push('');

  return lines.join('\n');
}

function formatValidation(validation) {
  let value = validation;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      value = trimmed;
    }
  }

  if (typeof value === 'string') {
    return [`- \`${value}\``];
  }

  if (Array.isArray(value)) {
    const commands = value
      .map((entry) => typeof entry === 'string' ? entry.trim() : '')
      .filter(Boolean);
    return commands.map((cmd) => `- \`${cmd}\``);
  }

  if (value && typeof value === 'object') {
    const lines = [];
    if (value.build_cmd) lines.push(`- Build: \`${value.build_cmd}\``);
    if (value.test_cmd) lines.push(`- Test: \`${value.test_cmd}\``);
    if (value.lint_cmd) lines.push(`- Lint: \`${value.lint_cmd}\``);
    if (Array.isArray(value.commands)) {
      for (const cmd of value.commands) {
        if (typeof cmd === 'string' && cmd.trim()) lines.push(`- \`${cmd.trim()}\``);
      }
    }
    if (value.custom) lines.push(`- Custom: ${value.custom}`);
    return lines;
  }

  return [];
}

function resolveDomainKnowledgePath(domainKnowledgeDir, domainToken) {
  if (typeof domainToken !== 'string') return null;
  if (!DOMAIN_TOKEN_PATTERN.test(domainToken)) return null;

  const candidatePath = path.resolve(domainKnowledgeDir, `${domainToken}.md`);
  const relativePath = path.relative(domainKnowledgeDir, candidatePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return candidatePath;
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
5. **Report completion.** Run \`mac10 complete-task <worker_id> <task_id> <pr_url> <branch>\`.
6. **On failure.** Run \`mac10 fail-task <worker_id> <task_id> <error_description>\`.
7. **Stay in your domain.** Only modify files related to your assigned domain.
8. **Validate before shipping.** Build and test your changes before creating a PR.
`;
}

module.exports = { generateOverlay, writeOverlay, buildTaskOverlay };
