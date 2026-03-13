
## 2026-03-12 — Allocator mailbox wake-up contract
- Replace allocator loop `signal-wait.sh` usage on `.codex10.task-signal`, `.codex10.fix-signal`, and `.codex10.completion-signal` with `codex10 inbox allocator --block` as the primary wake path.
- Keep explicit polling fallback documented as `codex10 ready-tasks` + `codex10 worker-status` using adaptive cadence wording.
- Remove completion-signal watch guidance from role docs; mailbox + coordinator commands are the canonical wake/integration contract.
- In this Windows worktree layout, `.codex/*` runtime docs can be untracked; keep tracked template mirrors aligned for PR diffs.

## 2026-03-12 — Backlog drain pending-row parsing hardening
- In Step 2a backlog-drain snippets, avoid `grep '\[pending\]'` because descriptions can contain the token and inflate pending detection.
- Prefer parsing request rows once, then use anchored predicates (`$1 ~ /^req-/ && $2 == "[pending]"`) for both pending counting and oldest pending extraction.
- Preserve oldest-pending behavior by selecting the last pending row encountered from newest-first status output.

## 2026-03-12 — Backlog drain pending-row parsing
- In Step 2a queue-pressure snippets, parse status rows with anchored field predicates (`$1 ~ /^req-/` and `$2 == "[pending]"`) so descriptions containing `[pending]` do not affect pending counts.
- Preserve oldest-pending selection by retaining newest-first scan and taking the final matching pending request id.
## 2026-03-13 — Worker completion telemetry instruction parity
- Worker-facing completion docs should show `complete-task` with optional `[result] [--usage JSON]` so token/cost telemetry is captured in normal completion flow.
- Keep overlay protocol bullets and both tracked worker-loop/template mirrors aligned to avoid doc drift and merge churn.
## 2026-03-12 — Task 57 validation-drift verification
- Confirmed worker-loop/overlay docs should explicitly avoid implicit `npm run build`; rely on task-provided validation commands and include usage telemetry in `complete-task` examples.
- In this worktree, branch names may include suffixes (`agent-1-*`); worker ID extraction must keep only the numeric prefix.
- 2026-03-12: For worker-loop conflict fixes, keep branch parsing suffix-safe (`sed -E 's/^agent-([0-9]+).*/\1/'`) and state explicitly that tier shorthand validation (`tier2`/`tier3`) is not a shell command; workers should not assume `npm run build`.
- 2026-03-12: `coordinator/src/overlay.js` must render string validation payloads (including tier shorthand) with a no-implicit-build note so generated AGENTS/CLAUDE overlays match worker-loop instructions.

## 2026-03-13 — Worker-loop overlap-validation drift guard
- Keep worker loop docs suffix-safe for branch parsing with `sed -E 's/^agent-([0-9]+).*/\1/'` so suffixed branch names still resolve correct worker IDs.
- Document that `validation` tier shorthand (`tier2`/`tier3`) is workflow metadata; workers should run only explicit task commands and never infer implicit `npm run build`.
- Keep `coordinator/src/overlay.js` validation rendering resilient across string, array, and object payloads so generated overlays match worker-loop instructions.

- 2026-03-12: Keep worker-facing docs consistent on validation semantics: never imply implicit `npm run build`; for validation shorthand strings (`tier2`/`tier3`) explicitly call them metadata and direct workers to task-provided commands only.
- 2026-03-12: Keep completion syntax aligned across overlay and worker-loop mirrors as `complete-task <worker_id> <task_id> [pr_url] [branch] [result] [--usage JSON]` to preserve usage telemetry capture and avoid doc drift.

## 2026-03-12 — Master-3 role mirror validation
- For task 120, tracked mirrors `templates/docs/master-3-role.md` and `.claude/docs/master-3-role.md` already matched canonical `.codex/docs/master-3-role.md` byte-for-byte.
- Use SHA-256 comparison first for mirror tasks to avoid unnecessary doc churn when no-op parity is already satisfied.
