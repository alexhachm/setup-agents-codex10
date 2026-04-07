# mac10 — Multi-Agent Orchestration for Codex

A deterministic coordination system for multiple Codex agents. LLMs do coding work; Node.js does coordination.

## Architecture

```
User ──mac10 CLI──→ Coordinator (Node.js) ──tmux──→ Workers (Deep)
                         |                              |
                    SQLite WAL                    mac10 CLI
                         |                              |
                    Architect (Deep) ←──mac10 CLI──────→|
```

- **Coordinator**: Node.js process. Owns all state (SQLite), worker lifecycle (tmux), task allocation, merge queue, watchdog.
- **Architect**: Single deep-model agent. Triages requests into Tier 1/2/3, decomposes complex work into tasks.
- **Workers 1-8**: Deep-model agents in git worktrees. Receive tasks, code, create PRs.

## Quick Start

```bash
# Prerequisites: node 18+, git, gh, tmux, codex
bash setup.sh /path/to/your-project 4

# Or use provider-specific full launchers (defaults to current repo + 4 workers)
./start-codex.sh [project_dir] [num_workers]
./start-claude.sh [project_dir] [num_workers]

# Built-in lifecycle controls (supported by both provider launchers)
./start-codex.sh --help
./start-codex.sh --stop [project_dir]
./start-codex.sh --pause [project_dir]
# Equivalent: ./start-claude.sh --stop|--pause [project_dir]

# Submit a request
mac10 request "Add user authentication"

# Start the architect
cd /path/to/your-project
codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$(pwd)" - < .claude/commands/architect-loop.md

# Check status
mac10 status

# View dashboard
open http://localhost:3100
```

## CLI Reference

```
USER:      request, fix, status, clarify, log
ARCHITECT: triage, create-task, tier1-complete, ask-clarification, inbox
WORKER:    my-task, start-task, heartbeat, complete-task, fail-task, distill, inbox
SYSTEM:    start, stop, repair, gui, ping
```

## Autonomous Loop (Codex)

For codex10 projects, use the namespaced wrapper:

```bash
cd /path/to/your-project
./.claude/scripts/codex10 loop "Continuously audit UX and implement top-priority fixes until stopped"
./.claude/scripts/codex10 loop-status
./.claude/scripts/codex10 stop-loop <loop_id>
```

Runtime path is:
1. `codex10 loop "<prompt>"` sends CLI command `loop`.
2. Coordinator calls `createLoop()` (in `coordinator/src/db.js`) and stores an `active` row in `loops`.
3. `onLoopCreated` fires and spawns `scripts/loop-sentinel.sh` in tmux (`loop-<id>` window).
4. Sentinel repeatedly runs one `codex exec` loop iteration and reports heartbeat/checkpoints.

## How It Works

1. User submits a request via `mac10 request`
2. Coordinator stores it in SQLite, mails the Architect
3. Architect triages: Tier 1 (do it), Tier 2 (one worker), Tier 3 (decompose)
4. Coordinator allocates tasks to idle workers (domain affinity, mail-before-boot)
5. Workers code in git worktrees, create PRs, report completion
6. Coordinator merges PRs (4-tier: clean → rebase → AI-resolve → redo)
7. Watchdog monitors health (heartbeats, ZFC death detection, tiered escalation)

## Operator Runbook

### Diagnostics API

The coordinator exposes operator-facing health counters at:

```bash
curl http://localhost:3100/api/diagnostics
```

Response shape (rolling 24-hour window):

```json
{
  "window_hours": 24,
  "failure_counts": {
    "merge_timeouts": 0,
    "merge_conflicts_unresolved": 0,
    "stall_recoveries": 0,
    "worker_deaths": 0,
    "loop_restarts": 0,
    "stale_integrations_recovered": 0
  },
  "merge_queue_snapshot": { "pending": 0, "merging": 0, "conflict": 0, "merged": 0, "failed": 0 },
  "request_status_snapshot": { "failed": 0, "integrating": 0 }
}
```

The same `operator_diagnostics` block is embedded in the `/api/status` response.

### Failure Taxonomy

| Category | Root cause | Retry/circuit-breaker |
|---|---|---|
| `merge_timeouts` | PR merge step hung > 5 min | Promoted to `conflict` after timeout; allocator creates a fix task |
| `merge_conflicts_unresolved` | Allocator could not resolve conflicts within grace window (10 min) | Request marked `failed`; submit a `mac10 fix` to retry |
| `stall_recoveries` | Worker heartbeat stale > `watchdog_terminate_sec` (default 180 s) | Task reset to `ready` and reassigned; liveness counter tracks retry count |
| `worker_deaths` | Worker process died (tmux pane dead or heartbeat timeout) | Worker reset to `idle`; task auto-reassigned with bounded retry limit |
| `loop_restarts` | Sentinel process died or heartbeat stale | Sentinel respawned automatically |
| `stale_integrations_recovered` | Request stuck in `integrating` after all merges complete | Auto-completed or auto-failed by watchdog recovery sweep |

