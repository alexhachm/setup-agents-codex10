# Knowledge Layer Redesign — Design Document

**Status:** Ideation (no code changes yet)
**Date:** 2026-03-28
**Context:** Workers keep making mistakes because they lack shared understanding of codebase architecture, owner intent, and established patterns. The current knowledge files are either stale, empty, or too shallow.

---

## Problem Statement

Workers operate with incomplete context. The current flow:

```
Owner's Head → Master-1 (request) → Master-2 (decompose) → Worker (implement)
```

Three layers of interpretation. Each guesses about architecture and conventions. Nobody has a shared, human-validated picture of the system. Key evidence from audit:

- `user-preferences.md` — completely blank since inception. Zero owner intent captured.
- `worker-lessons.md` — only 2 entries in a month. Workers aren't writing lessons.
- `codebase-insights.md` — last scanned March 7 (3 weeks stale, ~47 tasks since).
- Research rollups — 3 topics with 300+ lines of raw data each, but synthesis sections are blank templates. Nobody distilled them.
- Domain files exist and have real content, but aren't systematically maintained.

---

## Three New Drivers (All Run Proactively, Before Work)

### 1. Index Driver — "What is this codebase and what does the owner want?"

An interactive agent session that scans the entire codebase and asks the human targeted questions to build a structured understanding.

**Trigger:** Standalone command (`mac10 index` or launched by Master-1 on startup if index is missing/stale).

**Scope:** Indexes only the focused project, NOT mac10 itself (unless mac10 IS the focused project).

**Phases:**

**Phase 1 — Structural Scan (autonomous, no human input):**
- Walk directory tree, read config files, identify frameworks, map dependencies
- Identify domains/modules and their boundaries
- Map data flow: entry points, API boundaries, shared state
- Output: draft `architecture.md` — the agent's best guess

**Phase 2 — Human Calibration (interactive):**
- Present the draft: "Here's what I see. Is this right?"
- Ask targeted questions at each level:
  - **Project level:** "Is this a monorepo? What's the deployment target? What's the user-facing product?"
  - **Domain level:** "I see `coordinator/` and `sandbox/`. Are these independent? What's the contract between them?"
  - **Convention level:** "I see both callback and async/await patterns. Which is preferred? Naming conventions?"
  - **Intent level:** "What's the end state you're building toward? What should this NOT become?"
- Human corrects, clarifies, adds context the code doesn't show

**Phase 3 — Deep Pass (autonomous with spot-checks):**
- For each domain/module, generate detailed breakdown: file purposes, key functions, patterns, gotchas
- Surface ambiguities: "This function does X but is named Y — intentional?"
- Flag technical debt or inconsistencies for human ruling

**Phase 4 — Output files:**
- `.claude/knowledge/codebase/architecture.md` — top-level system map
- `.claude/knowledge/codebase/domains/<domain>.md` — per-domain deep breakdown
- `.claude/knowledge/codebase/conventions.md` — coding patterns, naming, testing approach
- `.claude/knowledge/codebase/intent.md` — what the owner wants this to be, what it should not become

**Staleness tracking:**
- Metadata file tracks: `last_indexed: <date>`, `changes_since_index: <count>`
- Workers increment `changes_since_index` on every task completion
- Time since last index always displayed on Master-1 startup
- Re-index is change-dependent, not time-dependent (though time is shown for awareness)

---

### 2. Codebase Research Driver — "How does our code do X?"

A live agent that runs proactively (before workers need the answers) to deeply understand the existing implementation and write findings to knowledge files.

**Trigger:** Standalone command (`mac10 research-codebase`) or launched by Master-1 on startup if coverage is incomplete.

**What it does:**
- Reads the index output (architecture.md, domain files) as its starting point
- For each domain, does a deep code read and writes comprehensive findings
- Covers: how each subsystem works, key patterns, data flow, integration points, gotchas
- Writes findings back to `.claude/knowledge/codebase/domains/<domain>.md`

**Key principle:** Runs AHEAD of work, not during it. By the time a worker gets a task, the answers are already in the knowledge files. The worker just reads a file — no spawning, no waiting, no polling.

