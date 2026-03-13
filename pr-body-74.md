## Summary
- add fail-task CLI parsing for optional --usage JSON while preserving free-form error text
- extend fail-task server validation/handling to normalize usage telemetry via complete-task canonical+alias path, persist usage_* task columns, and include usage in task_failed mail/log payloads
- add fail-task regression coverage for canonical + alias acceptance, unknown/conflicting usage-key rejection, and persisted/payload parity checks

## Validation
- cd coordinator && npm test -- coordinator/tests/cli.test.js
