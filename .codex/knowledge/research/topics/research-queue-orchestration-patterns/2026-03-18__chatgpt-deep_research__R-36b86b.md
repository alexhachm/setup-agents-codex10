---
kind: research_note
scope: project
id: R-36b86b
title: "research-queue-orchestration-patterns — ChatGPT deep_research research"
created: 2026-03-18
updated: 2026-03-18
topics:
  - research-queue-orchestration-patterns
sources:
  - chatgpt-deep_research
confidence: medium
status: draft
---

# Question
For autonomous coding-agent platforms with asynchronous research queues feeding a knowledge base, what production patterns are state-of-the-art for deduplication/idempotency keys, priority and fairness scheduling, retry/backoff with stuck-job recovery, exactly-once-ish artifact ingestion, and operator visibility? Compare concrete approaches used by leading teams/frameworks (2024-2026) and recommend a pragmatic design for this project’s queue + rollup flow.

# Findings
I’m pulling the repo’s prompt files and sentinel script first, then I’ll map them against durable control patterns for long-running multi-agent coding loops and identify the highest-leverage changes.

---

I hit an access snag: the setup-agents-codex10 URLs are returning 404s here, so I’m switching to a qualified analysis using the named file layout, current Codex primitives, and the public sibling setup-agents-mac10 as a structural proxy.

---

The repo is accessible now, so I’m switching from the proxy to the actual .codex prompt stack and loop-sentinel.sh. The proxy review already surfaced one likely risk to verify there: mutable markdown “memory” and prompt counters drifting over long runs.

---

One caveat first: I couldn’t directly inspect alexhachm/setup-agents-codex10 from public GitHub. The repo URL you gave returns 404 in the browser, and the public profile currently shows three public repos, not setup-agents-codex10. So the repo-specific comparison below is grounded in the same author’s visible Codex/agent repos—especially setup-agents-windows-codex9 and the newer setup-agents-mac10—which expose the same role-loop family, signaling/sentinel patterns, and helper-script design. If codex10 has diverged, treat the repo-specific parts as informed extrapolation rather than direct verification. 
GitHub
+3
Invalid URL
+3
GitHub
+3

My main conclusion is this: the best long-running multi-agent coding systems are not controlled mainly by “better wording.” They work when the control stack is layered: coordinator-owned state and transport, narrow role contracts, linear phase protocols, explicit anti-drift rules, and supervisor-driven restart semantics. That matches Codex’s own guidance to keep the main thread clean, use subagents mainly for read-heavy work, and be cautious about parallel write-heavy work because it increases conflicts and coordination overhead. 
OpenAI Developers

1. Break down the problem and key considerations

Coordination substrate matters more than prompt cleverness.
The biggest architectural lever is whether agents coordinate through ad hoc files and polling, or through one authoritative state/transport layer. In the visible older Codex stack (setup-agents-windows-codex9), coordination used JSON state files, signal files, and helper scripts like signal-wait.sh and state-lock.sh. In the newer setup-agents-mac10, the design explicitly shifts to a coordinator that owns state through SQLite WAL plus a mail table, with agents instructed to use only the mac10 CLI for signaling. That direction is exactly right for long-running reliability. 
GitHub
+5
GitHub
+5
GitHub
+5

Role contracts need to be operational, not just descriptive.
The public stack already does a good job on role separation: Master-1 is user-facing and should not read/write code; the Architect triages and decomposes; the Allocator assigns and integrates; the Worker executes one task and one PR. Those are strong contracts. But they are mostly prompt-level contracts today, not tool-level contracts. 
GitHub
+5
GitHub
+5
GitHub
+5

Phase protocols should be linear and idempotent.
What works best is a small finite-state machine per agent: startup audit → claim/start → sync → work → validate → ship → distill → exit. The visible worker loop already follows that shape, and the sentinel wraps it from the outside rather than keeping the worker in an endless conversational loop. That is a strong pattern. 
GitHub
+1

Anti-drift needs both quantitative and qualitative checks.
This repo family already uses context budgets, task-count thresholds, qualitative memory self-checks, change summaries, knowledge files, and startup scans/codebase maps. Those are exactly the right categories of anti-drift controls. 
GitHub
+5
GitHub
+5
GitHub
+5

Restart semantics are first-class.
In long-running systems, resets are not failure; they are maintenance. The older Codex stack even had explicit reset staggering through agent-health.json, while the newer mac10 loops do startup reconciliation by checking current state before re-entering the blocking loop. The best pattern combines both: startup reconciliation plus persisted restart metadata. 
GitHub
+3
GitHub
+3
GitHub
+3

2. Trade-offs between different approaches

File signals + JSON locks vs coordinator + DB + CLI
File signals are easy to inspect and bootstrap, and codex9 used them thoughtfully with adaptive polling and helper scripts. But they create platform-specific watch logic, stale-lock handling, duplicate sources of truth, and more “prompt drift” because agents end up reasoning about file choreography. The mac10 move to SQLite/mail/CLI removes a big class of coordination bugs. The trade-off is a stronger dependency on the coordinator, but that is usually worth it. 
GitHub
+5
GitHub
+5
GitHub
+5

