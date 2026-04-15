# Reconciliation Report: 10.1 vs origin/main

Generated: 2026-04-13

## Branch Summary

| Metric | Value |
|--------|-------|
| Merge base | `b3a7adb` (2026-04-05) |
| Commits on `10.1` not on `origin/main` | 37 |
| Commits on `origin/main` not on `10.1` | 47 |
| Files changed on `10.1` | 362 (29,583 insertions, 33,620 deletions) |
| Files changed on `origin/main` | 116 (7,064 insertions, 113 deletions) |
| Files changed on **both** branches | 22 |

## Both-Side Changed Files (Conflict Candidates)

These 22 files were modified on both branches since the merge base:

| File | Keep/Drop Callout |
|------|-------------------|
| `coordinator/src/cli-server.js` | **Keep 10.1** — has task-state schema, reroute, provider-neutral changes |
| `coordinator/src/db.js` | **Keep 10.1** — has task-state columns (blocking, superseded, failed_needs_reroute) |
| `coordinator/src/index.js` | **Keep 10.1** — provider-neutral startup |
| `coordinator/src/knowledge-metadata.js` | **Keep 10.1** — expanded health check, canonical layout |
| `coordinator/src/watchdog.js` | **Merge carefully** — origin/main added stale heartbeat guard |
| `coordinator/tests/cli.test.js` | **Merge carefully** — both added tests, 10.1 has more |
| `setup.sh` | **Keep 10.1** — major provider-neutral rewrite |
| `gui/public/app.js` | **Drop origin/main** — GUI removed on 10.1 |
| `gui/public/index.html` | **Drop origin/main** — GUI removed on 10.1 |
| `gui/public/popout.js` | **Drop origin/main** — GUI removed on 10.1 |
| `scripts/chatgpt-driver.py` | **Merge carefully** — both modified |
| `scripts/research-sentinel.sh` | **Merge carefully** — both modified |
| `scripts/start-common.sh` | **Merge carefully** — both modified |
| `status/live-audit-fixtures/iter-20260405T015519Z-1.js` | **Drop origin/main** — status fixtures removed on 10.1 |
| `status/live-audit-registry.js` | **Drop origin/main** — registry removed on 10.1 |
| `.claude/commands/live-e2e-gpt-launcher.md` | **Keep 10.1** — newer version |
| `.claude/commands/live-e2e-gpt-repair.md` | **Keep 10.1** — newer version |
| `.claude/knowledge/codebase/domains/coordinator-extensions.md` | **Merge carefully** — both added domain docs |
| `.claude/knowledge/codebase/domains/coordinator-routing.md` | **Merge carefully** — both added domain docs |
| `.claude/knowledge/codebase/domains/infra.md` | **Merge carefully** — both added domain docs |
| `.claude/knowledge/codebase/domains/status.md` | **Merge carefully** — both added domain docs |
| `README.md` | **Merge carefully** — origin/main has onboarding improvements |

## Keep/Drop Analysis by Cleanup Area

### GUI (Drop from origin/main)

`origin/main` still has `gui/` with minor tweaks. `10.1` fully removed GUI per owner direction. Integration branch should **not** carry GUI files. Origin/main GUI commits to skip: `2538558`, and the 3 gui file edits.

### Codex (Drop from origin/main)

`origin/main` still has `.codex/` with 80+ research notes, scripts, state files, and even Python bytecache (`.pyc`). `10.1` removed Codex as a first-class path (Phase 3). Integration branch should **not** carry `.codex/` files. Research content was migrated to `.claude/knowledge/research/` on 10.1.

### Generated Artifacts (Drop from origin/main)

`origin/main` still tracks `__pycache__/*.pyc` files and `status/live-audit-*` fixtures. `10.1` cleaned these (Phase 1). Integration branch should use 10.1's `.gitignore` rules.

### Provider Plugins (Keep from 10.1)

`10.1` introduced `plugins/agents/{claude,codex,deepseek,gemini}/plugin.json` and provider-neutral launch paths. Origin/main has none of this. Integration branch should carry the full plugin interface.

### Task-State Schema (Keep from 10.1)

`10.1` added `blocking`, `superseded`, `failed_needs_reroute`, `failed_final` task states to `db.js` and wired them into `cli-server.js`. Origin/main has none of this.

### Knowledge Layout (Keep from 10.1)

`10.1` canonicalized domain knowledge paths, added health checks, refreshed codebase map. Origin/main added domain docs that should be **merged** into 10.1's canonical layout.

### Origin/main Unique Additions (Evaluate for cherry-pick)

| Commit | Description | Recommendation |
|--------|-------------|----------------|
| `a662f9b` | auto-sync module (periodic fetch/rebase) | Cherry-pick if tests pass |
| `afd16d9` | startup validation log | Cherry-pick |
| `fd2d5db` | pre-flight ping check to start-claude.sh | Evaluate — 10.1 rewrote startup |
| `a153ea9` | mac10 start/stop integration tests | Cherry-pick |
| `8a83fd9` | stale heartbeat guard for watchdog | Cherry-pick (merge with 10.1 watchdog) |
| `2fe31f7` | unblock stuck research queue | Cherry-pick |
| `f2b68e6` | README onboarding improvements | Cherry-pick |
| `42b2d25` | preflight install hints | Evaluate |
| Various status docs | domain knowledge docs | Merge into 10.1 canonical layout |

## Recommended Landing Route

**Fresh integration branch from `origin/main` with ordered tranche application** (matches checklist recommendation).

Rationale: 10.1 has 37 commits with deep structural changes (GUI removal, Codex removal, provider plugins, task-state schema, 362 changed files). Origin/main has 47 commits including GUI/Codex activity that 10.1 intentionally removed. In-place merge/rebase would require resolving conflicts in deleted files and produce a confusing history.

### Proposed Tranches

1. **Generated-artifact cleanup** — `.gitignore` rules, tracked generated file removal
2. **GUI/Codex removal** — delete `gui/`, `.codex/`, `start-codex.sh`, related setup paths
3. **Knowledge/instruction normalization** — canonical layout, domain docs merge, health checks
4. **Provider-plugin interface** — plugin manifests, provider-neutral launch, provider-output schema
5. **Runtime/startup hardening** — `setup.sh` rewrite, `start.sh`, startup phases, loop controls
6. **Merge/reroute/task-state fixes** — task-state schema, reroute logic, request completion fixes

After each tranche: focused tests. After final tranche: full `scripts/preflight.sh`.

## Validation State

- `10.1` preflight: 658 tests passing, 0 failures, 0 dirty paths, 0 tracked generated artifacts, 0 prunable worktrees
- All knowledge/research dirt files committed as planning evidence

## Post-Integration Upstream Delta - 2026-04-13

After building `integrate-10.1`, `origin/main` advanced by two commits:

- `45947a1` / PR `#359`: `feat(status): add live-e2e-20260409T113511Z audit marker fixture`
- `9d5f6b1`: merge commit for PR `#359`

Decision: **drop from the integration branch.** The `HEAD..origin/main` diff reintroduces the exact surfaces this migration removes or quarantines: GUI files, `.codex` runtime paths, generated status fixtures, old Codex command shims, and deletion of the new provider/preflight/workspace-hygiene files. This is also the stale branch/PR (`agent-1`, PR `#359`) that the live audit exposed during no-edit task completion. Keeping `integrate-10.1` behind these two commits is intentional; the landing branch is meant to replace that stale mainline state, not merge it.
