# GPT Live E2E Launcher Plan

## Why this exists

Current tests prove a large amount of coordinator behavior in isolation, but they do not prove that a real operator can start the stack, submit work, watch agents react, and recover from failures. The gap is especially visible in features that depend on long-running sentinels, worker lifecycle, browser offload, loop orchestration, and watchdog recovery.

The next step should be a GPT-driven launcher that starts a live audit run, gives one GPT agent a strict operator/tester prompt, and makes that agent walk the product like a patient human:

- use real launch scripts and `mac10` commands
- stay on the supported operator path: `./start.sh` plus `mac10` CLI
- wait for asynchronous state changes
- keep a checklist of user-facing features
- mark each feature `pending`, `running`, `passed`, `failed`, or `blocked`
- collect evidence on every failure before attempting recovery

## Scope

This launcher should validate the user-facing surface, not just internals:

1. stack bootstrap and shutdown
2. request intake and request visibility
3. fill-knowledge pipeline
4. autonomous loop pipeline
5. research request pipeline
6. worker task lifecycle
7. merge/integration/repair flows
8. browser-offload flows
9. knowledge/memory flows
10. sandbox/microvm controls
11. status and diagnostics reporting

## Proposed files

- `scripts/launch-gpt-live-e2e.sh`
  Starts the stack if needed, prepares a run directory, then launches GPT with the live-audit prompt.
- `templates/commands/live-e2e-gpt-launcher.md`
  The actual agent instructions for live testing.
- `status/live-feature-manifest.json`
  Machine-readable index of user-facing features and the commands/flows that exercise them.
- `status/live-runs/<run_id>/`
  Per-run outputs: checklist, logs, screenshots, DOM snapshots, debug notes, and final summary.

## Launcher behavior

The shell launcher should:

1. Resolve project root and create `RUN_ID`.
2. Create `status/live-runs/$RUN_ID/`.
3. Copy the feature manifest into the run folder as the working checklist.
4. Start the stack with the supported launcher `./start.sh` if the coordinator is not already running.
5. Seed environment variables for the GPT run:
   - `MAC10_LIVE_RUN_ID`
   - `MAC10_LIVE_RUN_DIR`
   - `MAC10_LIVE_FEATURE_MANIFEST`
   - `MAC10_LIVE_CHECKLIST`
6. Launch GPT against `templates/commands/live-e2e-gpt-launcher.md`.
7. Leave the agent in charge of execution, evidence capture, and debug notes.
8. Exit non-zero if any required feature ends in `failed`.

## GPT prompt requirements

The GPT live-audit prompt should force these rules:

- interact like a human operator, not a unit test harness
- test through public entrypoints first: launchers, `mac10`, and HTTP endpoints
- stay off deprecated provider-specific or GUI entrypoints; use the current launchers and `mac10` commands
- never "assume pass" from unit tests
- treat waits and polling as part of the product behavior
- after each feature, update the checklist artifact on disk
- for failures, capture:
  - exact command
  - stdout/stderr summary
  - relevant `mac10 status`
  - relevant `mac10 log`
  - request/task history if applicable
  - DOM snapshot or screenshot for UI/browser issues
- attempt bounded recovery once, then leave a reproducible failure bundle

## Run model

The live run should be scenario-based, not command-by-command only.

Each scenario should contain:

- `scenario_id`
- `goal`
- `commands`
- `expected_signals`
- `evidence`
- `recovery_steps`
- `required`

The GPT agent should execute scenarios in dependency order:

1. bootstrap
2. fill-knowledge request path
3. request creation and full downstream visibility
4. worker assignment lifecycle
5. autonomous loop creation and iteration visibility
6. research queue happy path
7. browser-offload handshake
8. knowledge and memory reads/writes
9. sandbox and microvm probes
10. repair and recovery probes

## Human-like environment

"Human-like" here should mean:

- start with whatever the operator actually sees first
- use the supported CLI-first flow instead of deprecated dashboard or legacy provider launchers
- use the same commands an operator would actually run
- respect startup delays, backoff, and asynchronous transitions
- verify visible state before continuing
- prefer sequential, explainable flows over hidden direct DB mutation
- use browser/DOM helpers only where the feature actually has a browser-facing surface

This should not mean random behavior. The run must stay deterministic enough to debug.

## Feature indexing strategy

The feature manifest should have two layers:

1. `feature_groups`
   Broad operator-facing areas like lifecycle, request flow, worker flow, loop flow, browser flow.
2. `scenarios`
   Concrete end-to-end checks that can be marked off by the GPT agent.

`coordinator/bin/mac10` is the authoritative source for CLI feature inventory. Launch scripts and helper scripts extend that inventory for the live suite.

## Minimum first implementation

Phase 1 should ship only what is needed to get useful failures quickly:

1. launcher script
2. prompt template
3. feature manifest
4. per-run checklist writer
5. evidence bundle writer

Phase 1 does not need:

- parallel scenario execution
- flaky retry heuristics beyond one bounded retry
- full browser automation for every feature
- automatic bug filing

## Suggested success criteria

The launcher is good enough when a single command can:

1. start the system
2. launch GPT into a live audit prompt
3. walk the indexed feature checklist
4. produce a final artifact that clearly says what passed, what failed, and why

## Known repo fit

This plan aligns with what already exists:

- `scripts/launch-agent.sh` already launches Codex with a prompt file.
- `scripts/loop-sentinel.sh` already models long-running GPT/Codex invocation with checkpoints.
- `scripts/take-dom-snapshot.sh` and `scripts/take-screenshot.sh` already provide lightweight UI evidence capture.
- `status/live-audit-registry.js` already suggests an intended live-audit concept, but it is only a stub today.
- `coordinator/bin/mac10` already exposes a large user-facing command surface that can be indexed directly.

## Immediate next implementation step

Implement `scripts/launch-gpt-live-e2e.sh` to wire the new prompt template and manifest together, then let the GPT agent execute only the highest-value scenarios first:

- lifecycle
- fill-knowledge
- request flow
- worker flow
- loop flow
- research flow
- browser-offload smoke
