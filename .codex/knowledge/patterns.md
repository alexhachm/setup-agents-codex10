# Decomposition Patterns

Learnings from past task decompositions. Updated by the Architect after completing triage cycles.

## Good Patterns
- For sustained queue intake with clear single-domain fixes, pre-triage quickly to Tier 2 and immediately assign explicit file-scoped tasks with concrete validation commands.
- When all workers are occupied, block on architect inbox for the next completion event, then claim the first idle worker atomically before task creation/assignment.
- Apply staleness checks even during idle triage periods; they can reveal mandatory reset conditions independent of current inbox load.
- After Tier 2 task creation/assignment, record coordinator tier decision with `codex10 triage <request_id> 2 ...` so request status does not linger as `[pending]` in queue views.
- During reset mode, rebuild `codebase-map.json` immediately; missing scan baselines can force repeated false-positive full resets.
- Keep two queue signals separate in decisioning: request `pending_count` controls triage order, while `ready_count` indicates allocator pressure.
- For same-file Tier 2 requests (for example adjacent `cli-server.js` lifecycle handlers), serialize by setting `depends_on` between tasks to avoid overlap thrash.

## Anti-Patterns
- Continuing loop operations after reset thresholds are hit (`commits_since >= 20`, broad file churn, or missing scan baseline) risks stale decomposition decisions.
- Running `./.codex/scripts/codex10 --help` as a probe can generate a stray `--help` request; use documented commands directly.
