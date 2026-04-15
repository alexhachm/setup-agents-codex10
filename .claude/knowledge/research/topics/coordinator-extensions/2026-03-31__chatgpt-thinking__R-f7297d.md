---
kind: research_note
scope: project
id: R-f7297d
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
What is the architecture, key files, and patterns of the coordinator-extensions domain? Provide specific implementation details, code examples, and concrete recommendations.

# Findings
I’m first mapping the repo and tracing the coordinator-extensions code paths into the Electron/Node coordinator, workers, and state flow so the analysis is grounded in actual files and runtime behavior.

---

I’ve confirmed there isn’t a single obvious coordinator-extensions folder or domain file; I’m treating it as extension-oriented modules under coordinator/src layered over the core coordinator loop and scheduler.

---

I’ve now pinned the extension slice to runtime hooks in index.js that wire overlay, knowledge/insight ingestion, and sandbox backends into task assignment and loop creation instead of a formal plugin registry.

---

I’m tightening this with exact file behavior and tests now. One key verified detail: browser/research work is quota-managed with batching, dedupe, and size negotiation, while insight ingestion is intentionally best-effort and non-throwing if persistence fails.

---

I’ve got the raw source and DB layer locally now; the next pass is file-by-file through concrete handler names, table schemas, and control flow. The extension slice mainly sits beside the small coordinator core, concentrated in startup, worker provisioning, runtime persistence, and operator visibility.

---

I’ve confirmed these extensions are live coordinator paths, not dormant helpers: watchdog uses isolation backends, allocator and merge flows drive research/insight ingestion, and startup rebuilds memory indexes plus knowledge overlays. I’m also validating a likely CLI/DB contract drift around research queue APIs and checking model-routing behavior before turning this into concrete recommendations.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-extensions/_rollup.md
