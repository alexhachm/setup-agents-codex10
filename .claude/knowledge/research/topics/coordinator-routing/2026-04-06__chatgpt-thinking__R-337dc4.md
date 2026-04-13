---
kind: research_note
scope: project
id: R-337dc4
title: "coordinator-routing — ChatGPT thinking research"
created: 2026-04-06
updated: 2026-04-06
topics:
  - coordinator-routing
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What is the architecture, key files, and patterns of the coordinator-routing domain?

# Findings
I’m tracing the current main branch flow from CLI/Electron entrypoints into the coordinator and out to masters, workers, and worktrees, grounding it in the actual files that represent, persist, and execute routing decisions. After that I’ll synthesize the architecture, key modules, patterns, trade-offs, and likely failure modes into concrete recommendations.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-routing/_rollup.md
