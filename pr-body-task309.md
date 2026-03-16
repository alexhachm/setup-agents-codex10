## Summary
- add watchdog recovery for requests stuck in decomposed with zero tasks for >=15 minutes
- fail stale deadlocked requests with explicit diagnostic result, emit stale_decomposition_recovered telemetry, and notify master-1
- invoke decomposition recovery in both startup sweep and periodic watchdog tick
- add watchdog regressions for stale/recent/has-task decomposition cases and startup+tick execution coverage

## Validation
- cd coordinator && npm test -- tests/watchdog.test.js
