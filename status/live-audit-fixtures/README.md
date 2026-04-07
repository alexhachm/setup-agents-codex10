# live-audit fixtures

This directory stores immutable fixture modules for timestamped live-audit iterations.

## Contract

- Filename format: `iter-<YYYYMMDDTHHmmssZ>-<seq>.js`
- Export shape:
  - `iteration`: exact fixture id (must match filename stem)
  - `kind`: currently `tier2`
  - `createdAt`: compact UTC timestamp matching the iteration id
  - `source`: `live-audit`
- Export object is frozen with `Object.freeze(...)`.

## Registry Parity

- Every `iter-*` key in `status/live-audit-registry.js` must have a corresponding fixture file in this directory.
- `manual-probe` is an intentional exception in the registry and does not have a fixture module.

## Non-JS Liveness Markers

- `request-pipeline-smoke.txt` is a fixture-only presence marker for liveness/recovery tooling.
- Keep marker files plaintext with explicit, stable headers (`REQUEST_ID`, `DOMAIN`, `FIXTURE`, `PURPOSE`).
- Do not add liveness marker files to registry `entries` unless a runtime consumer needs keyed lookup.

## Recovery Checklist

- Confirm `request-pipeline-smoke.txt` exists and retains all four headers.
- Confirm each `iter-*` fixture filename stem appears in `status/live-audit-registry.js`.
- Prefer append-only edits for new iteration fixtures and registry keys to reduce merge/recovery noise.

## Liveness Triage Order

1. Validate fixture-only marker presence/headers (`request-pipeline-smoke.txt`).
2. Validate `iter-*` parity between fixture filenames and registry keys.
3. If both pass, treat failures as orchestration liveness issues (worker heartbeat/watchdog), not status-data drift.
4. For incidents reported as "liveness recovery exhausted after N reassignments", keep status fixtures/registry immutable and escalate to coordinator recovery.

## Failure Classification

- `worker_idle_orphan` / liveness-recovery exhaustion should not trigger status fixture rewrites when steps 1-2 pass.
- In those cases, escalate to worker heartbeat/watchdog recovery instead of editing registry keys or fixture payloads.
- Reassignments count retries; it is not evidence of fixture corruption by itself.
