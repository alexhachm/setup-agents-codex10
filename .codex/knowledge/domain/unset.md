
## 2026-03-16 — Task 16 heartbeat-timeout unblock follow-up
- When a task appears assigned with existing `completed_at`/`pr_url`, treat the branch as validation-first after mandatory sync.
- `codex10 complete-task` may canonicalize branch names (task branches to `agent-N`) and still complete successfully.
- For unblock/replan flows, full coordinator regression (`npm test -- tests/state-machine.test.js`) also exercises CLI and state-machine integration paths in this repo setup.

## 2026-03-16 — Task 18 worker orchestration stability validation
- Canonical tracked runtime already contains the four durability fixes: worker-sentinel ownership-context reset passthrough + internal heartbeat loop (`scripts/worker-sentinel.sh`), stale-reset race guards + ownership-aware reset parsing (`coordinator/src/cli-server.js`), and autonomous command-template payload rejection (`coordinator/src/db.js`).
- Tier-2 verification for this follow-up should run `cd coordinator && npm test -- tests/cli.test.js tests/web-server.test.js` to cover both CLI and API rejection/ownership paths.
