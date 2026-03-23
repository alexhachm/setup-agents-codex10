---
kind: research_note
scope: project
id: R-203418
title: "sqlite-coordinator-patterns — ChatGPT thinking research"
created: 2026-03-23
updated: 2026-03-23
topics:
  - sqlite-coordinator-patterns
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
How do production systems use SQLite as a coordination backbone for multi-process/multi-agent workflows? Cover: WAL mode performance, atomic transactions for state machines, concurrent reads, schema design for task queues, and crash recovery patterns for SQLite-backed coordinators.

# Findings
I’m grounding this in SQLite’s current documentation while scanning your repo structure, so the recommendations map to your Electron/Node coordinator and worktree-based agents rather than generic queue patterns.

---

I’ve confirmed the repo already follows the expected coordinator baseline: SQLite is the single source of truth, using better-sqlite3, WAL, busy_timeout, auto-checkpointing, mailbox/indexed tables, and row-based heartbeats. I’m now focusing on the production-critical parts—atomic state transitions, write-contention rules, checkpoint behavior under long reads, and crash recovery loops.

---

I’ve also verified the code already uses several production-safe patterns—compare-and-set claims, transactional mailbox consumption, bounded task reassignment, and startup repair of stale states. The remaining work is to pin down which coordinator invariants and lease/recovery updates must be serialized as state-machine transactions, and which writes should stay off the hot path.

---

I’m now extracting the repo’s exact schema and coordinator flows from db.js and related loops so I can turn this into concrete Node/Electron code: claim/requeue transaction recipes, writer boundaries, and specific places I’d tighten the current implementation.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/sqlite-coordinator-patterns/_rollup.md
