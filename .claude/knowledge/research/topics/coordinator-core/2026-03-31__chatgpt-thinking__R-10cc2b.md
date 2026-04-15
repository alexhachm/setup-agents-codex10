---
kind: research_note
scope: project
id: R-10cc2b
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
I’m starting by pinning down what “coordinator-core” refers to in this repo, then I’ll trace its entrypoints, state and orchestration flow, and the key files and patterns directly from source.

---

I’ve confirmed the coordinator core is a small state-owning Node runtime in coordinator/: src/index.js acts as the bootstrap/composition root, while a large db.js plus schema.sql form the center of gravity for state transitions, mailboxes, task/loop APIs, and telemetry. From there, the rest looks like pluggable control loops and adapters—CLI ingress, allocation, merge, watchdog/recovery, transport, and worker/isolation backends—so I’m now separating that true orchestration kernel from optional web, sandbox, and newer glue modules.

---

I’ve reformatted the coordinator sources locally so I can trace the real control flow cleanly, which should let me add concrete implementation details instead of relying on the GitHub view alone.

---

I

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-core/_rollup.md
