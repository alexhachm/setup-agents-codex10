---
doc_kind: reference
scope: project
owner: domains/coordinator-lifecycle
last_verified: 2026-03-16
rot_risk: medium
related_paths:
  - coordinator/src/cli-server.js
  - coordinator/tests/cli.test.js
  - coordinator/bin/mac10
  - coordinator/src/db.js
---

# Coordinator Lifecycle

## Executive Summary
- Governs loop lifecycle (checkpoint, heartbeat, set-prompt, refresh-prompt) and request completion state machines.
- `loop-checkpoint` and `loop-heartbeat` must gate on `loop.status === 'active'`; non-active states must not mutate counters/checkpoints/heartbeat fields.
- `loop-set-prompt` allows active/paused loops; `loop-refresh-prompt` is restricted to active-only.
- `checkRequestCompletion` must include `request_status` and treat `total=0` as terminal only when parent request is already terminal.

## Invariants and Contracts
- `loop-checkpoint` and `loop-heartbeat` reject non-active loops with `"Loop is <status>, not active"` before any state mutation.
- `loop-set-prompt` accepts `active` and `paused` statuses; `loop-refresh-prompt` accepts only `active`.
- Prompt writes route through `setLoopPrompt -> updateLoop` to avoid duplicated SQL logic.
- `checkRequestCompletion` zero-task terminal semantics: `total=0` is terminal ONLY when parent `request_status` is `completed` or `failed`.
- `mac10 check-completion` exposes explicit labels: `COMPLETED (NO TASKS)`, `ALL FAILED (NO TASKS)`.

## Key Patterns
- **Loop prompt refresh**: `loop-refresh-prompt` is a dedicated command, not loop recreation. DB path: `refreshLoopPrompt -> setLoopPrompt(..., ['active']) -> updateLoop`.
- **Overlap validation playbook**: `git fetch origin && git rebase origin/main`, then `git diff --quiet origin/main -- <scoped files>`. If clean, run scoped tests and close as validation-only.
- **Startup env guard**: `cli-server.start()` defaults `npm_config_if_present='true'` only when unset.

## Pitfalls
- Do NOT mutate loop counters/checkpoints/heartbeat when status gates reject a write.
- Overlap-conflict tasks repeatedly recur; always check scoped diff before editing to avoid no-op relands.
- Use result-only `codex10 complete-task` for validation-only closures to avoid placeholder PR/branch parsing issues.

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
