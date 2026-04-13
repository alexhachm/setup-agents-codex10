---
kind: research_note
scope: project
id: R-cfd0ff
title: "coordinator-extensions — ChatGPT thinking research"
created: 2026-03-31
updated: 2026-03-31
topics:
  - coordinator-extensions
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What is the architecture, key files, and patterns of the coordinator-extensions domain?

# Findings
I’m pulling the repo structure and coordinator-extensions sources first, then I’ll trace how that domain plugs into the Node/Electron coordinator and worker model before distilling the architecture, file map, patterns, trade-offs, and concrete guidance.

---

I’ve confirmed there’s no literal coordinator-extensions domain file on main; this is an inferred layer around src/index.js, documented indirectly via the core/surface domain notes. It appears as a bundle of add-on modules—memory/insight ingestion, knowledge metadata, worker overlays, extra isolation/research backends, and an optional GUI/registry path—and I’m checking source and tests to separate stable patterns from older or disabled code.

---

I’m also including browser/session event plumbing and loop/sentinel spawning in that inferred extension layer, since they hang off the core loop even though they aren’t documented as a separate domain.

---

A

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-extensions/_rollup.md
