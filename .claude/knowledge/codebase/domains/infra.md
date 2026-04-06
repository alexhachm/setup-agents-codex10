# Infra Domain

Scripts and utilities for process lifecycle, worker provisioning, provider abstraction, and atomic state management.

---

## setup.sh (767L)
Single entry-point installer for the multi-agent environment.

**Stages:**
1. Provider selection (codex/claude via MAC10_FORCE_PROVIDER or interactive prompt)
2. Preflight: checks node >=18, git, gh, tmux (WSL), provider CLI
3. Installs coordinator npm deps
4. Creates .claude/ directory structure
5. Copies templates, force-refreshes key orchestration prompts on reruns
6. Creates N git worktrees (agent-1..N) at .worktrees/wt-N with CLAUDE.md, scripts, knowledge, .codex copies
7. Adds project + worktree paths to trustedDirectories in settings.json
8. Starts coordinator via nohup node coordinator/src/index.js, waits for socket (0.2s x 30)

Key env vars: MAC10_FORCE_PROVIDER, MAC10_NAMESPACE (auto-derived from project basename), COMPOSE_PROJECT_NAME

---

## scripts/start-common.sh (492L)
Shared startup utilities sourced by all sentinels. Handles provider discovery, PID tracking for research driver/sentinel, CDP port discovery for headless Chromium, and mac10_run_noninteractive_prompt.

---

## scripts/provider-utils.sh (192L)
Pure-bash provider abstraction sourced by sentinels.

Key functions:
- mac10_load_provider_config: loads .codex/state/agent-launcher.env, exports MAC10_AGENT_PROVIDER and model vars
- mac10_provider_cli: returns codex or claude
- mac10_resolve_role_model: maps role alias (worker/loop/fast/deep/economy) to model string

Default models: codex -> gpt-5.3-codex / gpt-5.1-codex-mini; claude -> sonnet / opus / haiku

---

## scripts/worker-sentinel.sh / .claude/scripts/worker-sentinel.sh (205L each)
Worker lifecycle manager running in a tmux window. Both copies must stay in sync (coordinator uses .claude/scripts/ version).

Flow:
1. Resolves worktree (PROJECT_DIR/.worktrees/wt-N or PROJECT_DIR in sandbox mode)
2. In codex10 namespace: creates mac10 shim pointing to codex10 wrapper
3. On startup: launches agent immediately if existing task found
4. Main loop: blocks on mac10 inbox worker-N --block --timeout=300000, launches on task_assigned, falls back to orphaned-task check on timeout
5. Sends heartbeat every 25s in background while agent runs
6. On exit: stops heartbeat, kills Xvfb, calls reset-worker

Critical: Must unset CLAUDECODE before launching claude to prevent nested-session crash.

---

## scripts/loop-sentinel.sh (283L)
Architect/loop agent lifecycle wrapper. Continuously relaunches with adaptive backoff.

Key behaviors:
- Reads restart signal from .codex/signals/.codex10.restart-signal -> hot-restarts coordinator (120s cooldown)
- Pre-checks active requests via mac10 loop-requests --json; skips spawn if any in-flight; exponential backoff up to 600s on errors
- Syncs git rebase origin/main before each iteration (non-main branches only)
- Adaptive backoff: run < 30s -> double backoff (max 60s); healthy run -> reset to 30s

---

## scripts/launch-worker.sh / .claude/scripts/launch-worker.sh (55L each)
On-demand worker launcher. Creates/replaces tmux window worker-N in session NAMESPACE-PROJECT_HASH. Falls back to Windows Terminal (WSL) or background process.

---

## .claude/scripts/codex10 (12L)
Namespace wrapper. Translates codex10 <cmd> -> node mac10 --project PROJECT_ROOT <cmd> with MAC10_NAMESPACE=codex10-setup-agents.

---

## .claude/scripts/signal-wait.sh (50L)
Blocks until a signal file is created/modified. Backends: fswatch -> inotifywait -> 2s polling. Default timeout 30s.

---

## .claude/scripts/state-lock.sh (56L)
Atomic state file locking. Runs a shell command under exclusive lock.
- flock (preferred, 10s wait) -> mkdir-based spinlock (100 x 0.1s)
- Stale lock recovery: removes locks older than 30s

---

## Key Patterns

- Dual sentinel copies: scripts/ = template, .claude/scripts/ = runtime. Both must be patched for any fix.
- codex10 shim: sentinels write a mac10 shim in .codex10-shims/ delegating to codex10, so worker-loop code calls mac10 transparently.
- Knowledge not symlinked: setup.sh copies (not symlinks) knowledge into each worktree. Workers write locally; distillation syncs upstream.
- Coordinator socket: location stored in .codex/state/agent-launcher.env; sentinels poll for it with 6s timeout.
