# Domain: coordinator-routing

Knowledge for the coordinator routing and CLI validation layer.

## Key Files
- `coordinator/src/cli-server.js` — main CLI server; contains COMMAND_SCHEMAS (line ~407) and validateCommand (line ~2138)
- `coordinator/tests/cli.test.js` — integration tests using sendCommand() helper

## COMMAND_SCHEMAS Pattern
Each command in the switch statement should have a matching COMMAND_SCHEMAS entry. Schema format:
```javascript
'command-name': {
  required: ['field1', 'field2'],   // fields that must be present and non-null
  types: { field1: 'string', field2: 'number' },  // type constraints
  allowed: ['field1', 'field2', 'field3'],  // (optional) strips unknown keys for create-task
}
```
- `validateCommand` returns early (no error) for commands with no schema — they go to the switch default ("Unknown command")
- Schemas don't require handlers to exist; they just validate at the boundary

## Research Command Systems (two separate systems)
1. **Intent-batch system** — `research-intent-enqueue`, `research-batch-*`, `research-complete` (intent_id), `research-fail` (intent_id+error)
2. **Research-queue system** — `queue-research`, `research-status`, `research-gaps`, `research-next`, `research-requeue-stale`, `research-start`
   - Schemas added in task 122; handlers not yet in worktree (in main local repo only)

## Worktree vs Main Repo Line Numbers
The worktree cli-server.js has 4336+ lines (much larger than main's 2267 lines). Task descriptions that reference line numbers like "line 171" or "line 914" are referring to the main local repo, not the worktree.

## Merger Dirty-Worktree Handling
- `tryRebase` uses `git checkout . && git clean -fd` (hard reset) before rebase, NOT stash
- Hard reset is more reliable than stash for the merger's purpose (uncommitted state in worktrees is accidental)
- Log event emitted: `dirty_worktree_reset` with fields `branch`, `reason: 'dirty_worktree_before_rebase'`, `path`

## Merger Stale Entry Purge
- `processQueue` purges `merge_queue` entries with status `failed` or `conflict` older than 600 minutes
- Purge runs every processQueue cycle (every 5 seconds); only logs when entries are actually deleted
- Log event: `stale_merge_entries_purged` with `count`

## Merger Validation (script-aware)
- `getDefaultValidationCommand` reads package.json: prefers `npm test` if `scripts.test` exists, else `npm run build` if `scripts.build` exists, else skips
- No hardcoded `npm run build` — the command is constructed only when `scripts.build` is confirmed in package.json

## Test Pattern for Validation
Use `sendCommand(command, args)` to test validation errors:
```javascript
const res = await sendCommand('command-name', { /* missing or wrong-typed field */ });
assert.strictEqual(res.error, 'Missing required field "field" for command "command-name"');
assert.strictEqual(res.error, 'Field "field" must be of type number');
```
