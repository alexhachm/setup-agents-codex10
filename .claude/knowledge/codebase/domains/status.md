# Domain: status

**Location:** `status/`
**Purpose:** Stores immutable live-audit fixture data and a curated registry used by live E2E audit workflows.

---

## Overview

The `status/` domain is the **data layer** for the live E2E audit system. It holds two types of data:

1. **Registry** (`live-audit-registry.js`) — a frozen index of known audit iterations.
2. **Fixtures** (`live-audit-fixtures/`) — per-iteration immutable data modules recording audit run metadata.

There is no runtime logic in this domain. All files are pure data — no imports, no side effects.

---

## Key Files

### `status/live-audit-registry.js`

Canonical frozen CommonJS map of all known live-audit entries.

**Entry shape:**
```js
{
  kind: 'tier2',
  createdAt: '<YYYYMMDDTHHmmssZ>' | 'probe',
  source: 'live-audit'
}
```

`createdAt` is a compact UTC timestamp for real iterations, or `'probe'` for the manual sentinel.

**Special entry:** `manual-probe` — intentional non-timestamp sentinel for testing audit plumbing. Registry-only; no corresponding fixture file.

**Invariants (codified as inline comments in the file):**
1. Every `iter-*` registry entry must have a matching fixture file in `status/live-audit-fixtures/`.
2. `manual-probe` is registry-only (no fixture file required).
3. `request-pipeline-smoke.txt` is fixture-only (intentionally absent from registry).
4. Iteration IDs are append-only — never delete or reorder.
5. Registry/fixture exceptions documented in `status/live-audit-fixtures/README.md`.
6. During liveness recovery: validate fixture-only markers before checking `iter-*` parity.
7. If marker/parity checks pass, classify failures as orchestration liveness, not registry drift.
8. "Liveness recovery exhausted after N reassignments" is an orchestration symptom; do not rewrite status artifacts when checks 6-7 pass.

---

### `status/live-audit-fixtures/*.js`

One frozen CommonJS module per live-audit iteration.

**Naming:** `iter-<YYYYMMDDTHHmmssZ>-<seq>.js`

**Fixture shape:**
```js
module.exports = Object.freeze({
  iteration: 'iter-20260405T014351Z-1',
  kind: 'tier2',
  createdAt: '20260405T014351Z',
  source: 'live-audit',
});
```

The filename stem, `iteration` field, and registry ID must all match — this triple-coupling forms the parity contract.

---

### `status/live-audit-fixtures/README.md`

Contract document for the fixtures directory. Defines:
- Filename/export shape contract
- Registry parity rules (`iter-*` must be in registry; `manual-probe` and smoke markers are documented exceptions)
- Liveness triage order: markers then iter-* parity then escalate to orchestration
- Failure classification for `worker_idle_orphan`

---

### `status/live-audit-fixtures/request-pipeline-smoke.txt`

Plaintext **presence marker** for liveness/recovery tooling (not a JS module).

**Header format:**
```
REQUEST_ID: <id>
DOMAIN: status
FIXTURE: request-pipeline-smoke
PURPOSE: smoke-check fixture presence for request pipeline
```

Fixture-only — no registry entry. Consumers verify by filesystem presence and stable header structure.

---

## Patterns

- **Immutability-first:** All exported objects use `Object.freeze()`.
- **Data-only modules:** No imports, no runtime logic, no side effects.
- **Naming/payload coupling:** Fixture filename stem = `iteration` field = registry ID.
- **Two fixture modes:** JS modules (`iter-*`) for structured audit metadata; plaintext markers (`*.txt`) for presence-based liveness checks.
- **Registry as index:** Registry enumerates known iterations; fixtures carry full metadata per iteration.
- **Append-only evolution:** New entries are appended, never inserted or removed.

---

## Coupling

- Standalone domain — no in-repo runtime consumers as of 2026-04-07.
- Consumers use `require()` on registry/fixtures for test or audit assertions.
- `.claude/commands/live-e2e-gpt-launcher.md` and `live-e2e-gpt-repair.md` describe the broader live E2E pipeline these fixtures support, but do not import them directly.

---

## Operational Notes

### Parity Check Command

Run from repo root to assert registry/fixture consistency:
```bash
node -e "const fs=require('fs');const path=require('path');const r=require('./status/live-audit-registry');const fixtureDir='./status/live-audit-fixtures';const fixtures=new Set(fs.readdirSync(fixtureDir).filter(f=>f.endsWith('.js')).map(f=>path.basename(f,'.js')));const reg=new Set(Object.keys(r.entries).filter(k=>k!=='manual-probe'));const missingFixtures=[...reg].filter(k=>!fixtures.has(k));const missingRegistry=[...fixtures].filter(k=>!reg.has(k));if(missingFixtures.length||missingRegistry.length){console.error(JSON.stringify({missingFixtures,missingRegistry},null,2));process.exit(1)}console.log('status parity ok');"
```

### Adding a New Iteration
1. Create `status/live-audit-fixtures/iter-<timestamp>-<seq>.js` with the frozen module.
2. Add the matching entry to `status/live-audit-registry.js` in the same commit.
3. Keep entries in chronological order (append-only).
4. Do not add `manual-probe` or smoke marker files to registry entries.

### Liveness Triage Order
1. Validate `request-pipeline-smoke.txt` exists with all four headers.
2. Validate `iter-*` parity between fixture files and registry entries.
3. If both pass, failure is orchestration liveness (heartbeat/watchdog/reassignment), not status-domain data drift.
4. "Liveness recovery exhausted after N reassignments" is retry telemetry; only patch status files when there is concrete evidence of missing headers or registry/fixture mismatch.

---

## Historical Notes

### 2026-04-05 — Initial Fixture Set
Five `iter-20260405T*` fixtures created as the first batch of live-audit records.

### 2026-04-06 — Registry/Fixture Synchronization
Registry synced to include all five fixture-backed iterations plus `manual-probe`. Eliminated prior registry drift where the registry listed different iteration IDs than the fixtures directory.

### 2026-04-07 — Smoke Marker and Invariant Codification
- `request-pipeline-smoke.txt` added as a plaintext liveness marker (fixture-only).
- Inline invariant comments added to `live-audit-registry.js`.
- `live-audit-fixtures/README.md` created with full contract, triage order, and failure classification.
- Liveness recovery decision rules codified: marker check -> parity check -> escalate to orchestration.

### 2026-04-07 — Idle/Orphan Recovery Rule
When `worker_idle_orphan` liveness recovery exhausts retries, run marker-header and `iter-*` parity checks before touching status artifacts. If both checks pass, route remediation to coordinator liveness paths, not status-domain data patching.
