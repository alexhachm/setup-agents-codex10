# Codex Agent Usage Index

> Auto-generated index of every specific codex agent usage, invocation, and configuration in the `setup-agents-codex10` project.

---

## Table of Contents

1. [Agent Architecture Overview](#1-agent-architecture-overview)
2. [Codex CLI Invocations](#2-codex-cli-invocations)
3. [Master-1: Interface Agent](#3-master-1-interface-agent)
4. [Master-2: Architect Agent](#4-master-2-architect-agent)
5. [Master-3: Allocator Agent](#5-master-3-allocator-agent)
6. [Worker Agent](#6-worker-agent)
7. [Loop Agent](#7-loop-agent-autonomous-iterator)
8. [Codex10 Namespace Wrappers](#8-codex10-namespace-wrappers)
9. [Model Routing & Resolution](#9-model-routing--resolution)
10. [Setup & Initialization](#10-setup--initialization)
11. [Coordinator Runtime](#11-coordinator-runtime)
12. [Overlay & Instruction Files](#12-overlay--instruction-files)
13. [Permissions & Security](#13-permissions--security)
14. [Signal-Based Communication](#14-signal-based-communication)
15. [Knowledge Base](#15-knowledge-base)
16. [Templates](#16-templates)
17. [State Files](#17-state-files)
18. [Migration Spec (Claude → Codex)](#18-migration-spec-claude--codex)

---

## 1. Agent Architecture Overview

The system runs **5 distinct codex agent types** coordinated through a Node.js SQLite-backed coordinator:

| Agent | Role | Model | Mode | Prompt Source |
|-------|------|-------|------|---------------|
| Master-1 (Interface) | User contact, request submission | gpt-5.3-codex | Interactive | `master-loop.md` |
| Master-2 (Architect) | Triage, decomposition, backlog | gpt-5.3-codex | Non-interactive (autonomous) | `architect-loop.md` |
| Master-3 (Allocator) | Task-to-worker routing, merging | gpt-5.3-codex | Non-interactive (autonomous) | `allocate-loop.md` |
| Worker | Task execution, PRs, heartbeats | gpt-5.3-codex | Non-interactive (one-shot per task) | `worker-loop.md` |
| Loop Agent | Continuous autonomous iteration | gpt-5.3-codex | Non-interactive (adaptive backoff) | `loop-agent.md` |

---

## 2. Codex CLI Invocations

### Interactive Mode (Master-1)

**File:** `scripts/launch-agent.sh` line 95

```bash
codex --dangerously-bypass-approvals-and-sandbox \
  -m "$MODEL_RESOLVED" \
  -C "$DIR" \
  -- "$PROMPT_TEXT"
```

### Non-Interactive Mode (Master-2, Master-3, Workers, Loops)

**File:** `scripts/launch-agent.sh` lines 99-101

```bash
codex exec --dangerously-bypass-approvals-and-sandbox \
  -m "$MODEL_RESOLVED" \
  -C "$DIR" \
  - < "$PROMPT_FILE"
```

With restart loop on exit (3-second backoff between restarts) for Master-2 and Master-3.

### Worker Sentinel Invocation

**File:** `scripts/worker-sentinel.sh` line 71

```bash
codex exec --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.3-codex \
  -C "$WORKTREE" \
  - < "$PROMPT_FILE"
```

Uses either `.codex/commands-codex10/worker-loop.md` or `.codex/commands/worker-loop.md`.

### Loop Sentinel Invocation

**File:** `scripts/loop-sentinel.sh` line 130

```bash
codex exec --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.3-codex \
  -C "$PROJECT_DIR" \
  - < "$PROMPT_FILE"
```

Uses either `.codex/commands-codex10/loop-agent.md` or `.codex/commands/loop-agent.md`. Implements adaptive backoff (60–900 seconds based on run duration).

---

## 3. Master-1: Interface Agent

**Definition:** `.codex/commands-codex10/master-loop.md`
**Role documentation:** `.codex/docs/master-1-role.md`
**Model alias:** `fast` → `gpt-5.3-codex`

### Coordinator Commands Used

| Command | Purpose |
|---------|---------|
| `./.codex/scripts/codex10 request "[description]"` | Submit a new request |
| `./.codex/scripts/codex10 fix "FIX worker-N: [description]"` | Send fix instructions to a worker |
| `./.codex/scripts/codex10 status` | Query system status |
| `./.codex/scripts/codex10 loop` | Start an autonomous loop |
| `./.codex/scripts/codex10 loop-status` | Check loop status |
| `./.codex/scripts/codex10 stop-loop <loop_id>` | Stop an autonomous loop |
| `./.codex/scripts/codex10 clarify <request_id> "<msg>"` | Send clarification to architect |
| `./.codex/scripts/codex10 inbox master-1` | Read incoming messages |
| `./.codex/scripts/codex10 log` | View activity log |

### Constraint

> "Use only `./.codex/scripts/codex10 ...` for coordinator commands. Never invoke raw `mac10` in this codex10 runtime."

### Special Feature

Supports **Type 0 routing** for autonomous loops — user describes an ongoing task and Master-1 submits it as a loop request.

---

## 4. Master-2: Architect Agent

**Definition:** `.codex/commands-codex10/architect-loop.md`
**Role documentation:** `.codex/docs/master-2-role.md`, `.codex/docs/architect-role.md`
**Model alias:** `deep` → `gpt-5.3-codex`

### Coordinator Commands Used

| Command | Purpose |
|---------|---------|
| `./.codex/scripts/codex10 inbox architect` | Read incoming requests |
| `./.codex/scripts/codex10 status` | Query system status |
| `./.codex/scripts/codex10 triage <request_id>` | Classify request tier (1/2/3) |
| `./.codex/scripts/codex10 create-task <request_id> <task_description>` | Decompose request into task |
| `./.codex/scripts/codex10 tier1-complete <request_id>` | Mark Tier-1 request as done |
| `./.codex/scripts/codex10 ask-clarification <request_id> "<question>"` | Request clarification from user |

### Internal Counters

| Counter | Reset Threshold | Purpose |
|---------|----------------|---------|
| `tier1_count` | 4 | Track lightweight completions |
| `decomposition_count` | 6 | Track decomposition cycles |
| `curation_due` | boolean | Trigger backlog curation |
| `backlog_threshold` | 50 | Max backlog size before curation |
| `ready_floor` | 6 tasks | Minimum ready tasks to maintain |

### Constraint

Native agent teams are disabled; uses standard codex10 coordinator path.

---

## 5. Master-3: Allocator Agent

**Definition:** `.codex/commands-codex10/allocate-loop.md`
**Role documentation:** `.codex/docs/master-3-role.md`
**Model alias:** `fast` → `gpt-5.3-codex`

### Coordinator Commands Used

| Command | Purpose |
|---------|---------|
| `./.codex/scripts/codex10 ready-tasks` | List tasks ready for assignment |
| `./.codex/scripts/codex10 inbox allocator` | Read incoming messages |
| `./.codex/scripts/codex10 worker-status` | Check worker availability |
| `./.codex/scripts/codex10 check-completion <request_id>` | Verify all tasks for a request are done |
| `./.codex/scripts/codex10 assign-task <task_id> <worker_id>` | Route task to specific worker |
| `./.codex/scripts/codex10 integrate <request_id>` | Trigger branch merge orchestration |

### Internal Counters

| Counter | Reset Threshold | Purpose |
|---------|----------------|---------|
| `context_budget` | 5000 | Token budget tracking |
| `started_at` | 20 min | Session time limit |
| `polling_cycle` | incremental | Periodic health checks |
| `last_activity` | timestamp | Adaptive polling trigger |

### Adaptive Polling

- **Active:** 3-second timeout (just processed something)
- **Idle:** 10-second timeout

---

## 6. Worker Agent

**Definition:** `.codex/commands-codex10/worker-loop.md`
**Base instruction:** `.codex/worker-agents.md` (codex10 variant) or `.codex/worker-claude.md` (legacy)
**Model:** `gpt-5.3-codex`

### Setup Command

```bash
export PATH="$(pwd)/.codex/scripts:$PATH"
```

### Coordinator Commands Used

| Command | Purpose |
|---------|---------|
| `./.codex/scripts/codex10 my-task $WORKER_ID` | Check for assigned task |
| `./.codex/scripts/codex10 start-task $WORKER_ID $TASK_ID` | Mark task as in-progress |
| `./.codex/scripts/codex10 heartbeat $WORKER_ID` | Send health heartbeat (every 30s) |
| `./.codex/scripts/codex10 complete-task $WORKER_ID $TASK_ID $PR_URL $BRANCH` | Report task completion with PR |
| `./.codex/scripts/codex10 fail-task $WORKER_ID $TASK_ID "$ERROR"` | Report task failure |
| `./.codex/scripts/codex10 distill $WORKER_ID $DOMAIN "$LEARNINGS"` | Submit learnings to knowledge base |

### Internal Counters

| Counter | Reset Threshold | Purpose |
|---------|----------------|---------|
| `tasks_completed` | 6 | Context freshness limit |
| `context_budget` | 8000 | Token budget tracking |
| `domain_lock` | per-task | Domain validation |

### Knowledge Files Read at Startup

- `.codex/knowledge/mistakes.md`
- `.codex/knowledge/patterns.md`
- `.codex/knowledge/instruction-patches.md`
- `.codex/knowledge/worker-lessons.md`
- `.codex/knowledge/change-summaries.md`

---

## 7. Loop Agent (Autonomous Iterator)

**Definition:** `.codex/commands-codex10/loop-agent.md`
**Model:** `gpt-5.3-codex`

### Coordinator Commands Used

| Command | Purpose |
|---------|---------|
| `./.codex/scripts/codex10 loop-prompt $LOOP_ID` | Fetch loop prompt/instructions |
| `./.codex/scripts/codex10 loop-requests $LOOP_ID` | List requests tied to this loop |
| `./.codex/scripts/codex10 loop-heartbeat $LOOP_ID` | Send loop health heartbeat |
| `./.codex/scripts/codex10 stop-loop $LOOP_ID` | Self-terminate loop |

### Adaptive Backoff (Loop Sentinel)

| Run Duration | Backoff | Rationale |
|-------------|---------|-----------|
| < 30 seconds | 60–900s (exponential) | Crash or empty iteration |
| ≥ 30 seconds | 300s (fixed) | Healthy iteration cadence |
| Maximum | 900s (15 min) | Upper bound |

---

## 8. Codex10 Namespace Wrappers

### Primary wrapper: `.codex/scripts/codex10`

```bash
#!/usr/bin/env bash
MAC10_NAMESPACE="codex10" exec /path/to/coordinator/bin/mac10 "$@"
```

Points to `coordinator/bin/mac10` with `MAC10_NAMESPACE="codex10"`.

### Compatibility wrapper: `.codex/scripts/mac10-codex10`

Same as `codex10` (copy). Used as fallback in compatibility mode.

### Legacy wrapper: `.codex/scripts/mac10`

```bash
MAC10_NAMESPACE="${MAC10_NAMESPACE:-mac10}" exec coordinator/bin/mac10 "$@"
```

### Dynamic Shim Creation

**File:** `scripts/launch-agent.sh` lines 25-40

Creates `.codex/scripts/.codex10-shims/mac10` dynamically to ensure codex10 wrapper availability across all execution contexts.

---

## 9. Model Routing & Resolution

### Launch-time Resolution

**File:** `scripts/launch-agent.sh` lines 46-58

| Alias | Resolved Model |
|-------|---------------|
| `sonnet` | `gpt-5.3-codex` |
| `opus` | `gpt-5.3-codex` |
| `fast` | `gpt-5.3-codex` |
| `deep` | `gpt-5.3-codex` |
| `haiku` | `gpt-5.1-codex-mini` |
| `economy` | `gpt-5.1-codex-mini` |

### Coordinator Routing Classes

**File:** `coordinator/src/cli-server.js` lines 52-53

| Route Class | Model |
|-------------|-------|
| `spark` | `gpt-5.3-codex-spark` |
| `high` | `gpt-5.3-codex` |
| `mid` | `gpt-5.3-codex` |
| Default | `gpt-5.3-codex` |

---

## 10. Setup & Initialization

**File:** `setup.sh`

### Codex-Specific Steps

| Step | Lines | Action |
|------|-------|--------|
| Preflight | 81 | `check_cmd codex` — verifies codex binary exists |
| WSL Shim | 49 | `_wsl_shim codex` — creates Windows↔WSL bridge |
| Directory Migration | 118-121 | Renames `.claude/` → `.codex/` if legacy exists |
| Shared Commands | 148-153 | Copies `templates/commands/` → `.codex/commands/` |
| Codex10 Commands | 154-157 | Copies `templates/commands/` → `.codex/commands-codex10/` (always refreshed) |
| Agent Definitions | 159-164 | Copies agent templates → `.codex/agents/` |
| Root Instruction | 186 | `templates/root-claude.md` → `AGENTS.md` (codex-native) |
| Worker Instruction | 190 | `templates/worker-claude.md` → `.codex/worker-agents.md` |
| Namespace Wrappers | 213-240 | Creates `codex10`, `mac10-codex10`, `mac10` wrappers |
| Coordinator Start | 382-400 | `node coordinator/src/index.js` with `MAC10_NAMESPACE="codex10"` |
| Master-1 Launch | 449-460 | `codex --dangerously-bypass-approvals-and-sandbox ...` (interactive) |
| Master-2 Launch | 462-468 | `codex exec ...` (non-interactive, restart loop) |
| Master-3 Launch | 470-476 | `codex exec ...` (non-interactive, restart loop) |

### Coordinator Launch Command

```bash
nohup env MAC10_NAMESPACE="$NAMESPACE" MAC10_SCRIPT_DIR="$SCRIPT_DIR" \
  node "$SCRIPT_DIR/coordinator/src/index.js" "$PROJECT_DIR" \
  > "$CODEX_DIR/state/${NAMESPACE}.coordinator.log" 2>&1 &
```

---

## 11. Coordinator Runtime

**File:** `coordinator/src/index.js`

### Namespace-Aware Initialization (lines 17-19)

```javascript
const namespace = process.env.MAC10_NAMESPACE || 'mac10';
const stateDir = path.join(projectDir, '.codex', 'state');
const pidFile = path.join(stateDir, `${namespace}.pid`);
```

### Worker Spawning (lines 139-142)

```javascript
const sentinelPath = path.join(projectDir, '.codex', 'scripts', 'worker-sentinel.sh');
tmux.createWindow(
  windowName,
  `MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${worker.id} "${projectDir}"`,
  worktreePath
);
```

### Loop Spawning (lines 176-179)

```javascript
const sentinelPath = path.join(scriptDir, 'scripts', 'loop-sentinel.sh');
tmux.createWindow(
  windowName,
  `MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${loopId} "${projectDir}"`,
  projectDir
);
```

---

## 12. Overlay & Instruction Files

**File:** `coordinator/src/overlay.js`

### Worker Instruction Generation (lines 139-148)

Writes task-specific instructions to **both** legacy and codex-native paths:

```javascript
fs.writeFileSync(claudePath, content, 'utf8');  // CLAUDE.md (legacy)
fs.writeFileSync(agentsPath, content, 'utf8');  // AGENTS.md (codex-native)
```

### Base Instruction Selection (lines 12-24)

```javascript
// Prefers AGENTS.md for codex; falls back to CLAUDE.md
if (fs.existsSync(workerAgentsMd)) {
  base = fs.readFileSync(workerAgentsMd, 'utf8');  // .codex/worker-agents.md
} else {
  base = fs.readFileSync(workerClaudeMd, 'utf8');  // .codex/worker-claude.md
}
```

---

## 13. Permissions & Security

**File:** `.codex/settings.json`

### Codex Binary Permission

```json
"Bash(codex *)"
```

### Pre-Tool Hook

```json
"hooks": {
  "PreToolUse": [{
    "matcher": "Edit|Write|Read|Bash",
    "hooks": [{
      "type": "command",
      "command": "bash -c 'bash \"$CODEX_PROJECT_DIR/.codex/hooks/pre-tool-secret-guard.sh\"'"
    }]
  }]
}
```

### Trusted Directories

- Project root: `/mnt/c/Users/Owner/Desktop/setup-agents-codex10`
- Worker worktrees: `wt-1` through `wt-4` (and Windows equivalents)

---

## 14. Signal-Based Communication

**Directory:** `.codex/signals/`

| Signal File | Purpose |
|------------|---------|
| `.codex10.handoff-signal` | Master-to-master communication |
| `.codex10.task-signal` | Task assignment notification |
| `.codex10.fix-signal` | Fix request trigger |
| `.codex10.completion-signal` | Task completion notification |
| `.codex10.restart-signal` | Runtime restart trigger |

Replaces fixed sleep intervals with adaptive timeouts (3s active, 10s idle).

---

## 15. Knowledge Base

**Directory:** `.codex/knowledge/`

### Agent Learning Files

| File | Purpose |
|------|---------|
| `mistakes.md` | Known pitfalls to avoid (read by workers at startup) |
| `patterns.md` | Established design patterns (read by workers at startup) |
| `instruction-patches.md` | Runtime instruction updates (read by workers at startup) |
| `worker-lessons.md` | Worker domain-specific learnings |
| `change-summaries.md` | Summary of recent changes |
| `codebase-insights.md` | Codebase analysis results |
| `user-preferences.md` | User workflow preferences |
| `allocation-learnings.md` | Allocator behavior patterns |
| `loop-findings.md` | Autonomous loop success patterns (50+ entries) |

### Coordinator Domain Knowledge

| File | Purpose |
|------|---------|
| `domain/coordinator-core.md` | Core coordinator architecture |
| `domain/coordinator-lifecycle.md` | Worker/task lifecycle |
| `domain/coordinator-routing.md` | Task routing logic |
| `domain/coordinator-surface.md` | CLI surface area |
| `domain/coordinator-telemetry.md` | Metrics & logging |
| `domain/coordinator-tests.md` | Test coverage |
| `domain/orchestration-docs.md` | Orchestration documentation |
| `domain/orchestration-prompts.md` | Prompt management |
| `domain/orchestration-scripts.md` | Script references |
| `domain/dashboard-ui.md` | Web dashboard |

---

## 16. Templates

**Directory:** `templates/`

### Command Templates (copied to `.codex/commands/` and `.codex/commands-codex10/`)

| Template | Agent |
|----------|-------|
| `commands/master-loop.md` | Master-1 |
| `commands/architect-loop.md` | Master-2 |
| `commands/allocate-loop.md` | Master-3 |
| `commands/worker-loop.md` | Worker |
| `commands/loop-agent.md` | Loop Agent |
| `commands/scan-codebase.md` | Codebase scanner |
| `commands/scan-codebase-allocator.md` | Allocator-variant scanner |
| `commands/commit-push-pr.md` | Git/PR automation |

### Role Documentation Templates

| Template | Agent |
|----------|-------|
| `docs/master-1-role.md` | Master-1 role definition |
| `docs/master-2-role.md` | Master-2 role definition |
| `docs/master-3-role.md` | Master-3 role definition |
| `docs/architect-role.md` | Architect role definition |

### Agent Definitions (copied to `.codex/agents/`)

| Template | Purpose |
|----------|---------|
| `agents/build-validator.md` | Build validation agent |
| `agents/code-architect.md` | Code architecture agent |
| `agents/verify-app.md` | Application verification agent |

### Base Instructions

| Template | Destination |
|----------|-------------|
| `root-claude.md` | `AGENTS.md` (project root) + `CLAUDE.md` |
| `worker-claude.md` | `.codex/worker-agents.md` + `.codex/worker-claude.md` |

---

## 17. State Files

**Directory:** `.codex/state/`

| File | Purpose |
|------|---------|
| `codex10.db` | SQLite database (all requests, tasks, workers) |
| `codex10.pid` | Coordinator process ID |
| `codex10.sock.path` | Unix socket path for IPC |
| `codex10.tcp.port` | TCP port for network access |
| `codex10.coordinator.log` | Coordinator stdout/stderr |
| `codex10.agent-health.json` | Agent health status (heartbeats) |
| `codex10.handoff.json` | Request handoff state |

---

## 18. Migration Spec (Claude → Codex)

**File:** `mac10-codex-migration-spec.md`

### Binary & Flag Mappings

| Claude | Codex |
|--------|-------|
| `claude` | `codex` |
| `--dangerously-skip-permissions` | `--dangerously-bypass-approvals-and-sandbox` |
| `-p` (print-and-exit) | `codex exec` (non-interactive) |
| `--prompt-file` | `- < prompt.md` (stdin redirection) |
| `-C <dir>` | `-C <dir>` (same) |
| `-m <model>` | `-m <model>` (new model IDs) |

### Model ID Mappings

| Alias | Codex Model |
|-------|-------------|
| `fast` | `gpt-5.3-codex` |
| `deep` | `gpt-5.3-codex` |
| `economy` | `gpt-5.1-codex-mini` |
| `highest` | `gpt-5.3-codex` |

### Runtime Contract

```bash
codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -m "$MODEL_RESOLVED" \
  -C "$RUN_DIR" \
  - < "$PROMPT_FILE"
```

Full equivalents table available in `codex-equivalents-index.md`.
