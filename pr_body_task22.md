## Summary
- add allocator claim lifecycle assertions for claimed_at set/clear behavior on claim/release/reclaim
- extend CLI claim lifecycle coverage for claim-worker/release-worker, assign-task claimed-worker guard stability, stale claimed_at cleanup on assignment, and reset-worker claim clearing
- strengthen watchdog stale-claim race regression to verify fresh claimed_at survives old heartbeat and releases only after claim age exceeds threshold
- include dependency commit from task 21 (Use claimed_at for stale watchdog claim release) so the race regression is enforced against claimed_at age

## Validation
- cd coordinator && node --test tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js
- cd coordinator && npm test
