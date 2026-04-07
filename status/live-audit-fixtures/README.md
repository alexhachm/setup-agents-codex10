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