### Triage Steps

**Merge stuck in `merging`**
1. Check `merge_queue_snapshot.merging > 0` — confirms a PR is mid-merge.
2. After 5 min the watchdog promotes it to `conflict` and logs `merge_timeout`.
3. Allocator will create a fix task. Monitor `failure_counts.merge_timeouts`.
4. If count keeps climbing: check coordinator logs (`mac10 log`) for the failing branch and inspect the PR manually.

**Unresolved merge conflicts**
1. `failure_counts.merge_conflicts_unresolved > 0` — a conflict fix task was not created in time.
2. Check request status: `mac10 status`. If `failed`, resubmit: `mac10 fix "resolve conflict for <branch>"`.
3. If the same branch conflicts repeatedly, resolve the conflict manually and close the PR; then `mac10 fix "retry merge for <branch>"`.

**Worker stalls**
1. `failure_counts.stall_recoveries > 0` — tasks were auto-recovered.
2. A task with high `liveness_reassign_count` (visible in `mac10 status`) may indicate a systemic failure.
3. If a worker keeps dying: check the tmux window (`tmux attach`), look for OOM or nested-session errors.
4. Known fix for nested-session crashes: ensure `unset CLAUDECODE` is in `worker-sentinel.sh`.

**Loop restarts**
1. `failure_counts.loop_restarts > 0` — the architect or allocator loop died and was respawned.
2. Check `mac10 loop-status` for restart counts. If looping rapidly, stop the loop and inspect output.

**Request stuck in `integrating`**
1. `request_status_snapshot.integrating > N` for an extended period indicates stale status drift.
2. Watchdog auto-resolves after 15 min (no-merge case) or after all merges settle.
3. Force recovery: `mac10 repair` (restarts coordinator with startup sweep).

### Browser Offload Smoke Harness (Controlled Lifecycle)

Use a dedicated Tier-2 smoke task for browser offload lifecycle testing:
- Subject: `Browser offload smoke harness`
- Description: `Use this task only for browser offload lifecycle smoke testing.`

Run the command chain against that task:

```bash
# Required inputs
TASK_ID=<task_id>
WORKFLOW_URL='https://chatgpt.com/g/guided-research'

# 1) Create session (task status: requested)
mac10 browser-create-session "$TASK_ID" "$WORKFLOW_URL" smoke-create-001

# 2) Attach session (task status advances queued -> launching -> attached)
mac10 browser-attach-session "$TASK_ID" <session_id> smoke-attach-001

# 3) Start job (task status advances running -> awaiting_callback)
mac10 browser-start-job "$TASK_ID" <session_id> "$WORKFLOW_URL" smoke-start-001 "Smoke harness lifecycle probe"

# 4) Stream callback chunks while awaiting callback
mac10 browser-callback-chunk "$TASK_ID" <session_id> <job_id> <callback_token> smoke-chunk-001 0 "chunk one "
mac10 browser-callback-chunk "$TASK_ID" <session_id> <job_id> <callback_token> smoke-chunk-002 1 "chunk two"

# 5) Check status (expected: awaiting_callback until complete/fail)
mac10 browser-job-status "$TASK_ID" <session_id> <job_id>

# 6a) Complete path (terminal status: completed)
mac10 browser-complete-job "$TASK_ID" <session_id> <job_id> <callback_token> smoke-complete-001 '{"summary":"ok"}'

# 6b) Failure path (terminal status: failed)
mac10 browser-fail-job "$TASK_ID" <session_id> <job_id> <callback_token> smoke-fail-001 "intentional smoke failure"
```

Expected browser-offload status progression (from `coordinator/src/db.js`):

| Stage | Allowed progression |
|---|---|
| Session bring-up | `not_requested -> requested -> queued -> launching -> attached` |
| Job execution | `attached -> running -> awaiting_callback` |
| Terminal | `awaiting_callback -> completed` or `awaiting_callback -> failed` (`cancelled` is also terminal) |

Notes:
1. `idempotency_key` should be stable for retries of the same operation and unique across distinct operations.
2. `browser-job-status` is read-only and safe to poll while waiting for callback chunks.
3. CLI enforces forward-only lifecycle transitions; backward transitions fail.

### Liveness Recovery for Browser Smoke Tasks

If the worker hosting the smoke task dies (`worker_death:msb_sandbox_dead`), watchdog reassigns the task with bounded retries:
- Retry cap: `watchdog_task_reassign_limit` (default `2`)
- Exhaustion result text: `Liveness recovery exhausted after <N> reassignments (<reason>)`

