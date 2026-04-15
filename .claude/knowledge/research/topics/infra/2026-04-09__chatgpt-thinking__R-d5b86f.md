---
kind: research_note
scope: project
id: R-d5b86f
title: "infra — ChatGPT thinking research"
created: 2026-04-09
updated: 2026-04-09
topics:
  - infra
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What is the architecture, key files, and patterns of the infra domain?

# Findings
I’m starting by mapping the repository from the code itself, then I’ll trace the files and boundaries that make up the infra layer, including any ambiguity around what “infra” covers here. After that I’ll connect those pieces to coordinator, workers, runtime, and persistence, then turn the findings into an architecture review with patterns, trade-offs, risks, and concrete guidance.

---

I found the repo’s own infra notes, but they’re partial or placeholder, so I’m treating them as hints and validating everything against the live coordinator and shell runtime.

---

I’ve traced the runtime end to end: infra here is a cross-cutting, single-process coordinator kernel with SQLite/state schema, a local socket CLI command bus, control loops, and shell-backed execution adapters. I’m now validating lower-level details—locking, backend selection, worktree setup, and coordinator↔sentinel handoff—against source where docs and implementation may diverge.

---

I’m expanding this into a design-level review now: concrete file-by-file behavior, what the code is doing today, and what I’d change first so the infra layer is easier to own and test.

---

I’ve pinned the main seams and a few concrete faults: duplicated runtime assets, split worker-launch policy, centralized cli-server.js/db.js control flow, and shutdown/provisioning inconsistencies like releasePidLock(), wrapper pathing, and mixed launcher/sentinel paths.

---

I’m tracing the exact coordinator flows now—especially assign-task, complete-task, reset-worker, and backend adapters—because the next step is to turn the scattered policy into concrete, minimal-reshape refactors.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/infra/_rollup.md
