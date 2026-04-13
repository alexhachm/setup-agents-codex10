# mac10 — Multi-Agent Orchestration

A deterministic coordination system for Claude worker agents. LLMs do coding work; Node.js does coordination.

## Start Here

For normal operation from this checkout, run the provider-neutral startup wrapper:

```bash
bash START_HERE.sh
```

That is the same as:

```bash
bash start.sh
```

`START_HERE.sh` is the supported one-command startup. It starts or reuses the project coordinator, starts one set of master agents, starts or reuses the ChatGPT research driver, and prints system status.

Use the project wrapper for health checks and requests:

```bash
./.claude/scripts/mac10 ping
./.claude/scripts/mac10 status
./.claude/scripts/mac10 request "Add user authentication"
```

When using the global `mac10` wrapper, run it from inside the configured project so it can resolve the local `.claude/scripts/mac10` wrapper.

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
# Normal daily startup from this checkout
bash START_HERE.sh

# Explicit provider startup
bash start.sh --provider claude

# First-time setup/bootstrap only
bash setup.sh /path/to/your-project 4

./start.sh [project_dir] [num_workers]

# Built-in lifecycle controls
bash START_HERE.sh --stop
bash START_HERE.sh --pause

# Submit a request
./.claude/scripts/mac10 request "Add user authentication"

# Check status
./.claude/scripts/mac10 status
```

## CLI Reference

```
USER:      request, fix, status, clarify, log
ARCHITECT: triage, create-task, tier1-complete, ask-clarification, inbox
WORKER:    my-task, start-task, heartbeat, complete-task, fail-task, distill, inbox
SYSTEM:    start, stop, repair, ping
```

## Autonomous Loop

The SQL-backed loop machinery exists, but it is not the recommended operator path while this cleanup branch is repairing agent coordination. Use normal request/fix/status flows until loop reliability is fixed and validated.

For now, do not use `mac10 loop` for codebase cleanup work.

For bounded local cleanup passes, use the separate file-controlled wrapper:

```bash
scripts/basic-agent-loop.sh --dry-run
scripts/basic-agent-loop.sh --max-iterations 1 --sleep 0 --turn-timeout 900 -- "Continue the checklist safely."
```

This wrapper runs provider turns through the provider manifest path and can be stopped, paused, or redirected with files under `.agent-loop/basic-agent-loop/control/`. It does not create coordinator loop rows and does not invoke `scripts/loop-sentinel.sh`.

The disabled `mac10 loop` runtime path is:
1. `mac10 loop "<prompt>"` sends CLI command `loop`.
2. Coordinator calls `createLoop()` (in `coordinator/src/db.js`) and stores an `active` row in `loops`.
3. `onLoopCreated` fires and spawns `scripts/loop-sentinel.sh` in tmux (`loop-<id>` window).
4. Sentinel repeatedly runs one agent loop iteration and reports heartbeat/checkpoints.

## How It Works

1. User submits a request via `mac10 request`
2. Coordinator stores it in SQLite, mails the Architect
3. Architect triages: Tier 1 (do it), Tier 2 (one worker), Tier 3 (decompose)
4. Coordinator allocates tasks to idle workers (domain affinity, mail-before-boot)
5. Workers code in git worktrees, create PRs, report completion
6. Coordinator merges PRs (4-tier: clean → rebase → AI-resolve → redo)
7. Watchdog monitors health (heartbeats, ZFC death detection, tiered escalation)

## Operator Runbook

### Diagnostics

Use the CLI and Master 1 for supported operator diagnostics.

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

## Key Design Decisions

- **SQLite WAL** replaces 7 JSON files + jq — concurrent reads, serialized writes, no race conditions
- **Mail table** replaces 10+ signal files — reliable, ordered, read-once semantics
- **mac10 CLI** is the only interface between agents and coordinator — no file manipulation
- **tmux** replaces platform-specific terminals — works everywhere including WSL
- **Headless coordinator** replaces UI-owned state — supported operator flows go through the CLI and Master 1

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

The governed pipeline converts validated memory insights into instruction patches:

1. **Proposal**: A worker or distill cycle emits a `mac10 queue-patch` signal with the suggested change and target doc.
2. **Observation accumulation**: Patches accumulate observations from distill summaries and vote signals.
3. **Threshold gate**:
   - Role/agent doc patches (`*-role.md`, `worker`, `architect`): **≥ 3 observations** required.
   - Knowledge/domain patches: **≥ 1 observation** required.
4. **Human approval**: A named reviewer (non-anonymous) must approve via `mac10 approve-patch <id> --reviewer <name>`.
5. **Application**: Only approved patches may be applied. No bypassing.

All state transitions are recorded in the coordinator database and `.claude/knowledge` audit artifacts.

#### Lineage Types

| Type | Meaning |
|------|---------|
| `origin` | This snapshot/artifact was created fresh in this request/run. |
| `derived_from` | Built on top of a prior snapshot from an earlier run. |
| `supports` | Provides evidence for another snapshot or artifact. |
| `supersedes` | Replaces an older snapshot or artifact. |
| `validated_by` | Validated by the referenced request or run. |
| `consumed_by` | The insight was consumed (e.g. applied) in this request/run. |