Architect edits code vs architect stays read-mostly
The older Codex role docs let Master-2 execute Tier 1 tasks directly for speed. The newer mac10 architect is read-mostly and explicitly never executes code changes directly. For long-running systems, the newer pattern is better because it keeps the planner’s context clean. If you want a fast path for trivial fixes, use an ephemeral Tier-1 micro-worker rather than turning the long-lived architect into an editor. That lines up with Codex guidance to keep noisy execution off the main coordination thread. 
GitHub
+2
GitHub
+2

Architect assigns directly vs dedicated allocator/coordinator owns assignment
Codex9 had direct Tier 2 claim-before-assign behavior in Master-2. Mac10 moves assignment authority out of the architect and into Master-3/coordinator. The latter is the better long-run control pattern because assignment is operational state, not planning state. Keep planners planning and allocators allocating. 
GitHub
+2
GitHub
+2

Long-lived workers vs task-bounded workers under a sentinel
Long-lived workers keep local context, but they drift and accumulate garbage. Task-bounded workers are much cleaner. Both codex9 and mac10 moved toward launch-on-demand, do the task, optionally wait briefly for follow-up, then exit; mac10’s sentinel then relaunches on demand and re-syncs against main. That is the right default. 
GitHub
+3
GitHub
+3
GitHub
+3

Prompt-memory counters vs persisted counters
This is one of the biggest weak spots in the visible mac10 prompts. The worker loop asks the model to track tasks_completed, context_budget, and domain_lock in working memory, and the architect loop similarly tracks triage_count and curation_due in working memory. The older codex9 stack persisted more of this operational state in worker-status.json and agent-health.json. Persisted counters are much more reliable across resets, crash recovery, and model inconsistency. 
GitHub
+3
GitHub
+3
GitHub
+3

Read-heavy subagents vs parallel writers
The public stack uses subagents for planning and validation (code-architect, build-validator, verify-app) rather than having many agents edit code at once. That is the right instinct. Codex’s docs explicitly recommend parallelism first for exploration, tests, triage, and summarization, and caution that write-heavy parallelism increases merge/conflict overhead. 
OpenAI Developers
+3
GitHub
+3
GitHub
+3

3. Reasoned recommendation

The best control pattern for codex10 is:

Keep the mac10-style coordinator/sentinel architecture, but make the protocol stateful, typed, and enforced.

What I would keep:

strict role separation;

one blessed coordination surface;

short-lived worker sessions under an outer sentinel;

progressive scan + codebase map;

distillation and qualitative self-checks. 
GitHub
+6
GitHub
+6
GitHub
+6

What I would change first:

1) Move operational counters out of prompt memory and into coordinator state.
Right now some of the most important controls are soft suggestions to the model. That is not enough for a long-running system. Persist tasks_completed, context_budget, domain_lock, scan_version_seen, last_exit_reason, and restart counts in the coordinator, and make the prompt say: “read them from the coordinator; never treat memory as source of truth.” This is the highest-leverage anti-drift improvement. It is also how you recover the good part of codex9’s persisted worker/agent health without reverting to file-locked JSON. 
GitHub
+3
GitHub
+3
GitHub
+3

2) Enforce role contracts at the tool layer, not only in prose.
The current settings allow broad Write/Edit access globally, even though Master-1/Architect/Allocator prompts say they should not edit project code. Codex supports custom agents with per-agent configuration and sandbox overrides. For long-running systems, prompts should declare the contract, but the runtime should enforce it. Make Interface and Allocator read-only; make Architect read-only except for coordinator APIs and maybe curated knowledge APIs; only Workers should get code-write authority. 
OpenAI Developers
+4
GitHub
+4
GitHub
+4

3) Replace free-form task prose with a typed task envelope.
The current task JSON examples have the right skeleton—request_id, subject, description, domain, files, tier, validation, maybe depends_on—but they are missing the fields that most reduce drift: done_when, non_goals, hazards, validation_profile, retry_policy, and protocol_version. That one change will improve decomposition quality, allocator safety, validation relevance, and restart recovery. 
GitHub
+1

4) Make validation domain-aware, especially for Electron.
There is a real mismatch in the public stack: the worker loop says to use the task’s validation field, but build-validator hardcodes npm run build, npm test, npm run lint, and npx tsc --noEmit, while verify-app just does npm start &, sleeps 3 seconds, and kills the process. For a Node/Electron system, that is too generic and will be flaky or misleading. Validation should be profile-based: electron-main, electron-renderer, ipc-contract, packaging, node-api, smoke-ui, and so on. 
GitHub
+2
GitHub
+2

5) Stop writing living knowledge directly from worker worktrees.
This is subtle but important. Workers run inside per-worker git worktrees, yet the worker loop tells them to append change summaries and domain learnings directly under .claude/knowledge/... before or after task completion. That creates a bad choice: either those files pollute PR diffs and conflict constantly, or the distillation is lost when the worktree is reset. Since the system already has mac10 distill, make knowledge coordinator-owned and out-of-band. Workers should submit distillation events; the coordinator should merge them into the knowledge base. 
GitHub
+2
GitHub
+2

