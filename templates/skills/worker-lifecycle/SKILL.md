---
name: worker-lifecycle
description: Understand and manage worker agent lifecycle, heartbeat monitoring, isolation backends, and recovery patterns. Use when workers are stuck, crashed, or unresponsive.
---

# Worker Lifecycle

Manage worker agent lifecycle and diagnose health issues.

## Worker States

```
idle → assigned → working → complete → idle (next task)
                          → failed → idle (reassignment)
```

## Heartbeat & Liveness (4-tier escalation)

| Level | Threshold | Action |
|-------|-----------|--------|
| Warn | 60s | Log warning |
| Nudge | 90s | Send mail to worker |
| Triage | 120s | Notify Master-3 for reassignment |
| Terminate | 180s | Kill process, reassign task |

Configurable via DB config: `watchdog_warn_sec`, `watchdog_nudge_sec`, etc.

## Isolation Backends (priority order)

1. **msb (microVM)** — Strongest isolation
2. **Docker** — Container isolation
3. **tmux** — Process-level, universal fallback

## Steps for Diagnosis

1. `mac10 status --workers` — Check states and last heartbeat times
2. If stale heartbeat (>60s), check tmux window: `tmux select-window -t worker-<id>`
3. For crashed workers, check `mac10 diagnostics` for recovery events
4. Manual recovery: `mac10 restart-worker <worker_id>`

## Task Overlay System

On assignment, coordinator generates per-task overlays with task metadata, validation commands, domain knowledge, research context, and known pitfalls. Written to `CLAUDE.md` + `AGENTS.md` in the worktree.

## Recovery Patterns

- **Stalled assignment**: Allocator auto-recovers via `recoverStalledAssignments()`
- **Crashed worker**: Watchdog escalates warn → terminate + reassign
- **Context budget exceeded**: Worker self-resets after 8000 tokens or 6 tasks

## Research Source
Ref: coordinator-core rollup (worker lifecycle), infra rollup (backends), watchdog.js (escalation)
