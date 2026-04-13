# Knowledge Layout

Canonical path: `.claude/knowledge/`

## Required Files

These files are provisioned from `templates/knowledge/` by `setup.sh` and checked by `mac10 knowledge-health`:

| File | Owner | Purpose |
|------|-------|---------|
| `mistakes.md` | Workers | Known errors to avoid repeating |
| `patterns.md` | Workers | Established patterns to follow |
| `instruction-patches.md` | Coordinator | Runtime instruction overrides targeting specific roles |
| `worker-lessons.md` | Workers | Lessons extracted from fix reports |
| `change-summaries.md` | Workers | Recent change context for orientation |
| `allocation-learnings.md` | Allocator | Routing and assignment heuristics |
| `codebase-insights.md` | Scan/research | High-level codebase observations |
| `user-preferences.md` | Master-1 | Communication style, priorities, approval preferences |

## Required Directories

| Directory | Purpose |
|-----------|---------|
| `codebase/domains/` | Per-domain knowledge files (`<domain>.md`) |
| `research/topics/` | External research results by topic |

## Other Files

| Path | Purpose |
|------|---------|
| `codebase/.metadata.json` | Scan/index timestamps and domain change counters |
| `codebase/intent.md` | High-level project intent |
| `loop-findings.md` | Runtime-generated loop iteration notes (not template-provisioned) |

## Legacy Paths

These paths are no longer created but `overlay.js` still falls back to them for older worktrees:

- `.claude/knowledge/domains/<domain>/README.md`
- `.claude/knowledge/domain/<domain>.md`

New domain files go in `codebase/domains/<domain>.md` only.
