---
kind: research_note
scope: project
id: R-2c1ec3
title: "coordinator-core — ChatGPT thinking research"
created: 2026-04-01
updated: 2026-04-01
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
I

---

I’m inspecting the current main branch and isolating the coordinator-core area first, then I’ll trace its control flow, state, and agent orchestration into an architecture readout with trade-offs, risks, and implementation guidance.

---

I’ve confirmed it’s a separate coordinator/ Node package with index.js as a thin composition root over a much larger db.js, plus the CLI socket server and timed allocator/watchdog/merger loops. The emerging pattern is a DB-centered, single-process control plane rather than an event-bus-heavy service graph, and I’m now tracing command ingress through SQLite mutations into worker lifecycle, recovery, and merge behavior.

---

One nuance: request intake still uses a compatibility bridge that writes handoff.json and signal files for the architect. I’m also delimiting supporting adapters—execution backends, overlay/context injection, and knowledge ingestion.

---

I’ve finished the code-path pass: the coordinator-core behaves as a state-machine orchestration kernel with heavy reconciliation to repair drift. The key tension is that db.js and cli-server.js absorb too many domains, so I’m centering the recommendations on what to keep versus split.

---

I’m now grounding the review in a file-by-file pass over the actual source: comparing schema usage, command transport, DB mutations, and loop behavior across the oversized modules, with repo-tied code examples.

---

I’m validating where transitions are explicitly enforced versus merely inferred by the loops, using schema.sql and overlay.js to anchor concrete state and task-context examples. I’ve also traced the three critical paths—assignment, completion/merge, and watchdog recovery—which look deliberately repairable and replay-safe.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-core/_rollup.md
