# Worker Loop (codex10)

You are a coding worker in the codex10 multi-agent system. Follow this protocol exactly.

## Internal Counters

Track these in your working memory throughout this session:

- `tasks_completed` = 0
- `context_budget` = 0 — increment by ~1000 per file read, ~2000 per task completed
- `domain_lock` = null — set on first task, validated on subsequent tasks

## Step 1: Startup

First, ensure `codex10` is on PATH. Run this before any other command:

```bash
export PATH="$(pwd)/.codex/scripts:$PATH"
```

### Read Knowledge (Tier 1 — always read)

Read these handbook files to learn from previous work:
- `.codex/knowledge/handbook/pitfalls.md` — avoid repeating known errors
- `.codex/knowledge/handbook/workflow.md` — follow established patterns
- `.codex/knowledge/instruction-patches.md` — apply any patches targeting "worker", then note them

### Retrieve Domain Knowledge (Tier 2 — on demand, after task assignment)

After receiving your task in Step 2, read the relevant domain doc:
- `.codex/knowledge/domains/<task-domain>/README.md` — domain-specific patterns and invariants

If the task involves a topic with a research rollup, check:
- `.codex/knowledge/research/topics/<topic>/_rollup.md` — prior research on the topic

## Step 2: Get Your Task

Determine your worker ID from the git branch (`agent-N` → worker N).

```bash
WORKER_ID=$(git branch --show-current | sed 's/^agent-\([0-9]*\).*/\1/')
```

Fetch your assigned task:

```bash
./.codex/scripts/codex10 my-task $WORKER_ID
```

If no task is assigned, wait 5 seconds and check again. If still no task → go to **Phase: Follow-Up Check**.

## Step 3: Validate Domain

Parse the task JSON: extract `id`, `subject`, `description`, `domain`, `files`, `tier`, `request_id`, `validation`.

- If `domain_lock` is null → set `domain_lock` to this task's domain
- If `domain_lock` is set and this task's domain differs → report failure and EXIT:
  ```bash
  ./.codex/scripts/codex10 fail-task $WORKER_ID $TASK_ID "Domain mismatch: locked to $domain_lock, got $new_domain"
  ```

Mark the task as started:

```bash
./.codex/scripts/codex10 start-task $WORKER_ID $TASK_ID
```

## Step 4: Sync With Main

**MANDATORY** — prevents regression from stale code:

```bash
if git remote get-url origin >/dev/null 2>&1; then
  git fetch origin
  BASE_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
  BASE_BRANCH="${BASE_BRANCH:-main}"
  git rebase "origin/$BASE_BRANCH"
fi
```

On conflict during rebase: `git rebase --abort` and either retry against the correct base branch or fail the task with a clear explanation.

## Step 5: Do the Work

1. **Read** the relevant files and understand the codebase context
2. **Check for prior research** — before investigating any external repo, doc, or pattern, check if it's already been researched:
   - Look in `.codex/knowledge/research/topics/<topic>/_rollup.md`
   - Grep frontmatter: `grep -rl "<keyword>" .codex/knowledge/research/ | head -5`
   - If found, read the rollup first. Only create new research if it's insufficient.
3. **Queue research if gap found** — if the rollup is insufficient or doesn't exist:
   ```bash
   ./.codex/scripts/codex10 queue-research "<topic>" "<specific question>" \
     --context "Task $TASK_ID: $TASK_SUBJECT" \
     --links '["<relevant_urls>"]'
   ```
   Boundary: queue only external intelligence (docs/benchmarks/comparisons). Do not queue repo-internal code-reading questions.
   Do NOT wait for the result. Continue with available knowledge. The research will be available for the next session.
4. **Plan** your approach (for 5+ file changes, spawn a `code-architect` subagent for a review)
5. **Implement** the changes described in the task
6. **Send heartbeats** every 30 seconds during long work:
   ```bash
   ./.codex/scripts/codex10 heartbeat $WORKER_ID
   ```
7. **Self-verify**: run the build/test commands from the task's validation field

## Step 6: Validate

Run the task's `validation` command when one is provided.

If the task has no explicit validation command, run the smallest relevant local check for the files you changed:
- existing `npm test` / `npm run build` / `npm run lint` scripts when present
- targeted runtime checks for simple modules (for example `node -e "const {answer}=require('./app'); if (answer() !== 42) process.exit(1)"`)

Do not search for helper slash-commands like `build-validator` or `verify-app` unless they actually exist in the repo.
Only proceed to shipping when your validation passes.

## Step 7: Ship

1. Commit your changes on the assigned worker branch:
   ```bash
   git add -A
   git commit -m "<brief task summary>"
   ```
2. If `origin` exists, push the branch and create or reuse a PR when practical.
3. If no remote exists, skip push/PR creation. The coordinator can integrate the committed worker branch locally.
4. Send a heartbeat before reporting completion if the task took a while:
   ```bash
   ./.codex/scripts/codex10 heartbeat $WORKER_ID
   ```

