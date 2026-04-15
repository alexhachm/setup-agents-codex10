# Domain: orchestration-scripts

Key files and patterns for the orchestration-scripts domain.

## Key Files

- `scripts/loop-sentinel.sh` — mac10 loop sentinel. Runs in tmux, repeatedly relaunches the configured agent for autonomous loops. Handles namespace-aware shims, heartbeats, adaptive backoff, restart signals, and pre-checks.
- `scripts/worker-sentinel.sh` — worker sentinel script
- `scripts/launch-agent.sh`, `scripts/launch-worker.sh` — agent/worker launchers
- `.claude/commands/loop-agent.md` — mac10 loop agent instructions (uses mac10 commands, .claude/ paths)

## Namespace-Aware Runtime Shims (loop-sentinel.sh)

The sentinel always launches `.claude/commands/loop-agent.md` and creates a generated `.claude/scripts/.ns-shims/mac10` wrapper that pins the current `MAC10_NAMESPACE` and project path. The shim bypasses installed wrappers that may belong to a different project.

Provider selection is currently Claude-only through `scripts/provider-utils.sh`. Future provider-plugin work should add providers behind that layer instead of restoring Codex-specific command trees.

## Pitfalls

- Worker sentinels must `unset CLAUDECODE` before launching claude in tmux (nested session rejection)
- Both `.claude/scripts/` and `scripts/` copies of sentinel scripts must be updated when making changes
- The `mac10` shim is set up in `$SHIM_DIR` for namespace isolation; prompts should call `mac10`, not retired provider aliases
