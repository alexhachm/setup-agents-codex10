---
kind: research_note
scope: project
id: R-389eb8
title: "10.1-port-sequential-plan — ChatGPT deep_research research"
created: 2026-04-12
updated: 2026-04-12
topics:
  - 10.1-port-sequential-plan
sources:
  - chatgpt-deep_research
confidence: medium
status: draft
---

# Question
Deep research: Given the current 10.1 cleanup/port status, produce a sequential task list for the remaining work. The plan should order the work to reduce integration risk, identify prerequisites, define task boundaries suitable for mac10 worker tasks, include validation commands per step, and call out stop conditions and decisions that need owner review.

# Findings
Below is a deep research report + sequential execution plan tailored to your Node.js + Electron + git-worktree multi-agent system (mac10/setup-agents) and the 10.1 port/cleanup phase.

🧠 1. State of the Art (2025–2026)
Core architecture pattern (now considered standard)

Modern systems (Codex Subagents GA, Cursor, Augment, etc.) converge on:

Manager → Planner → Workers (isolated execution)

Manager = orchestration only (never writes code)

Workers = bounded file scope + deterministic loop

Explorer/Architect = context builders

This matches your:

interface master → UX / CLI control

architect → system mapping

allocator → task decomposition

👉 This is aligned with production-grade patterns 
Digital Applied

Key best practices
1. Spec-driven decomposition (CRITICAL)

Tasks must be:

file-scoped

testable

non-overlapping

Large tasks dramatically reduce success rate 
Augment Code

2. Worktree isolation = standard

Each agent runs in:

separate filesystem

separate ports/env

Prevents:

file conflicts

dev server clashes 
Digital Applied

3. Explorer-first workflows

Map repo → THEN execute

Reduces hallucination + retries 
Digital Applied

4. Deterministic execution loops

Pattern:

generate → run → test → fix → repeat

Especially effective for CLI-based agents 
The Agentic Blog

5. Human checkpoints (must-have)

Required before:

merges

deletions

architecture changes 
Digital Applied

⚙️ 2. Implementation Approaches (with Trade-offs)
A. Current architecture (your system)

Node coordinator + Electron CLI + shell loops

Pros

Full control

Observable

hackable + debuggable

Cons

You must build:

orchestration reliability

state sync

failure recovery

B. Event-driven orchestrator (recommended upgrade path)

Replace polling/sentinel loops with event bus

Options:

EventEmitter (simple)

RxJS@7

bullmq@5 (Redis-backed queue)

Trade-offs
Approach	Pros	Cons
Sentinel loops	simple	fragile, race conditions
Event-driven	reliable, debuggable	more infra
Queue-based	scalable	adds Redis

👉 For 10.1: keep loops, but modularize for swap

C. State management
Current: SQLite

Good choice 👍

Upgrade pattern:

WAL mode

normalized tables:

agents

tasks

worktrees

runs

Alternative:

better-sqlite3@9 (sync, fast, stable)

D. Task execution model
Option 1: Shell-driven (your current)

deterministic

easy to inspect

Option 2: Embedded runner (Node child_process wrapper)

better control

structured logs

👉 Recommendation:
Wrap shell in Node executor (do NOT remove shell yet)

🧩 3. Concrete Code Patterns & Libraries
Core stack (recommended versions)
JSON
{
  "better-sqlite3": "^9.4.0",
  "execa": "^8.0.1",
  "zod": "^3.23.0",
  "rxjs": "^7.8.1",
  "chalk": "^5.3.0",
  "commander": "^12.0.0"
}
Pattern: Worker execution contract
TypeScript
type WorkerTask = {
  id: string
  files: string[]
  objective: string
  acceptance: string[] // commands/tests
}
Pattern: Deterministic loop
TypeScript
while (!success && attempts < MAX) {
  await runCommand(task.command)
  const result = await runTests()

  if (result.pass) break

  await refine(task, result.errors)
}
Pattern: Worktree provisioning
Bash
git worktree add ../wt-$TASK_ID -b agent/$TASK_ID
cp .env.template ../wt-$TASK_ID/.env
Pattern: Port isolation
Bash
PORT=$((3000 + AGENT_ID))

