'use strict';

module.exports = Object.freeze({
  // Invariants:
  // 1) Every iter-* key must have a matching file in status/live-audit-fixtures/.
  // 2) manual-probe is intentionally registry-only (no fixture file).
  // 3) request-pipeline-smoke.txt is intentionally fixture-only and is checked by presence.
  // 4) Keep iteration ids append-only to preserve a stable live-audit timeline.
  // 5) Keep any registry/fixture exceptions documented in status/live-audit-fixtures/README.md.
  // 6) During liveness recovery, verify fixture-only markers before iter-* registry parity checks.
  // 7) If marker/parity checks pass, classify failures as orchestration liveness (worker_idle_orphan), not registry drift.
  // 8) "Liveness recovery exhausted after N reassignments" is an orchestration symptom; do not rewrite status artifacts when checks 6-7 pass.
  entries: Object.freeze({
    'iter-20260405T014351Z-1': { kind: 'tier2', createdAt: '20260405T014351Z', source: 'live-audit' },
    'iter-20260405T014930Z-1': { kind: 'tier2', createdAt: '20260405T014930Z', source: 'live-audit' },
    'iter-20260405T015229Z-1': { kind: 'tier2', createdAt: '20260405T015229Z', source: 'live-audit' },
    'iter-20260405T015519Z-1': { kind: 'tier2', createdAt: '20260405T015519Z', source: 'live-audit' },
    'iter-20260405T020322Z-1': { kind: 'tier2', createdAt: '20260405T020322Z', source: 'live-audit' },
    'manual-probe': { kind: 'tier2', createdAt: 'probe', source: 'live-audit' },
  }),
});