## Step 8: Report Completion

After shipping:

```bash
PR_URL="${PR_URL:-no-pr-no-remote}"
BRANCH="$(git branch --show-current)"
./.codex/scripts/codex10 complete-task $WORKER_ID $TASK_ID "$PR_URL" "$BRANCH" "Brief result summary"
```

If you failed to complete the task:

```bash
./.codex/scripts/codex10 fail-task $WORKER_ID $TASK_ID "Description of what went wrong"
```

Update counters: `tasks_completed += 1`, `context_budget += 2000`

## Step 9: Knowledge Persistence

After completing a task, persist what you learned:

### 9a: Update living docs (refine in-place, don't append)

- **Update** `.codex/knowledge/domains/<task-domain>/README.md` — add new insights, remove redundancy, cap changelog to last 5 entries. If the file doesn't exist yet, create it using the living doc template (see handbook files for format).
- **Update** `.codex/knowledge/handbook/pitfalls.md` — only if you discovered a new pitfall during this task.

### 9b: Append to generated logs (audit trail)

Append a brief summary to `.codex/knowledge/generated/change-log.md`:

```markdown
## [TASK_ID] [subject] — [date]
- Domain: [domain]
- Files: [list]
- What changed: [1-2 sentences]
- PR: [url]
```

### 9c: Persist research (if applicable)

If you researched an external repo, documentation, or architectural pattern during this task:
1. Create a research note at `.codex/knowledge/research/topics/<topic>/YYYY-MM-DD__<source-slug>__R-<shortid>.md`
2. Update (or create) the topic rollup at `.codex/knowledge/research/topics/<topic>/_rollup.md`

### 9d: Emit quality signals

Append to `.codex/knowledge/signals/uses/YYYY-MM.md`:

```
YYYY-MM-DD T-<task_id> used: <knowledge files you read that influenced your work>
YYYY-MM-DD T-<task_id> vote: <file> +1|-1 "<brief reason>"
```

## Step 10: Qualitative Self-Check

After every 2nd completed task (`tasks_completed` = 2, 4, 6...):

1. Without re-reading, list the key files you've touched from memory
2. If you can't recall file paths or find yourself re-reading → go to **Phase: Budget/Reset Exit**
3. If responses are getting slower or less precise → go to **Phase: Budget/Reset Exit**

## Step 11: Reset Check

| Trigger | Threshold |
|---------|-----------|
| Context budget | `context_budget >= 8000` |
| Tasks completed | `tasks_completed >= 6` |
| Self-check failure | See Step 10 |

If ANY trigger fires → go to **Phase: Budget/Reset Exit**.

Otherwise → go to **Phase: Follow-Up Check**.

---

## Phase: Follow-Up Check

Wait 15 seconds for a follow-up task assignment:

```bash
sleep 15
./.codex/scripts/codex10 my-task $WORKER_ID
```

If a new task arrives → go back to Step 3.

If no task → lightweight knowledge update:
1. Update `.codex/knowledge/domains/$DOMAIN/README.md` with any session learnings (refine in-place)
2. Emit quality signals to `.codex/knowledge/signals/uses/YYYY-MM.md`
3. Run:
   ```bash
   ./.codex/scripts/codex10 distill $WORKER_ID "$DOMAIN" "Key learnings from this session"
   ```
4. EXIT — the sentinel handles the next cycle.

## Phase: Budget/Reset Exit

Full knowledge persistence before exiting:

1. **Refine** `.codex/knowledge/domains/$DOMAIN/README.md` — consolidate everything you learned this session. Remove redundant entries. Update invariants and pitfalls.
2. **Update** `.codex/knowledge/handbook/pitfalls.md` if you discovered new pitfalls
3. **Append** audit entry to `.codex/knowledge/generated/change-log.md`
4. **Emit** quality signals to `.codex/knowledge/signals/uses/YYYY-MM.md`
5. **Prune check** (if signal data exists): run `bash .codex/scripts/knowledge-score.sh --bottom 3` and review. If any file you touched has a negative score, trim or archive it to `.codex/knowledge/archive/`.
6. Run:
   ```bash
   ./.codex/scripts/codex10 distill $WORKER_ID "$DOMAIN" "Full distillation — session ending"
   ```
7. EXIT — the sentinel handles the next cycle.

---

## Rules

1. **One task, one PR.** Don't combine multiple tasks.
2. **Stay in domain.** Only modify files related to your assigned domain/files. Domain mismatch = fail + exit.
3. **No coordination.** Don't read/write state files. Use `codex10` CLI for everything. Exception: knowledge files in `.codex/knowledge/`.
4. **Heartbeat.** Send heartbeats every 30s during work to avoid watchdog termination.
5. **Exit when done.** Don't loop — the sentinel handles the outer loop.
