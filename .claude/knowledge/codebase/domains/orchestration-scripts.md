# Domain: orchestration-scripts

Key files and patterns for the orchestration-scripts domain.

## Key Files

- `scripts/loop-sentinel.sh` — mac10/codex10 loop sentinel. Runs in tmux, repeatedly relaunches codex for autonomous loops. Handles namespace-aware prompt selection, heartbeats, adaptive backoff, restart signals, and pre-checks.
- `scripts/worker-sentinel.sh` — worker sentinel script
- `scripts/launch-agent.sh`, `scripts/launch-worker.sh` — agent/worker launchers
- `.claude/commands/loop-agent.md` — mac10 loop agent instructions (uses mac10 commands, .claude/ paths)
- `.codex/commands-codex10/loop-agent.md` — codex10 loop agent instructions (uses codex10 commands, .codex/ paths)
- `.claude/commands-codex10/loop-agent.md` — backward-compat copy of codex10 loop agent

## Namespace-Aware Prompt Selection (loop-sentinel.sh)

For `MAC10_NAMESPACE=codex10`:
1. Prefer `.codex/commands-codex10/loop-agent.md`
2. Fallback to `.codex/commands/loop-agent.md`
3. Never use `.claude/commands/loop-agent.md` for codex10 (it uses mac10 commands)

For mac10 (default): use `.claude/commands/loop-agent.md`

## Pitfalls

- Worker sentinels must `unset CLAUDECODE` before launching claude in tmux (nested session rejection)
- Both `.claude/scripts/` and `scripts/` copies of sentinel scripts must be updated when making changes
- The `mac10` shim is set up in `$SHIM_DIR` for codex10 namespace — commands in prompt files can use either `mac10` (via shim) or `codex10` directly
