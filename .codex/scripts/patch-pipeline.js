#!/usr/bin/env node
/**
 * patch-pipeline.js — Governed instruction-refinement pipeline
 *
 * Manages the lifecycle of instruction patch proposals sourced from validated
 * memory insights (distill summaries, curation observations, vote signals).
 *
 * Governance gates:
 *   - Role doc patches (*-role.md):  require ≥3 observations before approval
 *   - Knowledge/domain patches:      require ≥1 observation before approval
 *   - Approval requires non-anonymous reviewer attribution
 *   - Application requires prior approval (no bypassing)
 *   - All state transitions are recorded in patches.json (audit trail)
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SCRIPT_DIR    = path.dirname(path.resolve(__filename));
const KNOWLEDGE_DIR = path.join(SCRIPT_DIR, '..', 'knowledge');
const DOCS_DIR      = path.join(SCRIPT_DIR, '..', 'docs');

const PATCHES_FILE = path.join(KNOWLEDGE_DIR, 'instruction-patches.md');
const PATCHES_JSON = path.join(KNOWLEDGE_DIR, 'patches.json');

// Governance thresholds
const THRESHOLD_ROLE       = 3;  // observations required for *-role.md patches
const THRESHOLD_KNOWLEDGE  = 1;  // observations required for knowledge/domain patches

// Keywords that suggest an instruction improvement in distill content
const PATCH_SIGNAL_PATTERNS = [
  { re: /\b(always|never|must|should)\b.*\b(before|after|when|unless)\b/i, hint: 'procedural rule' },
  { re: /\b(avoid|prevent|don['']t)\b.{5,60}/i,                            hint: 'anti-pattern' },
  { re: /\b(caused by|root cause|fix|workaround)\b.{5,60}/i,               hint: 'pitfall fix' },
  { re: /\brepeated(ly)?\b|\bkeep(s)? (making|hitting|forgetting)\b/i,     hint: 'recurring issue' },
];

// ─── State helpers ──────────────────────────────────────────────────────────

function getThreshold(target) {
  return (target.includes('-role') || target === 'worker' || target === 'architect')
    ? THRESHOLD_ROLE
    : THRESHOLD_KNOWLEDGE;
}

function loadState() {
  if (!fs.existsSync(PATCHES_JSON)) {
    return { patches: [], next_id: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(PATCHES_JSON, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Could not parse ${PATCHES_JSON}: ${e.message}`);
    process.exit(1);
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(PATCHES_JSON), { recursive: true });
  fs.writeFileSync(PATCHES_JSON, JSON.stringify(state, null, 2));
  renderMarkdown(state);
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderMarkdown(state) {
  const L = [];
  const push = (...lines) => lines.forEach(l => L.push(l));

  push(
    '# Instruction Patches',
    '',
    'Governed pipeline for proposing instruction improvements from validated learnings.',
    'Patches are sourced from distill summaries, curation cycles, and agent observations.',
    '',
    '## Governance Gates',
    `- Role/agent doc patches (\`*-role.md\`, \`worker\`, \`architect\`): ≥${THRESHOLD_ROLE} observations before approval`,
    `- Knowledge/domain patches: ≥${THRESHOLD_KNOWLEDGE} observation before approval`,
    '- All patches require explicit human reviewer attribution (non-anonymous) before application',
    '- Applied patches are immutably recorded in the audit trail; they cannot be un-applied via this pipeline',
    '',
    '## Pipeline Commands',
    '```',
    'codex10 propose-patch <target> <summary> <pattern> <suggestion> [--by <agent>] [--rationale <text>] [--evidence <text>]',
    'codex10 observe-patch  <patch-id> <evidence>',
    'codex10 approve-patch  <patch-id> <reviewer>',
    'codex10 apply-patch    <patch-id>',
    'codex10 reject-patch   <patch-id> <reviewer> [reason]',
    'codex10 list-patches   [--status proposed|approved|applied|rejected|all]',
    'codex10 scan-distills  <domain> <content>',
    '```',
    '',
  );

  // ── Pending proposals ──────────────────────────────────────────────────────
  const pending = state.patches.filter(p => p.status === 'proposed' || p.status === 'approved');
  push('## Pending Proposals', '');
  if (pending.length === 0) {
    push('(none)', '');
  } else {
    for (const p of pending) {
      const threshold = getThreshold(p.target);
      const score     = `${p.observations.length}/${threshold}`;
      const ready     = p.observations.length >= threshold ? ' ✓ READY FOR REVIEW' : '';
      push(
        `### ${p.id} [${p.target}] — ${p.summary}`,
        `**Status:** ${p.status}  |  **Score:** ${score}${ready}`,
        `**Pattern observed:** ${p.pattern}`,
        `**Suggested change:** ${p.suggestion}`,
      );
      if (p.rationale) push(`**Rationale:** ${p.rationale}`);
      if (p.observations.length > 0) {
        push('**Evidence:**');
        for (const o of p.observations) push(`- ${o.date}: ${o.text}`);
      }
      push(`**Proposed by:** ${p.proposed_by} at ${p.proposed_at}`);
      if (p.reviewed_by) push(`**Reviewed by:** ${p.reviewed_by} at ${p.reviewed_at}`);
      push('');
    }
  }

  // ── Audit trail ────────────────────────────────────────────────────────────
  const terminal = state.patches.filter(p => p.status === 'applied' || p.status === 'rejected');
  push('## Applied Patches (Audit Trail)', '');
  if (terminal.length === 0) {
    push('(none)', '');
  } else {
    for (const p of terminal) {
      const icon = p.status === 'applied' ? '✅' : '❌';
      push(
        `### ${icon} ${p.id} [${p.target}] — ${p.summary}`,
        `**Status:** ${p.status}  |  **Observations:** ${p.observations.length}/${getThreshold(p.target)}`,
        `**Pattern:** ${p.pattern}`,
        `**Reviewed by:** ${p.reviewed_by || 'N/A'}  |  **At:** ${p.reviewed_at || 'N/A'}`,
      );
      if (p.rejection_reason) push(`**Rejection reason:** ${p.rejection_reason}`);
      if (p.applied_at)       push(`**Applied at:** ${p.applied_at}`);
      push('');
    }
  }

  fs.mkdirSync(path.dirname(PATCHES_FILE), { recursive: true });
  fs.writeFileSync(PATCHES_FILE, L.join('\n'));
}

// ─── Target file resolution ──────────────────────────────────────────────────

function findTargetFile(target) {
  const candidates = [
    path.join(DOCS_DIR,      target),
    path.join(KNOWLEDGE_DIR, target),
    path.join(KNOWLEDGE_DIR, 'handbook', target),
    path.join(KNOWLEDGE_DIR, 'domain',   target),
    path.join(KNOWLEDGE_DIR, 'domains',  target),
  ];
  return candidates.find(c => fs.existsSync(c)) || null;
}

// ─── Deduplication helper ────────────────────────────────────────────────────

function normalize(s) { return s.toLowerCase().replace(/\s+/g, ' ').trim(); }

function findDuplicate(state, target, pattern) {
  const normPat = normalize(pattern);
  return state.patches.find(p =>
    p.target === target &&
    (p.status === 'proposed' || p.status === 'approved') &&
    (normalize(p.pattern).includes(normPat.slice(0, 50)) ||
     normPat.includes(normalize(p.pattern).slice(0, 50)))
  ) || null;
}

// ─── Command dispatch ─────────────────────────────────────────────────────────

const [, , cmd, ...rest] = process.argv;

switch (cmd) {

  // ---------------------------------------------------------------------------
  case 'propose-patch': {
    const [target, summary, pattern, suggestion, ...flags] = rest;
    if (!target || !summary || !pattern || !suggestion) {
      console.error('Usage: codex10 propose-patch <target> <summary> <pattern> <suggestion> [--by <agent>] [--rationale <text>] [--evidence <text>]');
      console.error('  <target>: agent/doc to patch (e.g. worker, master-2-role.md, patterns.md)');
      process.exit(1);
    }

    let by = 'auto', rationale = '', evidence = '';
    for (let i = 0; i < flags.length; i++) {
      if (flags[i] === '--by')        { by        = flags[++i] || by;        }
      else if (flags[i] === '--rationale') { rationale = flags[++i] || rationale; }
      else if (flags[i] === '--evidence')  { evidence  = flags[++i] || evidence;  }
    }

    const state = loadState();
    const dup = findDuplicate(state, target, pattern);
    if (dup) {
      console.log(`Duplicate detected — ${dup.id} already covers this pattern.`);
      console.log(`Add evidence with: codex10 observe-patch ${dup.id} "<evidence>"`);
      console.log(`existing:${dup.id}`);
      process.exit(0);
    }

    const now  = new Date().toISOString();
    const id   = `PATCH-${String(state.next_id).padStart(3, '0')}`;
    state.patches.push({
      id, target, summary, pattern, suggestion, rationale,
      status: 'proposed',
      observations: evidence ? [{ date: now, text: evidence }] : [],
      proposed_by: by, proposed_at: now,
      reviewed_by: null, reviewed_at: null, applied_at: null,
    });
    state.next_id += 1;
    saveState(state);

    const threshold = getThreshold(target);
    const needed    = Math.max(0, threshold - (evidence ? 1 : 0));
    console.log(`Patch proposed: ${id} (target: ${target}, status: proposed)`);
    if (needed > 0) {
      console.log(`Needs ${needed} more observation(s) before it can be approved.`);
    } else {
      console.log(`✓ Threshold met — ready for: codex10 approve-patch ${id} <reviewer>`);
    }
    break;
  }

  // ---------------------------------------------------------------------------
  case 'observe-patch': {
    const [patchId, ...evidenceParts] = rest;
    const evidence = evidenceParts.join(' ');
    if (!patchId || !evidence) {
      console.error('Usage: codex10 observe-patch <patch-id> <evidence>');
      process.exit(1);
    }

    const state = loadState();
    const p = state.patches.find(x => x.id === patchId);
    if (!p) { console.error(`Patch not found: ${patchId}`); process.exit(1); }
    if (p.status === 'applied' || p.status === 'rejected') {
      console.error(`Patch ${patchId} is already terminal (${p.status})`); process.exit(1);
    }

    const now = new Date().toISOString();
    p.observations.push({ date: now, text: evidence });
    const threshold = getThreshold(p.target);
    saveState(state);

    console.log(`Observation added to ${patchId} — score: ${p.observations.length}/${threshold}`);
    if (p.observations.length >= threshold && p.status === 'proposed') {
      console.log(`✓ Threshold reached — approve with: codex10 approve-patch ${patchId} <reviewer>`);
    }
    break;
  }

  // ---------------------------------------------------------------------------
  case 'approve-patch': {
    const [patchId, reviewer] = rest;
    if (!patchId || !reviewer) {
      console.error('Usage: codex10 approve-patch <patch-id> <reviewer>');
      process.exit(1);
    }
    if (reviewer === 'auto' || reviewer === '') {
      console.error('GOVERNANCE GATE: Reviewer attribution required — must be a named human reviewer, not "auto".');
      process.exit(2);
    }

    const state = loadState();
    const p = state.patches.find(x => x.id === patchId);
    if (!p) { console.error(`Patch not found: ${patchId}`); process.exit(1); }
    if (p.status !== 'proposed') {
      console.error(`Patch ${patchId} is not in proposed state (current: ${p.status})`); process.exit(1);
    }

    const threshold = getThreshold(p.target);
    if (p.observations.length < threshold) {
      console.error(
        `GOVERNANCE GATE: Patch ${patchId} has ${p.observations.length}/${threshold} observations.` +
        ` Needs ${threshold - p.observations.length} more before approval.`
      );
      console.error(`  Add evidence with: codex10 observe-patch ${patchId} "<observation>"`);
      process.exit(2);
    }

    const now = new Date().toISOString();
    p.status      = 'approved';
    p.reviewed_by = reviewer;
    p.reviewed_at = now;
    saveState(state);

    console.log(`Patch ${patchId} approved by ${reviewer}.`);
    console.log(`Apply with: codex10 apply-patch ${patchId}`);
    break;
  }

  // ---------------------------------------------------------------------------
  case 'apply-patch': {
    const [patchId] = rest;
    if (!patchId) {
      console.error('Usage: codex10 apply-patch <patch-id>');
      process.exit(1);
    }

    const state = loadState();
    const p = state.patches.find(x => x.id === patchId);
    if (!p) { console.error(`Patch not found: ${patchId}`); process.exit(1); }
    if (p.status !== 'approved') {
      console.error(`GOVERNANCE GATE: Patch ${patchId} must be approved before applying (current: ${p.status}).`);
      process.exit(2);
    }

    const now        = new Date().toISOString();
    const targetFile = findTargetFile(p.target);

    if (targetFile) {
      const changelog = [
        '',
        `<!-- Applied patch ${p.id} — approved by ${p.reviewed_by} on ${now} -->`,
        `## Applied: ${p.summary} (${p.id})`,
        `> Reviewed by ${p.reviewed_by} | Applied ${now}`,
        '',
        p.suggestion,
        '',
      ].join('\n');
      fs.appendFileSync(targetFile, changelog);
      console.log(`Patch ${patchId} appended to: ${targetFile}`);
    } else {
      console.warn(`WARNING: Target file '${p.target}' not found in docs/ or knowledge/.`);
      console.warn('The patch is recorded but must be applied manually to the target document.');
      console.warn(`Suggested change:\n${p.suggestion}`);
    }

    p.status     = 'applied';
    p.applied_at = now;
    saveState(state);
    console.log(`Patch ${patchId} marked as applied. Audit trail updated.`);
    break;
  }

  // ---------------------------------------------------------------------------
  case 'reject-patch': {
    const [patchId, reviewer, ...reasonParts] = rest;
    if (!patchId || !reviewer) {
      console.error('Usage: codex10 reject-patch <patch-id> <reviewer> [reason]');
      process.exit(1);
    }

    const state = loadState();
    const p = state.patches.find(x => x.id === patchId);
    if (!p) { console.error(`Patch not found: ${patchId}`); process.exit(1); }
    if (p.status === 'applied') {
      console.error(`Patch ${patchId} is already applied — cannot reject.`); process.exit(1);
    }

    const now   = new Date().toISOString();
    const reason = reasonParts.join(' ');
    p.status      = 'rejected';
    p.reviewed_by = reviewer;
    p.reviewed_at = now;
    if (reason) p.rejection_reason = reason;
    saveState(state);
    console.log(`Patch ${patchId} rejected by ${reviewer}.`);
    break;
  }

  // ---------------------------------------------------------------------------
  case 'list-patches': {
    const filterIdx = rest.indexOf('--status');
    const filter    = filterIdx >= 0 ? rest[filterIdx + 1] : 'all';
    const state     = loadState();
    // Always render to keep instruction-patches.md in sync (idempotent)
    saveState(state);
    const patches   = filter === 'all' ? state.patches : state.patches.filter(p => p.status === filter);

    if (patches.length === 0) {
      console.log(`No patches found${filter !== 'all' ? ` with status '${filter}'` : ''}.`);
      break;
    }

    for (const p of patches) {
      const threshold = getThreshold(p.target);
      const score     = `${p.observations.length}/${threshold}`;
      const ready     = (p.observations.length >= threshold && p.status === 'proposed') ? ' [READY]' : '';
      console.log(`${p.id} [${p.status.toUpperCase()}] target=${p.target} score=${score}${ready}`);
      console.log(`  ${p.summary}`);
      if (p.reviewed_by) console.log(`  Reviewed by: ${p.reviewed_by} at ${p.reviewed_at}`);
      console.log('');
    }
    break;
  }

  // ---------------------------------------------------------------------------
  case 'scan-distills': {
    /**
     * Analyzes distill content for patterns that suggest instruction improvements.
     * Called automatically by the codex10 wrapper after a distill command, and
     * by master-2 during curation cycles.
     *
     * Usage: codex10 scan-distills <domain> <content>
     *
     * Outputs: JSON array of candidate proposals, or an empty array if none found.
     * The caller is responsible for deciding whether to call propose-patch.
     */
    const [domain, ...contentParts] = rest;
    const content = contentParts.join(' ');
    if (!domain || !content) {
      console.error('Usage: codex10 scan-distills <domain> <content>');
      process.exit(1);
    }

    const candidates = [];
    const sentences  = content
      .replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);

    for (const sentence of sentences) {
      for (const { re, hint } of PATCH_SIGNAL_PATTERNS) {
        if (re.test(sentence)) {
          // Determine target: domain-specific knowledge or general worker instructions
          const target = domain.includes('role') || domain.includes('agent')
            ? domain
            : 'worker';
          candidates.push({
            target,
            hint,
            sentence,
            suggested_command: `codex10 propose-patch ${target} "Distill insight from ${domain}" "${sentence.slice(0, 80)}" "<refined suggestion>" --by auto --evidence "${sentence.slice(0, 120)}"`,
          });
          break; // one signal per sentence is enough
        }
      }
    }

    if (candidates.length === 0) {
      process.stdout.write(JSON.stringify([]) + '\n');
    } else {
      process.stdout.write(JSON.stringify(candidates, null, 2) + '\n');
    }
    break;
  }

  // ---------------------------------------------------------------------------
  default:
    console.error(`Unknown patch-pipeline command: ${cmd || '(none)'}`);
    console.error('Available commands: propose-patch, observe-patch, approve-patch, apply-patch,');
    console.error('                    reject-patch, list-patches, scan-distills');
    process.exit(1);
}