**Worker gap-filling:** If a worker encounters a spot the research agent didn't cover, the worker writes what it learned directly to the same domain file. No coordination needed. The worker already has the context from doing the work, so it's the best entity to write the finding at that moment.

**Unreviewed changes counter:** When a worker writes a finding, it increments an "unreviewed changes" counter. On the next codebase research run, the agent prioritizes domains where workers have been patching holes — that's where the pre-research was inadequate.

---

### 3. External Research Driver — "How should we do X given our stack?"

Runs proactively to research technologies, libraries, and best practices relevant to the project. Grounded in codebase context so answers are specific, not generic.

**Trigger:** Standalone command (`mac10 research-external`) or launched by Master-1 on startup if coverage is incomplete.

**What it does:**
- Reads codebase index to understand our stack (Express, better-sqlite3, CommonJS, etc.)
- Identifies technology areas that need research (based on domains, recent tasks, new features)
- Queries ChatGPT with codebase context injected: "We use Express + CommonJS + better-sqlite3, no Redis. How should we add rate limiting?"
- Auto-distills raw research (300+ lines) into a 20-40 line rollup: key findings, decision, how it applies to our codebase
- Tags each rollup with: date, domain, referenced files, codebase version

**Grounding:** Every external query includes our stack context so answers come back pre-fitted to our project, not generic.

**Rollup format:**
```markdown
## Topic: <name>
- Date: <when researched>
- Domain: <which domain this applies to>
- Stack context: <what was told to ChatGPT about our setup>
- Key findings: <20-40 line synthesis>
- Decision: <what approach we're using and why>
- Referenced files: <files in our codebase this relates to>
- Raw research: <link to full 300-line file>
```

**Staleness:** Each rollup tracks which files/patterns it references. When workers change those files (via change-summaries), the rollup gets flagged as potentially stale.

---

## Worker Auto-Update Protocol

When a worker completes a task, it already writes to `change-summaries.md`. Extend to:

1. **Update domain file** — append what changed and why (2-3 lines, lightweight)
2. **Increment stale counter** — bump `changes_since_index` in metadata
3. **Flag research staleness** — if the worker's changes touch files referenced in a research rollup, mark that rollup as "needs review"
4. **Fill knowledge gaps** — if the worker discovered something not in the knowledge files (a pattern, a gotcha, how a subsystem works), write it directly to the relevant domain file

This is automatic — built into the worker completion flow, not a separate step.

---

## Master-1 Startup Checks

On every startup, Master-1 displays knowledge status and prompts if needed:

```
Knowledge Status:
  Codebase index:       3 weeks old, 47 unreviewed changes (STALE)
  Codebase research:    coordinator ✓  frontend ✓  sandbox ✗ (new domain, uncovered)
  External research:    3/5 domains covered, 2 rollups stale
  User preferences:     NOT SET

Actions:
  → Run "mac10 index" to update codebase index
  → Run "mac10 research-codebase" to cover sandbox domain
  → Run "mac10 research-external" to refresh stale rollups
```

Master-1 can launch the index driver session directly if the user approves.

---

## Knowledge Layer Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Knowledge Files                           │
│                                                               │
│  codebase/                    research/                       │
│  ├── architecture.md          ├── topics/                     │
│  ├── conventions.md           │   ├── <topic>/                │
│  ├── intent.md                │   │   ├── _rollup.md          │
│  └── domains/                 │   │   └── R-<id>.md (raw)     │
│      ├── coordinator.md       │   └── ...                     │
│      ├── frontend.md          └── coverage.json (staleness)   │
│      ├── sandbox.md                                           │
│      └── ...                  metadata/                       │
│                               ├── last_indexed: <date>        │
│                               ├── changes_since_index: <n>    │
│                               └── unreviewed_domains: [...]   │
└───────────────────────────┬───────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐  ┌────────────────┐  ┌────────────────────┐
│ Index Driver   │  │ Codebase       │  │ External Research  │
│ (interactive)  │  │ Research Agent │  │ Driver             │
│                │  │ (live agent)   │  │ (ChatGPT + context)│
│ Scans code +   │  │                │  │                    │
│ asks human     │  │ Deep code read │  │ Queries grounded   │
│ Writes:        │  │ ahead of work  │  │ in our stack       │
│  architecture  │  │ Writes:        │  │ Auto-distills      │
│  conventions   │  │  domain files  │  │ rollups            │
│  intent        │  │  patterns      │  │ Tags with files    │
│  domain stubs  │  │  gotchas       │  │ referenced         │
└───────────────┘  └────────────────┘  └────────────────────┘
        │                   │                   │
        │         ALL RUN PROACTIVELY           │
        │         (before workers need them)    │
        │                                       │
        ▼                                       ▼