When retries are exhausted:
1. Confirm failure context: `mac10 status` and `mac10 log`
2. Check diagnostics counters: `failure_counts.worker_deaths` and `failure_counts.stall_recoveries`
3. Repair worker runtime cause first (sandbox availability, sentinel health), then re-run the dedicated smoke harness task with fresh idempotency keys.

## Key Design Decisions

- **SQLite WAL** replaces 7 JSON files + jq — concurrent reads, serialized writes, no race conditions
- **Mail table** replaces 10+ signal files — reliable, ordered, read-once semantics
- **mac10 CLI** is the only interface between agents and coordinator — no file manipulation
- **tmux** replaces platform-specific terminals — works everywhere including WSL
- **Web dashboard** replaces Electron GUI — simpler, no build step

## Project Memory

mac10 maintains a persistent memory layer so insights and patterns discovered by workers are retained and reusable across sessions and requests.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Snapshot** | A versioned checkpoint of a project's learned state (`project_memory_snapshots`). Each snapshot carries a `project_context_key`, an auto-incrementing `snapshot_version`, and an optional `parent_snapshot_id` for lineage. |
| **Insight Artifact** | A reusable finding attached to a context key (`insight_artifacts`). Artifacts are typed (`research_insight`, `code_pattern`, etc.) and scored by `relevance_score`. |
| **Lineage Link** | A directed edge in the provenance graph (`project_memory_lineage_links`). Links connect snapshots and artifacts to requests, tasks, and run IDs. |
| **Snapshot Index** | A fast lookup table (`project_memory_snapshot_index`) that always points to the latest snapshot version per context key. |

### Retrieval CLI Commands

```bash
mac10 memory-snapshots [--project_context_key KEY] [--validation_status STATUS] [--limit N] [--offset N]
mac10 memory-snapshot --id ID [--include_lineage true]
mac10 memory-insights [--project_context_key KEY] [--artifact_type TYPE] [--min_relevance_score N]
mac10 memory-insight --id ID [--include_lineage true]
mac10 memory-lineage [--snapshot_id ID] [--request_id REQ] [--lineage_type TYPE]
```

### Governance Policy

#### Retention

| Policy | Behaviour |
|--------|-----------|
| `retain` (default) | Snapshot or artifact is kept indefinitely. |
| `expiry` | Combined with `retention_until` (ISO date). Expired entries may be pruned. |

Pruning is never automatic — a human operator or a governed curation cycle must initiate it. High-relevance validated artifacts (`relevance_score ≥ 900`, `validation_status = 'validated'`) should never be pruned.

#### Confidence Thresholds

`confidence_score` is a float in `[0, 1]` stored on every snapshot and artifact.

| Score | Suggested meaning |
|-------|-------------------|
| `null` | Not assessed |
| `< 0.5` | Low confidence — treat as hypothesis |
| `0.5 – 0.8` | Moderate confidence — usable but verify |
| `> 0.8` | High confidence — suitable for automated reuse |

Workers should set `confidence_score` when they have evidence; the Architect may update it during review.

#### Validation Status Lifecycle

```
unvalidated  →  pending  →  validated
                         →  rejected
validated    →  superseded
```

- **unvalidated**: Default for newly ingested insights.
- **pending**: Flagged for human or Architect review (e.g. partial insights, contested patterns).
- **validated**: Approved — safe for automated reuse and instruction-refinement proposals.
- **rejected**: Discarded — do not reuse or surface.
- **superseded**: Replaced by a newer version; kept for audit trail only.

#### Instruction-Refinement Approval Workflow

The governed pipeline in `.codex/scripts/patch-pipeline.js` converts validated memory insights into instruction patches:

1. **Proposal**: A worker or distill cycle emits a `codex10 queue-patch` signal with the suggested change and target doc.
2. **Observation accumulation**: Patches accumulate observations from distill summaries and vote signals.
3. **Threshold gate**:
   - Role/agent doc patches (`*-role.md`, `worker`, `architect`): **≥ 3 observations** required.
   - Knowledge/domain patches: **≥ 1 observation** required.
4. **Human approval**: A named reviewer (non-anonymous) must approve via `codex10 approve-patch <id> --reviewer <name>`.
5. **Application**: Only approved patches may be applied. No bypassing.

All state transitions are recorded in `.codex/knowledge/patches.json` (audit trail).

#### Lineage Types

| Type | Meaning |
|------|---------|
| `origin` | This snapshot/artifact was created fresh in this request/run. |
| `derived_from` | Built on top of a prior snapshot from an earlier run. |
| `supports` | Provides evidence for another snapshot or artifact. |
| `supersedes` | Replaces an older snapshot or artifact. |
| `validated_by` | Validated by the referenced request or run. |
| `consumed_by` | The insight was consumed (e.g. applied) in this request/run. |
