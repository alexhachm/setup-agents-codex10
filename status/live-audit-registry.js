'use strict';

module.exports = Object.freeze({
  // Invariants:
  // 1) Every iter-* key must have a matching file in status/live-audit-fixtures/.
  // 2) manual-probe is intentionally registry-only (no fixture file).
  // 3) request-pipeline-smoke.txt is intentionally fixture-only and is checked by presence.
  // 4) Keep iteration ids append-only to preserve a stable live-audit timeline.
  entries: Object.freeze({
    'iter-20260405T014351Z-1': { kind: 'tier2', createdAt: '20260405T014351Z', source: 'live-audit' },
    'iter-20260405T014930Z-1': { kind: 'tier2', createdAt: '20260405T014930Z', source: 'live-audit' },
    'iter-20260405T015229Z-1': { kind: 'tier2', createdAt: '20260405T015229Z', source: 'live-audit' },
    'iter-20260405T015519Z-1': { kind: 'tier2', createdAt: '20260405T015519Z', source: 'live-audit' },
    'iter-20260405T020322Z-1': { kind: 'tier2', createdAt: '20260405T020322Z', source: 'live-audit' },
    'manual-probe': { kind: 'tier2', createdAt: 'probe', source: 'live-audit' },
  }),
});
