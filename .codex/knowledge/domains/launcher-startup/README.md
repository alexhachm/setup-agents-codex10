# Launcher Startup Domain

## Scope
Top-level startup entrypoints and shared setup/launcher plumbing that bootstraps providers and master loops.

## Invariants
- Top-level provider launchers must exist at repo root: `start-codex.sh` and `start-claude.sh`.
- Provider-specific launchers should route through one shared script (`scripts/start-provider.sh`) to avoid drift.
- `setup.sh` must support deterministic non-interactive provider selection via `MAC10_FORCE_PROVIDER`.
- Wrapper copy steps in `setup.sh` must guard self-copy cases (`src == dst`) to avoid `cp` aborts under `set -e`.

## Validation Checklist
- `bash -n setup.sh scripts/start-provider.sh start-codex.sh start-claude.sh`
- Run provider launcher smoke tests on temp git repos for both `codex` and `claude`.
- Confirm setup reaches completion and prints manual master-launch fallback when Windows Terminal is unavailable.

## Changelog (last 5)
- 2026-03-20 (T-165): Restored missing top-level provider launchers, added shared provider launcher wrapper, added forced-provider support in setup, and fixed setup self-copy crash in wrapper alias copy path.
