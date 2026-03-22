---
doc_kind: reference
scope: project
owner: domains/orchestration-docs
last_verified: 2026-03-16
rot_risk: high
related_paths:
  - coordinator/src/overlay.js
  - .codex/commands-codex10/worker-loop.md
  - templates/commands/worker-loop.md
  - templates/worker-claude.md
  - .codex/docs/master-3-role.md
  - templates/docs/master-3-role.md
---

# Orchestration Docs

## Executive Summary
- Governs worker-facing documentation, overlay protocol, and role-doc mirror synchronization
- Core concern: keeping overlay.js, worker-loop, and template mirrors semantically aligned
- Biggest foot-gun: dozens of overlap tasks on these files resolve as validation-only; editing when diff is empty creates noise
- Validation tier metadata (`tier2`/`tier3`) is NOT an executable command

## Invariants and Contracts
- Allocator wake path is `codex10 inbox allocator --block` (not signal files)
- `complete-task` syntax: `complete-task <worker_id> <task_id> [pr_url] [branch] [result] [--usage JSON]`
- Validation-only completions use result-only form to avoid placeholder misparse
- Mirror pairs must stay byte-for-byte identical:
  - `templates/docs/master-3-role.md` <-> `.codex/docs/master-3-role.md`
  - `templates/commands/worker-loop.md` <-> `.codex/commands-codex10/worker-loop.md`

## Key Patterns
- **Validation-only workflow**: run `git diff origin/main -- <scoped files>` immediately after sync; if empty + tests pass, close as validation-only
- **Mirror sync**: use SHA-256 comparison first to detect no-op parity before making edits
- **Branch parsing**: keep suffix-safe with `sed -E 's/^agent-([0-9]+).*/\1/'`
- **Overlay validation rendering**: `coordinator/src/overlay.js` must handle string, array, and object validation payloads

## Pitfalls
- **Validation tier confusion**: `tier2`/`tier3` are workflow metadata, NOT shell commands. Workers must run only explicit task-provided commands.
- **Overlap task churn**: most overlap/merge-conflict tasks on overlay+worker-loop files resolve as validation-only. Always check scoped diff before editing.
- **Backlog count inflation**: `grep '\[pending\]'` matches descriptions containing the token; use anchored awk predicates instead.

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
