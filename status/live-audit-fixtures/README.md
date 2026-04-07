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
