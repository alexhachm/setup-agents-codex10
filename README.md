# mac10 — Multi-Agent Orchestration for Codex and Claude Code

A deterministic coordination system for multiple terminal coding agents. LLM CLIs do coding work; Node.js does coordination.

## Architecture

```
User ──mac10 CLI──→ Coordinator (Node.js) ──tmux──→ Workers (Provider-backed)
                         |                              |
                    SQLite WAL                    mac10 CLI
                         |                              |
                    Architect (Deep) ←──mac10 CLI──────→|
```

- **Coordinator**: Node.js process. Owns all state (SQLite), worker lifecycle (tmux), task allocation, merge queue, watchdog.
- **Architect**: Single deep-model agent. Triages requests into Tier 1/2/3, decomposes complex work into tasks.
- **Workers 1-8**: Provider-backed agents in git worktrees. Receive tasks, code, create PRs.

## Quick Start

```bash
# Prerequisites: node 18+, git, gh, tmux (WSL), and at least one of: codex, claude
bash setup.sh /path/to/your-project 4

# Or choose explicitly without prompts
bash setup.sh /path/to/your-project 4 --provider codex
bash setup.sh /path/to/your-project 4 --provider claude --fast-model sonnet --deep-model opus --economy-model haiku

# Submit a request
mac10 request "Add user authentication"

# Start the architect manually with the shared launcher
cd /path/to/your-project
bash ./scripts/launch-agent.sh "$(pwd)" deep /architect-loop

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

Interactive setup prompts for provider and role models when both CLIs are available. Re-run `setup.sh` to switch the whole directory between Codex and Claude Code without changing coordinator state, worktrees, or prompt mirrors.

## Autonomous Loop

For codex10 projects, use the namespaced wrapper:

```bash
cd /path/to/your-project
./.codex/scripts/codex10 loop "Continuously audit UX and implement top-priority fixes until stopped"
./.codex/scripts/codex10 loop-status
./.codex/scripts/codex10 stop-loop <loop_id>
```

Runtime path is:
1. `codex10 loop "<prompt>"` sends CLI command `loop`.
2. Coordinator calls `createLoop()` (in `coordinator/src/db.js`) and stores an `active` row in `loops`.
3. `onLoopCreated` fires and spawns `scripts/loop-sentinel.sh` in tmux (`loop-<id>` window).
4. Sentinel repeatedly runs one provider-specific loop iteration and reports heartbeat/checkpoints.

## How It Works

1. User submits a request via `mac10 request`
2. Coordinator stores it in SQLite, mails the Architect
3. Architect triages: Tier 1 (do it), Tier 2 (one worker), Tier 3 (decompose)
4. Coordinator allocates tasks to idle workers (domain affinity, mail-before-boot)
5. Workers code in git worktrees, create PRs, report completion
6. Coordinator merges PRs (4-tier: clean → rebase → AI-resolve → redo)
7. Watchdog monitors health (heartbeats, ZFC death detection, tiered escalation)

## Key Design Decisions

- **SQLite WAL** replaces 7 JSON files + jq — concurrent reads, serialized writes, no race conditions
- **Mail table** replaces 10+ signal files — reliable, ordered, read-once semantics
- **mac10 CLI** is the only interface between agents and coordinator — no file manipulation
- **tmux** replaces platform-specific terminals — works everywhere including WSL
- **Web dashboard** replaces Electron GUI — simpler, no build step
