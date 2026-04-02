---
kind: research_note
scope: project
id: R-6ca397
title: "coordinator — ChatGPT thinking research"
created: 2026-03-31
updated: 2026-03-31
topics:
  - coordinator
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What is the architecture, key files, and patterns of the coordinator domain?

# Findings
I’m inspecting the repository structure and coordinator-specific source first, then I’ll trace control flow across orchestration, state, agents, and worktrees to ground the architecture, trade-offs, risks, and concrete guidance in the actual code.

---

I’ve confirmed the coordinator is an opinionated central control plane: SQLite-backed state and a local command server form the core, with db.js, cli-server.js, and schema.sql carrying most logic. Around that core, allocator, merger, watchdog, spawning, and isolation modules behave as deterministic polling loops with backend-aware fallback, which also exposes the main monolith boundary.

---

I’m tracing the end-to-end control path now, and one concrete detail stands out: cli-server.js is effectively the application layer, including command contracts, payload validation, role-specific verbs, and the bridge to architect handoff files.

---

One

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator/_rollup.md
