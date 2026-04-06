# Domain: status

**Location:** `status/`
**Purpose:** Provides live-audit test fixtures and a registry for integration/audit testing of the multi-agent system.

---

## Files

### `live-audit-registry.js`

A frozen CommonJS module exporting a single `entries` object (also frozen). Keys are iteration IDs or the special `manual-probe` key.

**Registry entry shape:**
```js
{
  kind: 'tier2',         // tier of the audit entry (always 'tier2' so far)
  createdAt: '<YYYYMMDDTHHmmssZ>' | 'probe',  // ISO-compact timestamp, or 'probe' for manual
  source: 'live-audit'   // always 'live-audit'
}
```

The registry holds a static curated set of iteration IDs. Not all fixtures are reflected here — fixtures grow faster than registry entries.

Special entry: `manual-probe` has `createdAt: 'probe'` — used to test the audit system without a real iteration timestamp.

---

### `live-audit-fixtures/`

Directory of individual iteration fixture files. Each fixture is a frozen CommonJS module.

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

Fields mirror the registry entry, plus an explicit `iteration` self-identifier.

---

## Patterns

- **Immutability:** All exports use `Object.freeze()` — data is read-only by design.
- **Registry vs Fixtures:** Registry is a sparse curated index; fixtures directory grows with each audit run and may contain more iterations than the registry lists.
- **`manual-probe`:** Special entry for testing the audit plumbing without a real timestamp.
- **Tier:** All current entries are `tier2`. `kind` field supports future tier3 entries.
- **No runtime logic:** Purely data — no functions, no imports, no side effects.

## Usage

Consumers `require()` the registry to enumerate known audit entries, or `require()` individual fixture files by iteration ID for test assertions.
