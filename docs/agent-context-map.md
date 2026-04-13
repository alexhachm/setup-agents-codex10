# Agent Context Map

Purpose: keep agents pointed at source files, not copied runtime output. Use this before editing and cite the source-of-truth file(s) changed in the final task report.

## Preflight

Run this before broad cleanup, provider work, startup work, or multi-file edits:

```bash
bash scripts/preflight.sh --skip-tests
```

Run without `--skip-tests` when you need the full baseline:

```bash
bash scripts/preflight.sh
```

The preflight reports branch/upstream, ahead/behind status, dirty paths, tracked generated artifacts, worktree counts, stale worktree registrations, and coordinator test status.

## Do Not Edit As Source

These are generated, runtime, copied, or disposable contexts:

- `.live-e2e-workspaces/`
- `.worktrees/`
- `.claude/state/`
- `.claude/logs/`
- `.claude/signals/`
- `coordinator/.claude/`
- `status/live-audit-fixtures/`
- `status/live-debug/`
- `status/live-feature-manifest.json`
- `status/live-pipelines/`
- `status/live-repairs/`
- `status/live-runs/`
- `docs/archive/`
- `**/__pycache__/`
- `*.pyc`
- `*.db`, `*.db-shm`, `*.db-wal`, `*.db.bak`, `*.db.corrupt.bak`

If a task points at one of these paths, find the generator or canonical source before editing.

## Safe Source Areas

Coordinator CLI and command contracts:

- `coordinator/src/cli-server.js`
- `coordinator/src/commands/`
- `coordinator/bin/mac10`
- `coordinator/tests/cli.test.js`
- `coordinator/tests/security.test.js`

Database schema and lifecycle state:

- `coordinator/src/schema.sql`
- `coordinator/src/db.js`
- `coordinator/src/db/`
- `coordinator/tests/state-machine.test.js`
- `coordinator/tests/security.test.js`

Assignment, workers, and routing:

- `coordinator/src/allocator.js`
- `coordinator/src/worker-backend.js`
- `coordinator/src/overlay.js`
- `coordinator/tests/allocator.test.js`
- `coordinator/tests/overlay-knowledge.test.js`

Merge, request completion, and recovery:

- `coordinator/src/merger.js`
- `coordinator/src/watchdog.js`
- `coordinator/src/recovery.js`
- `coordinator/tests/merger.test.js`
- `coordinator/tests/watchdog.test.js`

Startup, providers, and sentinels:

- `setup.sh`
- `start.sh`
- `scripts/start-provider.sh`
- `start-claude.sh`
- `scripts/start-common.sh`
- `scripts/provider-utils.sh`
- `scripts/provider.sh`
- `coordinator/src/provider-enablement.js`
- `coordinator/bin/provider-validate.js`
- `coordinator/tests/provider-enablement.test.js`
- `scripts/launch-agent.sh`
- `scripts/launch-worker.sh`
- `scripts/worker-sentinel.sh`
- `scripts/loop-sentinel.sh`
- `plugins/agents/<provider>/plugin.json`
- `.claude/scripts/provider-utils.sh`
- `.claude/scripts/worker-sentinel.sh`
- `.claude/scripts/loop-sentinel.sh`

Research queue and external research tooling:

- `coordinator/src/research-driver-manager.js`
- `coordinator/src/cli-server.js`
- `coordinator/src/db.js`
- `scripts/research-sentinel.sh`
- `scripts/chatgpt-driver.py`
- `scripts/compose-research-prompt.py`
- `scripts/ingest-research.py`
- `.claude/scripts/research-sentinel.sh`
- `.claude/scripts/chatgpt-driver.py`
- `.claude/scripts/compose-research-prompt.py`
- `.claude/scripts/ingest-research.py`

Knowledge and context overlays:

- `coordinator/src/knowledge-metadata.js`
- `coordinator/src/overlay.js`
- `coordinator/src/insight-ingestion.js`
- `.claude/knowledge/codebase/domains/`
- `.claude/knowledge/research/topics/`
- `coordinator/tests/knowledge-metadata.test.js`
- `coordinator/tests/overlay-knowledge.test.js`

Live E2E harness source:

- `scripts/launch-gpt-live-e2e.sh`
- `scripts/launch-gpt-live-e2e-wrapper.sh`
- `scripts/launch-gpt-live-e2e-repair.sh`
- `scripts/live-e2e-artifacts.py`
- `scripts/live-e2e-pipeline-signal.sh`
- `templates/commands/live-e2e-gpt-launcher.md`
- `templates/commands/live-e2e-gpt-repair.md`
- `docs/gpt-live-e2e-launcher-plan.md`

## Context Bundles

Task assignment bundle:

- Preferred source: `mac10 task-context <task_id>` (alias: `mac10 context-bundle <task_id>`)
- Includes task/request/worker assignment, active task sandbox, safe edit files, validation commands, domain knowledge, research rollups, known pitfalls, recent related failures, and runtime health
- Fallback source for the currently assigned task only: `mac10 my-task <worker_id>`

Validation bundle:

- Explicit task `validation` command, if present
- Relevant package scripts from `package.json`
- Focused test files for changed modules
- Recent failing output, if any

Startup/provider bundle:

- `setup.sh`
- `start.sh`
- `scripts/start-provider.sh`
- `start-claude.sh`
- `scripts/start-common.sh`
- `scripts/provider-utils.sh`
- `scripts/provider.sh`
- `coordinator/src/provider-enablement.js`
- `coordinator/bin/provider-validate.js`
- `scripts/launch-agent.sh`
- `scripts/launch-worker.sh`
- `coordinator/tests/provider-enablement.test.js`
- `plugins/agents/<provider>/plugin.json`
- active `.claude/scripts/*` provider/sentinel files

Merge/recovery bundle:

- `coordinator/src/merger.js`
- `coordinator/src/watchdog.js`
- `coordinator/src/recovery.js`
- `coordinator/src/db.js`
- `coordinator/tests/merger.test.js`
- `coordinator/tests/watchdog.test.js`

Research bundle:

- `coordinator/src/cli-server.js`
- `coordinator/src/commands/`
- `coordinator/src/db.js`
- `coordinator/src/research-driver-manager.js`
- `scripts/research-sentinel.sh`
- `scripts/chatgpt-driver.py`
- `.claude/knowledge/research/topics/`

## Reporting Rule

Every worker completion report should include:

- Source-of-truth file(s) edited
- Generated/runtime files intentionally ignored
- Validation command(s) run
- Any task that was blocked by project direction or destructive cleanup risk