6) Add structured restart semantics to the sentinel.
The visible sentinel is good because it blocks on task mail, syncs, launches the worker loop, and resets the worker afterward. But it does not preserve rich exit reasons or do crash-loop backoff/quarantine. Add exit codes like idle, completed, budget_reset, validation_failed, fatal_tool_error, auth_error, and protocol_mismatch; persist them; back off on repeated fatal exits; and quarantine a worker after N failures in M minutes. 
GitHub
+1

7) Generate the prompt stack from shared protocol fragments and lint it.
The public mac10 architect loop has an actual prompt inconsistency: it defines triage_count and curation_due as internal counters, but later the curation trigger refers to decomposition_count. That is exactly the sort of drift that accumulates when many .md prompt files are edited independently. Generate the role/loop docs from one shared protocol source, and add CI that fails on undefined counters, contradictory transport rules, or mismatched task fields. 
GitHub
+1

4. Risks, edge cases, and pitfalls

The biggest prompt-level risk is contract drift across files. The triage_count/decomposition_count mismatch is already evidence of it. If the prompt stack is hand-maintained, more of these will appear over time. 
GitHub
+1

A second risk is false confidence from generic validators. Hardcoded npm checks and a sleep 3 app verifier may report failure for the wrong reason or miss Electron-specific regressions entirely. That wastes worker cycles and teaches the system the wrong lessons. 
GitHub
+1

A third risk is role leakage. Prompt text says some roles should not edit code, but the runtime currently grants broad write/edit capability. In long sessions, eventually one of those roles will violate the contract unless the runtime prevents it. 
GitHub
+2
GitHub
+2

A fourth risk is knowledge rot. The family already has token budgets and pruning instructions, which is good, but once knowledge becomes durable you also need provenance and versioning: what scan version produced this fact, and does it still match the repo? Without that, knowledge files become persuasive but stale. 
GitHub
+2
GitHub
+2

For Electron specifically, domain-only routing can misclassify cross-cutting work. A small feature may touch renderer UI, preload bridges, IPC contracts, and main-process behavior. If domain locks are too coarse, workers either fail useful tasks or make unsafe cross-boundary edits. The fix is not “remove domain lock”; it is “use a better domain taxonomy plus hazard flags.” This is an inference from the control pattern rather than a directly verified repo fact.

5. Concrete implementation guidance

I would implement four concrete changes.

First, define one canonical protocol schema and generate the prompts from it.

JSON
{
  "protocol_version": 3,
  "task": {
    "task_id": "T-123",
    "request_id": "R-77",
    "domain": "renderer",
    "allowed_paths": ["src/renderer/**", "src/shared/ipc.ts"],
    "hazards": ["ipc-contract"],
    "objective": "Add theme-sync toggle",
    "done_when": [
      "toggle persists across relaunch",
      "renderer updates without full reload"
    ],
    "non_goals": [
      "no visual redesign",
      "no settings migration"
    ],
    "validation_profile": "electron-renderer-smoke",
    "depends_on": [],
    "retry_policy": "coordinator_retriable_only",
    "scan_version": 42
  }
}

Second, change the worker prompt from “track these in your working memory” to something like this:

Markdown
## Authoritative state
Never treat your memory as source of truth.

Before each phase transition, call:
- `codex10 worker-state $WORKER_ID`
- `codex10 task-state $TASK_ID`

If your memory conflicts with coordinator state, coordinator state wins.
Do not invent fields. Use only protocol_version=3 fields.

Third, give the sentinel structured restart semantics.

Bash
while true; do
  msg="$(codex10 inbox worker-$WORKER_ID --block --timeout=300)"
  [ -z "$msg" ] && continue

  lease="$(codex10 session-start "$WORKER_ID")"

  git fetch origin || true
  git rebase origin/main || { git rebase --abort || true; git reset --hard origin/main || true; }

  codex exec /worker-loop
  exit_code=$?

  codex10 session-end "$lease" --exit-code "$exit_code" --reason "$(codex10 map-exit "$exit_code")"

  if codex10 worker-crashloop "$WORKER_ID"; then
    codex10 quarantine-worker "$WORKER_ID"
    sleep 120
  else
    sleep "$(codex10 recommended-backoff "$WORKER_ID")"
  fi
done

Fourth, add a prompt-stack linter in CI. It should fail if:

a counter is referenced but never defined;

a role prompt forbids edits but the runtime grants write tools;

a loop references a transport that another loop forbids;

a task example omits required fields like done_when or validation_profile;

a worker prompt allows direct knowledge writes instead of distillation events.

If setup-agents-codex10 still looks more like the codex9 style, the first upgrade is the transport/state layer. If it already looks more like mac10, the first upgrade is persisting counters and enforcing role capabilities. Those two changes will buy you more stability than any amount of extra prose in the .md prompts.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/research-queue-orchestration-patterns/_rollup.md
