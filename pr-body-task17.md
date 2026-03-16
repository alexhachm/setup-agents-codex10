## Summary
- add browser-offload task persistence columns to the tasks schema
- add idempotent DB migration support and task update allowlist entries for browser-offload fields
- add a guarded browser-offload lifecycle transition helper to enforce valid state progression
- add state-machine regressions for valid browser-offload lifecycle flow and invalid transition rejection

## Validation
- cd coordinator && npm test -- state-machine.test.js
