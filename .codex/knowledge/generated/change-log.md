## [165] Fix launcher reliability for codex/claude startup — 2026-03-20
- Domain: launcher-startup
- Files: start-codex.sh, start-claude.sh, scripts/start-provider.sh, setup.sh, README.md
- What changed: Added missing top-level provider launchers and a shared startup wrapper, then patched setup provider selection and wrapper copy logic to prevent startup aborts.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/297
