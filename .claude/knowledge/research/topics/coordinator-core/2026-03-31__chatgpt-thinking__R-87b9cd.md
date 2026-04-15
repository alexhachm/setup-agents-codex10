---
kind: research_note
scope: project
id: R-87b9cd
title: "coordinator-core — ChatGPT thinking research"
created: 2026-03-31
updated: 2026-03-31
topics:
  - coordinator-core
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What is the architecture, key files, and patterns of the coordinator-core domain?

# Findings
I’m inspecting the current main branch to map coordinator-core entrypoints, state flow, and its interaction with the CLI, worktrees, and agent orchestration before turning that into architecture, key files, patterns, and recommendations.

---

I’ve confirmed coordinator-core is the real control plane: a flat coordinator/src composition root around SQLite-backed allocation, merge, watchdog, and command loops. I’m now tracing db.js, cli-server.js, and adjacent modules to pin down command/state boundaries, worker spawning, and the simplicity-versus-modularity trade-off.

---

The core now looks like a state-machine-plus-mailbox design: allocator and other loops mostly detect work and nudge agents, while authoritative transitions stay in the DB/CLI path. I’ve also confirmed a README/code mismatch in merger.js—current flow is clean merge, rebase/retry, then allocator escalation—and I’m checking watchdog/recovery to anchor the failure-handling analysis.

---

I’ve now pinned down the runtime composition: index.js wires the system together, db.js is the orchestration kernel, and allocator/merger/watchdog act as supervisor loops around it. I’m making one final pass to clearly separate current source behavior from broader README claims, especially around merges and UI.

---

I’m in the file-by-file pass now, mapping the concrete functions, SQLite tables, and recovery/state transitions inside db.js, cli-server.js, allocator.js, merger.js, and watchdog.js. Next I’ll turn those exact seams into code-level recommendations with small repo-grounded examples.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-core/_rollup.md