┌───────────────────────────────────────────────────────────┐
│  Workers                                                   │
│  READ knowledge files before implementing                  │
│  WRITE to domain files when they find gaps                 │
│  INCREMENT stale counters on task completion               │
│  FLAG research rollups when referenced files change        │
└───────────────────────────────────────────────────────────┘
```

---

## Master-3 Knowledge Integration — Enriched Overlay at Assignment Time

### The Opportunity

Master-3 is the last stop before a worker gets a task. It already writes the task overlay (via `overlay.js`) which becomes the worker's CLAUDE.md/AGENTS.md. That overlay is the **only context the worker sees** before starting work. Today it contains: task description, files to modify, validation commands, domain knowledge, known pitfalls.

If Master-3 checks knowledge coverage at assignment time, it can inject relevant findings into the overlay so workers start with 80% of the context they need instead of 20%.

### Modified Assignment Flow

Current:
```
Task ready → match worker → assign → write overlay → spawn worker
```

New:
```
Task ready → match worker → CHECK KNOWLEDGE → assign → write ENRICHED overlay → spawn worker
```

### The Knowledge Check (Three Layers)

**1. Codebase coverage check:**
- Does `codebase/domains/<task.domain>.md` exist and have content?
- Has it been updated since the last index? (check `changes_since_index` for that domain)
- If missing or stale: flag in overlay — "NOTE: Domain knowledge for `sandbox` is incomplete. Document findings as you work."

**2. External research coverage check:**
- Are there research rollups relevant to this task's domain/technologies?
- Are any of them stale (referenced files changed since research was done)?
- If relevant rollup exists: inject key findings directly into overlay (5-10 lines max)
- If missing: flag — "NOTE: No external research exists for this technology area."

**3. Intent alignment check:**
- Does `codebase/intent.md` exist? (the owner's vision from the index driver)
- If yes: inject the relevant section so the worker knows what the owner wants, not just what the code does

### Enriched Overlay Example

Today a worker gets:
```markdown
# Current Task
**Task ID:** 42
**Subject:** Add rate limiting to CLI server
**Domain:** coordinator

## Description
Add rate limiting...

## Files to Modify
- coordinator/src/cli-server.js

## Validation
- Test: npm test
```

With knowledge enrichment:
```markdown
# Current Task
(same as above)

## Codebase Context
CLI server uses a switch statement on command name, validates via COMMAND_SCHEMAS,
responses are JSON over TCP on port 31000-31999. Pattern: parse → validate → db call
→ broadcast via WebSocket. See coordinator/src/cli-server.js:47 for the main handler.

## Relevant Research
HTTP rate limiting: use an in-process limiter for single-process deployments.
Our stack is CommonJS + no Redis, so in-memory is correct. Window: 15min, max: 100
per IP is standard. (Researched 2026-03-25, grounded against our Express setup.)

## Owner Intent
The CLI server should remain simple and single-process. No external dependencies
for infrastructure concerns. (From intent.md)

