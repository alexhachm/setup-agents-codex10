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

function parseValidationSpec(validation) {
  if (validation === undefined || validation === null) return null;

  if (typeof validation === 'string') {
    const trimmed = validation.trim();
    if (!trimmed) return null;
    try {
      return parseValidationSpec(JSON.parse(trimmed));
    } catch {
      return { type: 'string', value: trimmed };
    }
  }

  if (Array.isArray(validation)) {
    return {
      type: 'array',
      value: validation
        .filter((entry) => typeof entry === 'string' && entry.trim())
        .map((entry) => entry.trim()),
    };
  }

  if (typeof validation === 'object') {
    return { type: 'object', value: validation };
  }

  return { type: 'string', value: String(validation) };
}

function isTierValidationShorthand(value) {
  return typeof value === 'string' && /^tier[23]$/i.test(value.trim());
}

function appendValidationNoImplicitBuildNote(lines) {
  lines.push('- Note: Validation shorthand (`tier2`/`tier3`) is metadata only. Run task-provided commands and never assume implicit `npm run build`.');
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

  const validationSpec = parseValidationSpec(task.validation);
  if (validationSpec) {
    lines.push('## Validation');
    lines.push('');

    let hasCommand = false;
    let usedTierShorthand = false;

    if (validationSpec.type === 'string') {
      if (isTierValidationShorthand(validationSpec.value)) {
        usedTierShorthand = true;
        lines.push(`- Validation metadata: \`${validationSpec.value}\``);
      } else {
        hasCommand = true;
        lines.push(`- Command: \`${validationSpec.value}\``);
      }
    } else if (validationSpec.type === 'array') {
      if (validationSpec.value.length > 0) {
        hasCommand = true;
        for (const command of validationSpec.value) {
          lines.push(`- Command: \`${command}\``);
        }
      } else {
        lines.push('- Validation metadata: empty command list');
      }
    } else {
      const val = validationSpec.value;
      if (val.build_cmd) {
        hasCommand = true;
        lines.push(`- Build: \`${val.build_cmd}\``);
      }
      if (val.test_cmd) {
        hasCommand = true;
        lines.push(`- Test: \`${val.test_cmd}\``);
      }
      if (val.lint_cmd) {
        hasCommand = true;
        lines.push(`- Lint: \`${val.lint_cmd}\``);
      }
      if (typeof val.command === 'string' && val.command.trim()) {
        hasCommand = true;
        lines.push(`- Command: \`${val.command.trim()}\``);
      }
      if (Array.isArray(val.commands)) {
        const commands = val.commands
          .filter((entry) => typeof entry === 'string' && entry.trim())
          .map((entry) => entry.trim());
        if (commands.length > 0) {
          hasCommand = true;
          for (const command of commands) {
            lines.push(`- Command: \`${command}\``);
          }
        }
      }
      if (typeof val.custom === 'string' && val.custom.trim()) {
        hasCommand = true;
        lines.push(`- Custom: ${val.custom.trim()}`);
      }
      if (typeof val.tier === 'string' && isTierValidationShorthand(val.tier)) {
        usedTierShorthand = true;
        lines.push(`- Validation metadata: \`${val.tier.trim()}\``);
      }
      if (!hasCommand && !usedTierShorthand) {
        try {
          lines.push(`- Validation metadata: \`${JSON.stringify(val)}\``);
        } catch {
          lines.push('- Validation metadata: [unserializable object]');
        }
      }
    }

    if (!hasCommand || usedTierShorthand) {
      appendValidationNoImplicitBuildNote(lines);
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
8. **Validate before shipping.** Run only explicit task-provided commands. If validation is \`tier2\`/\`tier3\`, treat it as metadata and do not assume implicit \`npm run build\`.
`;
}

module.exports = { generateOverlay, writeOverlay, buildTaskOverlay };
