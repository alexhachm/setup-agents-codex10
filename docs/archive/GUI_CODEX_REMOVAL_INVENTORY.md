# GUI And Codex Removal Inventory

Branch: `10.1`

Purpose: keep the GUI/Codex removal grounded in actual references found with `rg`, then remove in small verified passes without damaging the Claude path or the research queue.

## Search Scope

The inventory excludes generated/bulky runtime contexts:

- `.git/`
- `node_modules/`
- `.live-e2e-workspaces/`
- `.worktrees/`
- `status/live-runs/`
- `status/live-repairs/`
- `__pycache__/`
- `*.pyc`

## Removal Groups

### Group A - Active GUI Runtime

Status: removed in pass 1.

Files removed:

- `coordinator/src/web-server.js`
- `coordinator/src/hub.js`
- `coordinator/src/instance-registry.js`
- `gui/public/app.js`
- `gui/public/index.html`
- `gui/public/popout.html`
- `gui/public/popout.js`
- `gui/public/styles.css`

Follow-up changes made:

- Removed `mac10 gui` from `coordinator/bin/mac10`.
- Removed GUI-only tests.
- Removed web-server imports from remaining tests.
- Removed `express` and `ws` from coordinator dependencies.
- Removed stale dashboard/API references from README.
- Changed live E2E preferred interface default from `gui` to `master1`.

### Group B - GUI Knowledge And Prompt Drift

Status: removed from active context in pass 1 and pass 2.

Removed or updated:

- Deleted stale `frontend` and `dashboard-ui` domain knowledge.
- Removed `web-server.js` and `gui/public` from current codebase insights.
- Replaced prompt examples that told agents to inspect `gui/` or `web-server.js`.

Still allowed:

- Generic UI/frontend/browser-preview guidance for target project tasks.
- Browser research/offload references that are part of the external research/tooling path.

### Group C - Core Browser Research And Browser Offload

Status: keep.

Reason: these are not GUI. The external research queue is core infrastructure, and some browser/session concepts belong to research/tool coordination.

Keep for now:

- `coordinator/src/cli-server.js` browser commands
- `coordinator/src/db.js` browser/session/research helpers
- `coordinator/src/schema.sql` browser research tables
- `coordinator/tests/browser-offload-batching.test.js`
- Browser-related CLI commands in `coordinator/bin/mac10`
- `scripts/chatgpt-driver.py`
- screenshot/DOM helper scripts used for target-project UI verification

### Group D - Baked-In Codex Runtime Path

Status: removed from active runtime in pass 2.

Primary references found:

- `.codex/`
- `.codex.pre-shared-*`
- `.claude/commands-codex10/`
- `.claude/scripts/codex10`
- `.claude/scripts/mac10-codex10`
- `.claude/scripts/.codex10-shims/`
- `setup.sh` Codex namespace/wrapper/copy logic
- `start-codex.sh`
- `codex-equivalents-index.md`
- `mac10-codex-migration-spec.md`
- README Codex startup/usage examples
- worker/master prompts that hardcode `codex10`
- scripts that prefer `.codex/commands*` or `.codex/state*`

Removal completed:

- Removed `.codex/`, `.codex.pre-shared-*`, stale `.claude.pre-shared-*`, `.claude/commands-codex10/`, `.claude/scripts/codex10`, `.claude/scripts/mac10-codex10`, and `.claude/scripts/.codex10-shims/`.
- Removed `start-codex.sh`, `codex-equivalents-index.md`, and `mac10-codex-migration-spec.md`.
- Migrated research topics and signal-use files into `.claude/knowledge/research/topics/` and `.claude/knowledge/signals/`.
- Moved research driver state/logs to `.claude/state` and `.claude/logs`.
- Moved research sentinel/driver scripts to `.claude/scripts`.
- Rewrote setup/startup to generate only `.claude/scripts/mac10`.
- Stopped setup from copying `.codex` into worker worktrees.
- Replaced active prompt, README, and root instruction references with `.claude/scripts/mac10` and `.claude/knowledge`.
- Kept Claude as the only built-in provider.
- Left Codex only as a future provider-plugin concept in the checklist.

### Group E - Provider-Plugin Integration

Status: not implemented yet.

Target:

- `plugins/agents/claude/plugin.json`
- `plugins/agents/codex/plugin.json`
- `plugins/agents/deepseek/plugin.json`
- `plugins/agents/gemini/plugin.json`

Coordinator should launch providers through one interface instead of hardcoded `claude`, `codex`, `codex10`, or wrapper paths.

## Verification Commands

After each removal pass:

```bash
rg -n "require\\('../src/web-server'\\)|require\\('./web-server'\\)|require\\('../src/instance-registry'\\)|require\\('./instance-registry'\\)|webServer|instanceRegistry" coordinator/src coordinator/tests
rg -n "express|\\bws\\b|serve-static" coordinator/package.json coordinator/package-lock.json coordinator/src coordinator/tests
rg -n "codex|Codex|CODEX|commands-codex10|mac10-codex10|start-codex|\\.codex" setup.sh start.sh start-claude.sh scripts .claude/scripts README.md AGENTS.md CLAUDE.md templates .claude/commands .claude/docs .claude/worker-claude.md .claude/worker-agents.md coordinator/src coordinator/tests --glob '!node_modules/**' --glob '!*.pyc'
cd coordinator && npm test
```

## Pass 1 Notes

Pass 1 intentionally did not remove browser research/offload. That surface shares words like "browser" with the old dashboard, but it is part of the core external tooling/research flow.

## Pass 2 Notes

Pass 2 removed the baked-in Codex runtime path while preserving the Claude launch path and research queue. The scoped Codex reference check now returns no active references in setup, scripts, prompts, README, root instructions, coordinator source, or coordinator tests.

Validation after pass 2:

- `bash -n` passed for setup/start scripts and active sentinels.
- Python syntax compilation passed for research driver/ingest/prompt scripts in both `scripts/` and `.claude/scripts/`.
- Focused tests passed: allocator, CLI, security, knowledge metadata, overlay knowledge, workspace hygiene.
- The 3 stale integration completion failures in `watchdog.test.js` were fixed in the next watchdog pass.
- Full coordinator test suite now passes: `cd coordinator && npm test` -> 617 passing, 0 failing.
