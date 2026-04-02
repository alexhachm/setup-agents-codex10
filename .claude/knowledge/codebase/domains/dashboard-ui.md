# dashboard-ui Domain Knowledge

## Key Files
- `coordinator/src/web-server.js` — Express REST API + WebSocket broadcast. State broadcast via `buildStatePayload()`. Add new top-level fields there for WS clients.
- `gui/public/app.js` — Multi-tab dashboard. Per-tab state in `createTabState()`. Render in `renderState()`. WS messages handled in `connectTab` onmessage.
- `gui/public/index.html` — Dashboard HTML. Panel sections with `id="*-panel"` and `class="panel-header" data-panel="*"` for collapse support.
- `gui/public/popout.js` — Popout windows. Register panels in `PANELS` object as `{ title, render }`. Data comes from WS state.

## Patterns
- New API endpoints go before `// WebSocket for live updates` section in web-server.js
- DB config values use `db.getConfig(key)` / `db.setConfig(key, value)` pattern
- Direct DB queries use `db.getDb().prepare(...).get()/.all()`
- WS broadcast: add fields to `buildStatePayload()` return object — all connected clients get them on every poll cycle
- Specific broadcast events (e.g. `batch_config_updated`) use `broadcast({ type: '...', ...data })` pattern
- Config validation: return 400 + `{ ok: false, error }` on bad input; 200 + `{ ok: true }` on success

## Batch Observability
- `buildBatchStatus()` in web-server.js: queries research_batches, research_intents, research_batch_stages, research_intent_fanout, activity_log
- Config keys: research_batch_max_size (default 5), research_batch_timeout_ms (default 120000), research_batch_candidate_limit (default 200), research_planner_interval_ms (default 5000)
- Dedupe hit rate computed from activity_log WHERE actor='coordinator' AND action IN ('research_intent_deduplicated','research_intent_enqueued')

## Gotchas
- `gh pr create` must be run from repo root (`/mnt/c/Users/Owner/Desktop/setup-agents-codex10`), not from a worktree path — worktrees cause "not a git repository" error with gh CLI
- Edit tool requires reading the file first in the same session — always Read before Edit
- index.html is plain HTML, not checked by `node --check`; verify manually or via tests