## Knowledge Gaps
⚠ Domain file last updated 12 tasks ago. Document any new patterns you discover.
```

### New Domain Detection

When Master-3 sees a task with a domain that has no knowledge files:

1. Still assign the task (don't block workers)
2. Send a message to Master-1's inbox: "New domain `sandbox` detected with no research coverage. Consider running `mac10 research-codebase`."
3. Add a stronger flag in the overlay: "This is an unresearched domain. Thoroughly document your findings in the domain file."

Workers aren't blocked, but the system self-reports its blind spots to the user.

### Knowledge-Aware Assignment Scoring

Extend Master-3's worker scoring to factor in knowledge contribution:

```
Current:  domain_match(+100) + file_overlap(+10/file) + load_balance(-1/task)
New:      + knowledge_familiarity(+20 if worker previously wrote to this domain's knowledge file)
```

A worker who previously filled gaps in a domain file has **proven comprehension** of that domain — stronger signal than "they worked in the same domain last time." Last domain match tells you context proximity. Knowledge contribution tells you understanding.

### Overlay Bloat Mitigation

Risk: injecting codebase context + research + intent + gaps makes the overlay too long. Workers under context pressure skip sections.

Mitigation:
- Each injected section is **5-10 lines max** — summaries, not full dumps
- Most actionable context goes first (codebase context > research > intent > gaps)
- Sections are only injected when relevant (no research section if no rollups exist, no intent section if intent.md is missing)

### What Master-3 Does vs Doesn't Do

**Does:**
- Reads knowledge files at assignment time
- Injects relevant findings into overlay
- Flags missing coverage in overlay
- Reports new/uncovered domains to Master-1
- Scores workers on knowledge contribution

**Doesn't:**
- Run research agents (they run proactively ahead of time)
- Block assignment waiting for research (workers aren't idle while knowledge builds)
- Decide what needs researching (the index/research drivers decide that)
- Produce knowledge itself (except its own `allocation-learnings.md`)

Master-3 is a **consumer** of the knowledge layer. The three drivers are the producers. Workers are the gap-fillers.

---

## Provider-Agnostic Visual Testing (Already Implemented)

Separate from the knowledge redesign, visual testing was implemented and pushed. The design principle applies here too: platform scripts are the primary interface, not provider-specific tools.

**Primary interface (both Claude and Claude):**
```bash
bash scripts/take-dom-snapshot.sh http://localhost:PORT    # DOM check, ~4k tokens
bash scripts/take-screenshot.sh http://localhost:PORT /tmp/out.png  # Screenshot, ~50k tokens
```

**Infrastructure (invisible to workers):**
- `Dockerfile.worker` installs Chromium + Playwright + Xvfb
- `settings.json` configures Playwright MCP (Claude gets it as silent optimization)
- `worker-sentinel.sh` starts Xvfb when DISPLAY is set (Docker only)
- Overlay injects visual testing hints for UI-domain tasks only

**Files changed (2 commits, pushed):**
- `sandbox/Dockerfile.worker`, `sandbox/Sandboxfile`, `sandbox/docker-compose.sandbox.yml`
- `templates/settings.json`, `.claude/settings.json`
- `scripts/worker-sentinel.sh`
- `templates/worker-agents.md`, `templates/commands/worker-loop.md`
- `coordinator/src/overlay.js`
- `scripts/take-screenshot.sh`, `scripts/take-dom-snapshot.sh` (new)
- `setup.sh`

---

## Sandboxfile Note

The `sandbox/Sandboxfile` is NOT a real Claude format. Research confirmed:
- Claude CLI sandboxes via OS-level mechanisms (Seatbelt/Landlock), not containers
- Claude Cloud uses a fixed `universal` image, not custom Dockerfiles
- There is no "Sandboxfile" spec in the Claude ecosystem

The file in our repo is either dead config or aspirational. Claude workers in mac10 currently run through `worker-sentinel.sh` in tmux, same as Claude workers, just with a different CLI binary.

---

## Still To Ideate

- [ ] External research base completion criteria per domain
- [ ] Router: single `mac10 research` command that auto-routes internal vs external, or explicit separate commands?
- [ ] Index driver prompt design (what questions to ask at each level)
- [ ] How codebase research agent decides what to investigate on each run
- [ ] Integration with existing `mac10 queue-research` command
- [ ] Whether existing knowledge files (domain/*.md, codebase-insights.md) get migrated into new structure or coexist
- [ ] Metadata file format for staleness tracking
