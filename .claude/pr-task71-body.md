## Summary
- add and export completion-progress helpers in coordinator db (`getRequestLatestCompletedTaskCursor`, `hasRequestCompletedTaskProgressSince`) with null-safe cursor parsing/comparison
- persist `completion_checkpoint` when enqueueing new merge rows and backfill/migrate merge_queue to guarantee checkpoint column availability
- remove retry-gating fallbacks in `queueMergeWithRecovery` and wire direct DB helper calls so terminal merge retries can unlock on fresh completion progress

## Validation
- `npm run build` (fails: no build script in this package)
- `node --check coordinator/src/db.js`
- `node --check coordinator/src/cli-server.js`
