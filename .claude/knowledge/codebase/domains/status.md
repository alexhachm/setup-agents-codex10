# Domain: status

**Location:** `status/`
**Purpose:** Stores immutable live-audit fixture data plus a curated registry used by status/audit workflows.

---

## Files

### `status/live-audit-registry.js`

Frozen CommonJS export containing the canonical `entries` map.

**Entry shape:**
```js
{
  kind: 'tier2',
  createdAt: '<YYYYMMDDTHHmmssZ>' | 'probe',
  source: 'live-audit'
}
```

Current registry now tracks all fixture-backed iterations plus `manual-probe`.

### `status/live-audit-fixtures/*.js`

One frozen module per live audit iteration.

**Naming:** `iter-<YYYYMMDDTHHmmssZ>-<seq>.js`

**Fixture shape:**
```js
module.exports = Object.freeze({
  iteration: 'iter-20260405T014351Z-1',
  kind: 'tier2',
  createdAt: '20260405T014351Z',
  source: 'live-audit'
});
```

Fixtures mirror registry metadata and add explicit `iteration` self-identification.

---

## Patterns

- Immutability-first: every exported object is wrapped with `Object.freeze()`.
- Data-only modules: no runtime logic, no imports, no side effects.
- Stable naming contract: iteration ID is encoded in filename and payload.
- `manual-probe` is an intentional non-timestamp sentinel for audit plumbing checks.

## Coupling

- This domain is standalone and currently has no in-repo runtime consumers outside `status/`.
- Consumers are expected to load registry/fixtures via `require()` for test/audit assertions.

## Operational Notes

- Keep registry entries synchronized with fixture files to avoid stale audit indexes.
- If new fixtures are added, update `live-audit-registry.js` in the same change.
- `manual-probe` is intentionally registry-only and should not be expected as a fixture file.
- Use deterministic key/filename order (chronological iteration ids) to reduce review noise.

### 2026-04-06 — Registry/Fixture Synchronization
Registry now includes all iteration fixtures present in `status/live-audit-fixtures/` (`014351Z`, `014930Z`, `015229Z`, `015519Z`, `020322Z`) plus `manual-probe`. This removes previous registry drift and keeps status-domain audit metadata coherent.

### 2026-04-07 — Status Domain Invariants and Parity Check
Status data is pure CommonJS data, and all exported payloads are immutable via `Object.freeze()`. The source has no in-repo runtime consumers right now, so drift prevention is primarily a maintenance concern.

Quick parity check command (run from repo root):
```bash
node -e "const fs=require('fs');const path=require('path');const r=require('./status/live-audit-registry');const fixtureDir='./status/live-audit-fixtures';const fixtures=new Set(fs.readdirSync(fixtureDir).filter(f=>f.endsWith('.js')).map(f=>path.basename(f,'.js')));const reg=new Set(Object.keys(r.entries).filter(k=>k!=='manual-probe'));const missingFixtures=[...reg].filter(k=>!fixtures.has(k));const missingRegistry=[...fixtures].filter(k=>!reg.has(k));if(missingFixtures.length||missingRegistry.length){console.error(JSON.stringify({missingFixtures,missingRegistry},null,2));process.exit(1)}console.log('status parity ok');"
```

### 2026-04-07 — Registry/Fixture Pattern Findings
`request-pipeline-smoke.txt` established a second fixture mode: non-JS, presence-based liveness markers with explicit metadata headers.
For this domain, `iter-*` remains the registry-fixture parity surface, while smoke markers may intentionally stay fixture-only and unkeyed in registry entries.
To reduce worker liveness recovery noise, keep fixture marker headers stable and preserve append-only ordering for iteration ids and registry keys.
