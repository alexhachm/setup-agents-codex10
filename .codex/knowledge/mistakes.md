# Known Pitfalls

Mistakes made by workers. Read before starting any task to avoid repeating them.

## Common Mistakes
- **Assigning bootstrap-dependency tasks to workers**: If the task is to create a file that workers source at startup, all workers will crash. Architect must handle directly.
- **Not verifying fix existence before task creation**: Loop agents submit requests for fixes already on main. Worker-2 correctly identified req-ccee68d5 as stale (commit 0bfc94a already had the fix).
- **Multiple coordinator processes**: Old coordinator process (PID 257954) survived restarts and kept handling socket connections with stale code. Always verify single process after restart with `ps aux | grep index.js`.
- **Merger validation running from wrong directory**: `npm test` must run from `coordinator/` subdir, not project root. Overlap validation was calling `npm run build` from worktree root where no package.json exists.
