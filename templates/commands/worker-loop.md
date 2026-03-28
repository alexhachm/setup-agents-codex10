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
export PATH="$(pwd)/.claude/scripts:$PATH"
```

### Read Knowledge

Read these files to learn from previous work:
- `.claude/knowledge/mistakes.md` — avoid repeating known errors
- `.claude/knowledge/patterns.md` — follow established patterns
- `.claude/knowledge/instruction-patches.md` — apply any patches targeting "worker", then note them
- `.claude/knowledge/worker-lessons.md` — lessons from fix reports
- `.claude/knowledge/change-summaries.md` — understand recent changes by other workers

## Step 2: Get Your Task

Determine your worker ID from the git branch (`agent-N` → worker N).

```bash
WORKER_ID=$(git branch --show-current | sed -E 's/^agent-([0-9]+).*/\1/')
```

Fetch your assigned task:

```bash
./.claude/scripts/codex10 my-task $WORKER_ID
```

If no task is assigned, wait 5 seconds and check again. If still no task → go to **Phase: Follow-Up Check**.

## Step 3: Validate Domain

Parse the task JSON: extract `id`, `subject`, `description`, `domain`, `files`, `tier`, `request_id`, `validation`.

- If `domain_lock` is null → set `domain_lock` to this task's domain
- If `domain_lock` is set and this task's domain differs → report failure and EXIT:
  ```bash
  ./.claude/scripts/codex10 fail-task $WORKER_ID $TASK_ID "Domain mismatch: locked to $domain_lock, got $new_domain"
  ```

Mark the task as started:

```bash
./.claude/scripts/codex10 start-task $WORKER_ID $TASK_ID
```

## Step 4: Sync With Main

**MANDATORY** — prevents regression from stale code:

```bash
git fetch origin && git rebase origin/main
```

On conflict: `git rebase --abort && git reset --hard origin/main`

## Step 4.5: Consult Existing Research

Before writing any code, check for existing research that may inform your implementation:

1. List available research topics:
   ```bash
   ls .codex/knowledge/research/topics/ 2>/dev/null
   ```
2. For any topic relevant to your task domain or subject, read the `_rollup.md` and recent notes:
   ```bash
   cat ".codex/knowledge/research/topics/$TOPIC/_rollup.md" 2>/dev/null
   ```
3. Incorporate findings into your implementation plan — research results are your primary external knowledge source.

## Step 4.6: Queue Research If Needed

If you identify knowledge gaps after consulting existing research (e.g., unfamiliar API behavior, library usage, best practices):

1. Queue research and capture the item ID:
   ```bash
   RESEARCH_OUTPUT=$(./.claude/scripts/codex10 queue-research "$TOPIC" "$QUESTION" --mode standard --priority urgent --source_task_id $TASK_ID)
   RESEARCH_ID=$(printf '%s' "$RESEARCH_OUTPUT" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
   ```
2. Poll until completed or timeout (5 min = 20 iterations × 15s):
   ```bash
   MAX_POLLS=20
   for poll_i in $(seq 1 $MAX_POLLS); do
     sleep 15
     ./.claude/scripts/codex10 heartbeat $WORKER_ID
     STATUS_OUTPUT=$(./.claude/scripts/codex10 research-status --topic "$TOPIC")
     if printf '%s' "$STATUS_OUTPUT" | grep -q '"status":"completed"'; then
       break
     fi
     if printf '%s' "$STATUS_OUTPUT" | grep -q '"status":"failed"'; then
       echo "Research failed for topic: $TOPIC"
       break
     fi
   done
   ```
3. Read results:
   ```bash
   cat ".codex/knowledge/research/topics/$TOPIC/_rollup.md" 2>/dev/null
   ```
4. Max wait: 5 minutes for `standard`/`thinking` mode, 10 minutes (`MAX_POLLS=40`) for `deep_research`. If timeout, continue without results.

## Step 5: Do the Work

1. **Read** the relevant files and understand the codebase context
2. **Plan** your approach (for 5+ file changes, spawn a `code-architect` subagent for a review)
3. **Implement** the changes described in the task
4. **Send heartbeats** every 30 seconds during long work:
   ```bash
   ./.claude/scripts/codex10 heartbeat $WORKER_ID
   ```
5. **Self-verify**: run only explicit build/test/lint commands provided in the task details; if `validation` is shorthand like `tier2`/`tier3`, treat it as metadata (not a shell command) and never assume implicit `npm run build`
6. **Mid-implementation research**: if during implementation you realize you need external information (API docs, library behavior, best practices), queue research using the same pattern as Step 4.6 — **never use WebSearch or WebFetch**

## Step 6: Validate

Validation depends on the task tier:

| Tier | Validation |
|------|-----------|
| Tier 2 | Spawn `build-validator` subagent only |
| Tier 3 | Spawn `build-validator` subagent, THEN spawn `verify-app` subagent |

- If `build-validator` reports `VALIDATION_FAILED` → fix the issue and re-validate
- If `verify-app` reports `VERIFICATION_FAILED` → fix the issue and re-validate
- Only proceed to shipping when all applicable validators pass

### Visual Verification (UI Tasks Only)

If your task involves UI/frontend work and a dev server is available:

1. Start the dev server in background:
   ```bash
   npm run dev &
   DEV_PID=$!
   sleep 5
   ```
2. Navigate to the local URL:
   - Use `browser_navigate` with the local dev server URL (e.g., `http://localhost:3000`)
3. Verify DOM structure:
   - Use `browser_snapshot` to get the accessibility tree — confirms elements render correctly (~4k tokens)
4. Screenshot only if needed:
   - Use `browser_take_screenshot` only if visual layout (spacing, colors, alignment) needs verification (~50k tokens)
5. Clean up:
   ```bash
   kill $DEV_PID 2>/dev/null || true
   ```

If Playwright MCP tools are unavailable, use fallback scripts:
```bash
bash scripts/take-dom-snapshot.sh http://localhost:3000
bash scripts/take-screenshot.sh http://localhost:3000 /tmp/verify.png
```

Skip this section entirely for backend/API/config tasks.

## Step 7: Ship

Run `/commit-push-pr` to create the PR.

## Step 8: Report Completion

After the PR is created:

```bash
./.claude/scripts/codex10 complete-task $WORKER_ID $TASK_ID "$PR_URL" "$BRANCH" "Brief result summary" --usage '{"model":"gpt-5","input_tokens":1200,"output_tokens":350,"cached_input_tokens":90,"total_tokens":1550,"cost_usd":0.42}'
```

Syntax: `./.claude/scripts/codex10 complete-task <worker_id> <task_id> [pr_url] [branch] [result] [--usage JSON]`.

Include `--usage` whenever token/cost telemetry is available so routing budget signals stay accurate.

If you failed to complete the task:

```bash
./.claude/scripts/codex10 fail-task $WORKER_ID $TASK_ID "Description of what went wrong"
```

Update counters: `tasks_completed += 1`, `context_budget += 2000`

## Step 9: Write Change Summary

Append a brief summary to `.claude/knowledge/change-summaries.md`:

```markdown
## [TASK_ID] [subject] — [date]
- Domain: [domain]
- Files: [list]
- What changed: [1-2 sentences]
- PR: [url]
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
./.claude/scripts/codex10 my-task $WORKER_ID
```

If a new task arrives → go back to Step 3.

If no task → lightweight distillation:
1. Append any domain-specific learnings to `.claude/knowledge/domain/$DOMAIN.md`
2. Run:
   ```bash
   ./.claude/scripts/codex10 distill $WORKER_ID "$DOMAIN" "Key learnings from this session"
   ```
3. EXIT — the sentinel handles the next cycle.

## Phase: Budget/Reset Exit

Full distillation before exiting:

1. Write domain knowledge to `.claude/knowledge/domain/$DOMAIN.md`
2. Append mistakes to `.claude/knowledge/mistakes.md`
3. Append change summary to `.claude/knowledge/change-summaries.md`
4. Run:
   ```bash
   ./.claude/scripts/codex10 distill $WORKER_ID "$DOMAIN" "Full distillation — session ending"
   ```
5. EXIT — the sentinel handles the next cycle.

---

## Rules

1. **One task, one PR.** Don't combine multiple tasks.
2. **Stay in domain.** Only modify files related to your assigned domain/files. Domain mismatch = fail + exit.
3. **No coordination.** Don't read/write state files. Use `codex10` CLI for everything. Exception: knowledge files in `.claude/knowledge/`.
4. **Heartbeat.** Send heartbeats every 30s during work to avoid watchdog termination.
5. **Exit when done.** Don't loop — the sentinel handles the outer loop.
