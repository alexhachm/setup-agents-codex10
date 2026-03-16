## Summary
- add `workers.claimed_at` to schema + idempotent migration and allowlist support for existing DBs
- make worker claim/release atomic for both `claimed_by` + `claimed_at`, and clear claim metadata across assignment/reset/repair/watchdog reset paths
- switch watchdog stale-claim cleanup to evaluate claim age from `claimed_at` only, with safe skip behavior for legacy rows missing claim timestamps
- add regressions for claim timestamp behavior in watchdog, allocator, and CLI assignment/reset/repair flows

## Testing
- cd coordinator && npm test
