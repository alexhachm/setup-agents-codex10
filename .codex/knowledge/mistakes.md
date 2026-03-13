# Known Pitfalls

Mistakes made by workers. Read before starting any task to avoid repeating them.

## Common Mistakes
- `gh pr create` can fail inside this Windows worktree layout with `fatal: not a git repository: .../.git/worktrees/wt-2`; run PR creation from the main repo root with explicit `--repo/--head/--base` if that occurs.
- Avoid unescaped backticks in shell-quoted PR bodies; they trigger command substitution in bash.
- When creating PRs from this Windows worktree, run `gh pr create` from the main repo root and avoid backticks in shell-quoted bodies; otherwise shell substitution/worktree git-path errors can break PR creation.

- 2026-03-12: In this Windows worktree layout, paths under .codex may be symlink-backed and not commitable from the worktree (git add can fail with "beyond a symbolic link"); treat knowledge updates as runtime notes, not PR files.

- 2026-03-12: In merger flows, do not assume `checkRequestCompletion` is the only completion emitter; `onTaskCompleted` can also emit `request_completed`, so idempotency must guard both paths.

- 2026-03-12: Rebase conflict relands for ownership guards must preserve both assignment and worker-current-task checks; restoring only `task.assigned_to` validation misses unauthorized `complete-task`/`fail-task` takeover scenarios.

- 2026-03-13: For coordinator-routing usage telemetry tasks, verify existing canonical + alias normalization coverage in `coordinator/tests/cli.test.js` before editing; several requests are validation-only on synced `origin/main`.

- 2026-03-13: When syncing task branches in this multi-agent setup, avoid rebasing onto `origin/agent-N` unless required; it can pull in unrelated in-flight worker commits. Prefer `git fetch origin && git rebase origin/main` for merge-clean validation work.

- 2026-03-13: For validation-only dashboard-ui tasks, verify whether target telemetry/test changes are already present on synced `origin/main` before editing to avoid redundant diffs; still run the specified regression command and report completion with explicit validation evidence.

- 2026-03-13: Avoid unescaped backticks in `gh pr create --body` text; bash command substitution can run unintended commands even if PR creation still succeeds.

- 2026-03-13: For worker-loop branch parsing, avoid raw `sed 's/agent-//'` on suffixed branch names (e.g., `agent-1-task...`); normalize to numeric prefix with `sed -E 's/^agent-([0-9]+).*/\1/'` before codex10 worker commands.
- 2026-03-13: When re-landing overlap-validation fixes on worker branches with prior reland commits, check for duplicated `npm_config_if_present` tests in `coordinator/tests/cli.test.js` before shipping to avoid redundant regression blocks.
- 2026-03-13: When creating `codex10 create-task` JSON in shell, use a single-quoted heredoc (`<<'JSON'`) and avoid unescaped backticks in descriptions; otherwise bash command substitution can execute unintended commands and corrupt task text.
- 2026-03-13: For usage alias objects that fold into a canonical total (like `usage.cache_creation`), validate each nested numeric field before summing; validating only the folded total can accidentally accept non-integer nested values.

- 2026-03-13: `codex10 complete-task` may normalize branch metadata to canonical worker branch names (for example `agent-2`) and warn on mismatches; expect/allow that normalization when reporting completion from task-specific branch names.
- 2026-03-13: For merge-validation functional-conflict tasks, check `git diff origin/main -- <scoped files>` before attempting shipping; if zero diff and tests pass, avoid forcing no-op commits/PRs and close as validation-only.
- 2026-03-13: During merge-conflict relands in `cli-server.js`, overlapping helper insertion conflicts can silently drop adjacent existing validators if conflict markers are resolved by choosing one side; manually verify both pre-existing and new helpers remain.
- 2026-03-13: Before shipping a new worker task, create/switch to a task-specific branch first; reusing a merged task branch can unintentionally push new commits onto an old PR branch history.

- 2026-03-13: For validation-only merge-conflict tasks, use `codex10 complete-task <worker> <task> "<result summary>"` (result-only positional arg) to avoid passing placeholder PR/branch values that may misparse.
