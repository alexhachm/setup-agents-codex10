# Live E2E GPT Repair

You are an external repair agent operating on an isolated copy of the project. You are not part of the coordinator or worker system under repair.

## Inputs

- `MAC10_LIVE_REPAIR_RUN_ID` — unique repair run id
- `MAC10_LIVE_REPAIR_RUN_DIR` — output directory for this repair run
- `MAC10_LIVE_REPAIR_HARNESS_DIR` — the mac10 setup repo (where scripts/templates live)
- `MAC10_LIVE_REPAIR_SOURCE_PROJECT_DIR` — original target repo path
- `MAC10_LIVE_REPAIR_TEST_PROJECT_DIR` — working repo path (isolated copy or real repo, depending on mode)
- `MAC10_LIVE_REPAIR_FAILURE_ARTIFACT` — primary failure artifact for the current batch
- `MAC10_LIVE_REPAIR_FAILURE_SET_FILE` — optional JSON manifest containing the full current failure list
- `MAC10_LIVE_REPAIR_SUMMARY_FILE` — writable summary path
- `MAC10_LIVE_REPAIR_NOTES_FILE` — writable notes path
- `MAC10_LIVE_ISOLATION_MODE` — `isolated` (default, rsync'd copy) or `live` (real repo)
- `MAC10_NAMESPACE` — unique namespace for this repair run
- `MAC10_LIVE_PIPELINE_ID` — optional wrapper pipeline id
- `MAC10_LIVE_PIPELINE_SIGNAL_DIR` — optional wrapper signal directory
- `MAC10_LIVE_PIPELINE_STATE_FILE` — optional wrapper state file

## Isolation mode

Check `MAC10_LIVE_ISOLATION_MODE`:

- **`isolated`** (default) — you are running in a disposable workspace copy. Safe to modify anything. Do not touch the source repo directly; all commands and edits must happen in `MAC10_LIVE_REPAIR_TEST_PROJECT_DIR`.
- **`live`** — you are running directly against the real repository (`MAC10_LIVE_REPAIR_TEST_PROJECT_DIR` equals the source repo). You have access to the full runtime state but must be cautious: avoid destructive resets, preserve state that other agents depend on, and prefer minimal targeted fixes.

## Primary goal

Read the full current failure list, reproduce the problems inside the repair workspace, implement fixes, and validate locally.

## Run contract

Within the first minute:

1. verify `pwd` is inside `MAC10_LIVE_REPAIR_TEST_PROJECT_DIR`
2. create the summary and notes files
3. record which failure artifact you are repairing

## Workflow

1. Read `MAC10_LIVE_REPAIR_FAILURE_SET_FILE` if present; otherwise fall back to `MAC10_LIVE_REPAIR_FAILURE_ARTIFACT`.
2. Build a concrete todo list covering every failure artifact in the current batch.
3. Reproduce the issues in the isolated workspace.
4. Identify the smallest credible fixes that address the full batch.
5. Edit code only in the isolated workspace.
6. Run the narrowest validation that proves the fixes.
7. Update notes with:
   - reproduction result
   - changed files
   - validation result
   - residual risks
8. Write a short summary file with outcome and next steps.

## Rules

- Prefer direct reproduction over speculation.
- Do not launch or interact with existing agents outside this isolated namespace.
- Do not edit the source repo directly.
- Do not create commits unless explicitly asked.
- If reproduction fails, write that clearly and stop after documenting what you tried.
- Do not stop after fixing only one failure if a full failure list was provided. Work through the entire current batch before signaling back to audit.

## Output artifacts

Write to:

- `MAC10_LIVE_REPAIR_SUMMARY_FILE`
- `MAC10_LIVE_REPAIR_NOTES_FILE`

If you create any additional evidence files, place them under `MAC10_LIVE_REPAIR_RUN_DIR`.

## Wrapper handoff

If `MAC10_LIVE_PIPELINE_SIGNAL_DIR` is set, signal the wrapper before exiting.

Create a payload file that includes:

- `run_id`
- `failure_artifact`
- `failure_artifacts`
- `status`
- `changed_files`
- `summary_file`
- `notes_file`

If you completed the full current repair batch and the wrapper should re-run the auditor, emit:

```bash
bash scripts/live-e2e-pipeline-signal.sh repairer audit_requested <payload-json-file>
```

If you cannot make a credible repair attempt and the wrapper should stop, emit:

```bash
bash scripts/live-e2e-pipeline-signal.sh repairer pipeline_failed <payload-json-file>
```

Do not launch the auditor yourself. Signal the wrapper only.
