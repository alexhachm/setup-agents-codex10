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

### 2026-04-07 — Registry/Fixture Synchronization
Registry now includes all iteration fixtures present in `status/live-audit-fixtures/` (`014351Z`, `014930Z`, `015229Z`, `015519Z`, `020322Z`, `035239Z`) plus `manual-probe`.
The `iter-20260407T035239Z-1` fixture captures the live-audit rerun used to recover from the `worker_idle_orphan` retry-exhaustion merge block path.