(Prevents failure mode #1) 
The Agentic Blog

Pattern: SQLite schema (minimal)
SQL
agents(id, role, status, worktree_path)
tasks(id, status, assigned_agent, spec_json)
runs(id, task_id, logs, result)
⚠️ 4. Known Pitfalls & Failure Modes
1. Task overlap (BIGGEST RISK)

Symptoms:

agents overwrite each other

inconsistent APIs

Fix:

enforce file ownership per task

2. Shared state leakage

env vars bleed across agents

DB conflicts

Fix:

per-worktree .env

namespaced DBs if needed

3. Infinite loops in agents

retry loops never converge

Fix:

max attempts

failure escalation

4. Orchestrator drift

planner state ≠ actual repo state

Fix:

always re-read git state before next step

5. Silent failures (VERY COMMON)

shell commands fail but system continues

Fix:

strict exit code enforcement

6. Context starvation

agents lack repo understanding

Fix:

architect/explorer must run FIRST

🔄 5. Transferable vs Project-Specific
Transferable (keep these)

✅ Manager / worker separation
✅ Worktree isolation
✅ Spec-driven tasks
✅ Deterministic loops
✅ SQLite state tracking

Project-specific (be careful)

⚠️ Electron CLI

not standard, adds complexity

fine, but keep logic in Node core

⚠️ Shell sentinel loops

fragile → should be transitional

⚠️ 3-master model

good, but:

must enforce strict boundaries

avoid role overlap

📋 6. SEQUENTIAL PLAN (10.1 PORT COMPLETION)

This is the main deliverable.

Phase 0 — STOP & VERIFY BASELINE
Task 0.1: Repo sanity

ensure repo runs

Validate

Bash
npm install
npm run build

Stop if

build fails

missing deps

Phase 1 — Stabilize Core Contracts (NO NEW FEATURES)
Task 1.1: Define task schema

create task.schema.ts

Output

strict zod schema

Validate

Bash
node scripts/validate-task.js
Task 1.2: Normalize agent roles

enforce:

interface = UI only

architect = read-only

allocator = planning only

Stop if

any role writes outside scope

Task 1.3: Centralize logging

one logger module

Validate

Bash
grep -r console.log src/
Phase 2 — Worktree System Hardening
Task 2.1: Deterministic worktree creation

Add

naming convention

cleanup script

Validate

Bash
git worktree list
Task 2.2: Env isolation

Add

.env.template

per-agent injection

Validate

Bash
cat worktrees/*/.env
Task 2.3: Port allocation system

Validate

Bash
lsof -i :3000-3100
Phase 3 — Execution Engine Refactor
Task 3.1: Wrap shell runner

Replace:

raw bash loops

With:

Node execa

Task 3.2: Add retry logic

Validate

simulate failure

Task 3.3: Enforce exit codes

Stop if

any command ignored failure

Phase 4 — Architect / Explorer Pass
Task 4.1: Build repo map generator

Outputs:

file graph

module map

Task 4.2: Store in SQLite

Validate

SQL
SELECT * FROM repo_map;
Phase 5 — Allocator (Task Decomposition)
Task 5.1: Implement spec → tasks

Rules:

≤ 5 files per task

explicit acceptance criteria

Task 5.2: Conflict detection

detect overlapping files

Phase 6 — Worker Execution
Task 6.1: Worker contract

input:

files

spec

acceptance commands

Task 6.2: Loop execution

generate → test → fix

Task 6.3: Output validation

Validate

Bash
npm test
Phase 7 — Integration Layer
Task 7.1: Merge strategy

sequential merges

conflict detection

Task 7.2: Git validation
Bash
git status
git diff
Phase 8 — Human Checkpoints (CRITICAL)
Task 8.1: Add approval gates

Before:

merge

delete

refactor core files

Phase 9 — Electron CLI Stabilization
Task 9.1: Thin CLI

UI only

no logic

Task 9.2: Command surface
Bash
mac10 start
mac10 status
mac10 approve
Phase 10 — End-to-End Validation
Task 10.1: Full run test

Scenario:

small refactor

Validate

all tasks pass

no conflicts

clean git state

🚨 Critical Stop Conditions (Owner Review Required)

Pause system if:

20% worker failure rate

merge conflicts >2 per run

repeated retries >3

inconsistent repo state

agents modifying same file

🧭 Final Insight

Your system is already aligned with 2026 best practices.
The risk is not architecture—it’s execution discipline:

The difference between a working multi-agent system and a chaotic one is:
task boundaries + validation loops + isolation guarantees

If you want next step, I can:

Convert this into mac10 worker-ready task specs (JSON)

Or map directly onto your repo structure (file-by-file plan)

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/10.1-port-sequential-plan/_rollup.md
