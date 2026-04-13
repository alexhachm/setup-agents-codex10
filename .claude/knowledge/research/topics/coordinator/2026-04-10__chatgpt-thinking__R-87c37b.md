---
kind: research_note
scope: project
id: R-87c37b
title: "coordinator — ChatGPT thinking research"
created: 2026-04-10
updated: 2026-04-10
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
I’m mapping the repo first, then tracing the coordinator entrypoints, state flow, and worker orchestration so the answer is grounded in the code. After that I’ll synthesize the architecture, file responsibilities, and the main design trade-offs.

---

I’ve confirmed coordinator/ is a self-contained Node control plane with src/index.js as the composition root. The code centralizes decisions in db.js/cli-server.js, with periodic loops and pluggable backends around them; I’m now separating core lifecycle paths from optional or legacy pieces.

---

I’ve traced the runtime far enough to see the coordinator domain living mostly in schema.sql/db.js plus command entrypoints like cli-server.js and bin/mac10. I’m now verifying a README-versus-code mismatch around the actual merge path before recommending refactors.

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
- topics/coordinator/_rollup.md
