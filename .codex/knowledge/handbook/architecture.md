# Architecture Handbook

Actionable architectural patterns distilled from research on concurrent agent merge/integration and observability.
Last updated: 2026-03-19 (from research1.md)

---

## Merge / Integration Architecture

### Two-Layer Integration Model
Production multi-agent systems separate work into two distinct layers:
1. **Candidate generation**: each worker produces an isolated branch/worktree — no agent touches main directly
2. **Integration layer**: deterministic coordinator serializes candidates, validates speculative merged result, then fast-forwards main

The integration layer must be coordinator-owned, not prompt-driven. Workers should not own merge or PR authority.

### Integration Candidate (disposable ephemeral ref)
- On merge attempt: create a **temporary integration worktree** from latest accepted head
- Merge/cherry-pick the worker branch into it (no mutation of worker branch)
- Run validation on the integration worktree
- If passed: fast-forward main from integration ref; clean up temp worktree
- If failed: classify error, archive attempt, clean up — worker branch untouched
- Benefit: worker state preserved for audit/rollback; each attempt is repeatable

### Queue Discipline
- Start with **strict serial queue** for agent-generated PRs (higher semantic conflict rate than human code)
- Speculative parallel validation (merge trains) only after tests are trustworthy and conflict rate is low
- Queue entry = one PR; coordinator is the single authority that enqueues and dequeues
- Never let agents call merge/push APIs directly (duplicate PR risk, policy drift)

### Retry Policy
- Replace "retry because time passed" with "retry because blocking condition changed"
- Archive terminal attempts instead of deleting (forensics)
- Track `attempt_no`, `conflict_class`, `integration_sha`, `base_sha` on each attempt

### Conflict Classes (typed, not free-text)
Expose as a `conflict_class` enum on merge queue entries:
- `text_conflict` — git merge failed with textual conflict
- `semantic_conflict` — merged cleanly but broke tests/behavior
- `stale_base` — worker branch started from outdated base commit
- `branches_diverged` — branch history diverged beyond fast-forward
- `worktree_dirty` — uncommitted changes in integration worktree
- `duplicate_pr` — same task already has a merged/open PR
- `ci_timeout` — required checks never reported
- `policy_blocked` — missing approval, branch protection, or scope violation
- `superseded` — another PR for same task already merged
- `reverted` — PR was reverted; retry requires new fix

### Rollback
- Rollback via **revert PR** (new PR that reverses merged PR) — never force-push main
- Keeps audit history intact, compatible with branch protection rules
- Coordinator should auto-open a revert PR when post-merge validation fails

---

## Observability Architecture

### Four-Layer Stack
1. **SQLite event ledger** — durable control-plane state + forensic history (already have; keep as source of truth)
2. **Structured JSON logs** — one canonical `emitEvent()` path; every state transition writes a log line
3. **Prometheus metrics** — exposed by coordinator only (not per-worker; tmux workers are ephemeral)
4. **OTel traces** — root span = full user request; child spans = allocator, task execution, shell, merge, model calls

### Canonical Event Envelope (apply to all emitters)
```json
{
  "ts": "<ISO8601>",
  "level": "info|warn|error",
  "service.name": "mac10-coordinator",
  "actor_role": "allocator|worker|merger|watchdog",
  "event_name": "task_assigned|merge_failed|...",
  "request_id": "req_123",
  "task_id": 42,
  "task_attempt": 2,
  "worker_id": 3,
  "loop_id": 7,
  "state_from": "queued",
  "state_to": "assigned",
  "duration_ms": 81,
  "usage": {"input_tokens": 1200, "cost_usd": 0.08},
  "trace_id": "...",
  "span_id": "..."
}
```

### Metric Label Rules
- **Never** label with high-cardinality values: `request_id`, `task_id`, `file_path`, `branch_name`, raw commands
- Safe label dimensions: `stage`, `status`, `reason`, `provider`, `model`, bounded `worker_id`
- Double-count prevention: distinguish `task` vs `task_attempt`, `failure` vs `recovery_action`

### Priority Metrics
- `agent_heartbeat_age_seconds` — time since last heartbeat per worker
- `agent_progress_age_seconds` — time since last meaningful progress (see Heartbeat Split)
- `watchdog_escalations_total{level,reason}` — warn/nudge/triage/terminate counts
- `queue_depth{queue}` — tasks ready, assigned, merge-pending
- `request_lead_time_seconds` histogram — request submitted → completed
- `task_exec_time_seconds` histogram — task started → PR created
- `merge_attempts_total{result,strategy}` — merge outcomes by class
- `llm_cost_usd_total{provider,model,agent_role}` — cost burn

### Heartbeat Split
Two separate signals per worker:
- **Liveness heartbeat** — "process is alive" (tmux pane present, process running)
- **Progress heartbeat** — "meaningful forward progress made" (new commit, file changed, test run)

"Alive but wedged" is the dominant multi-agent failure mode. Progress heartbeat catches it.
Track `last_progress_at` as first-class field alongside `last_heartbeat_at`.
Use coordinator receipt timestamp (not worker clock) to avoid clock skew.

### Rollout Sequence
1. Define canonical event schema + `emitEvent()` — highest leverage change
2. Add `/metrics` endpoint to coordinator Express server (prom-client, `collectDefaultMetrics()`)
3. Add OTel spans around allocator decisions, task execution, shell commands, merge attempts, model calls
4. Add OTel Collector sidecar for batching, redaction, and multi-backend export
