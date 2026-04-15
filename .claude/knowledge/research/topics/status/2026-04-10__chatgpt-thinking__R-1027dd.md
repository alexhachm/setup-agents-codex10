---
kind: research_note
scope: project
id: R-1027dd
title: "status — ChatGPT thinking research"
created: 2026-04-10
updated: 2026-04-10
topics:
  - status
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What is the architecture, key files, and patterns of the status domain?

# Findings
I’m pulling apart the repo structure first, then tracing how “status” is modeled, persisted, and surfaced across coordinator, CLI, and agents. After that I’ll synthesize the architecture, file map, trade-offs, and concrete guidance with citations.

---

I’ve confirmed status here is a cross-cutting domain, not a single module: SQLite-backed state plus coordinator query/transport layers, alongside a separate immutable top-level status/ live-audit registry. I’m now tracing the authoritative sources versus projections, including /api/status, CLI formatting, and the assembled snapshot slices.

---

I’ve now verified that operators are meant to consume a single aggregated snapshot, but there’s a notable reality gap: the README/frontend still describe a live dashboard while the current coordinator entrypoint leaves the web/dashboard path disabled or commented out. I’m pinning down the write paths and state machines next so I can separate authoritative runtime tables from potentially stale views and call out drift risks clearly.

---

I’ve mapped the status architecture and am now turning it into repo-specific design guidance: concrete module boundaries, lifecycle ownership, shared read-model/API wiring, and a staged refactor plan with code sketches.

---

I’ve pinned the key implementation hooks now: schema enums, db.js transition helpers, watchdog repair logic, and the split between mac10 status and /api/status.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/status/_rollup.md
