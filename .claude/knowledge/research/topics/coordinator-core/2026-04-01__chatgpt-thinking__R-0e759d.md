---
kind: research_note
scope: project
id: R-0e759d
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
I’m inspecting the repo structure and coordinator-core execution path first, then I’ll map how its files, state, and agent orchestration fit together before weighing design patterns and trade-offs.

---

A clear pattern is emerging: coordinator-core is a control plane rather than a framework-heavy app, with a tiny index.js composing CLI ingress and long-lived allocator/merger/watchdog loops around a very large SQLite-backed db.js. I’m tracing the actual request/state flow now to pin down the real domain boundaries and separate core orchestration from optional execution backends.

---

I’ve pinned down the concrete module boundaries now: db.js and cli-server.js dominate the core, while most other files are polling loops or execution adapters around them.

---

The key non-obvious detail is now clear: the “allocator” is mostly a notifier/recovery loop, while the real task claim-and-assign transaction lives in the CLI command layer. I’m anchoring the final architecture and refactor guidance to those exact command, watchdog, and DB transition paths.

---

I’m in the code-level pass now, pulling raw sources locally and tracing specific functions across the boot sequence, schema/DB API, worker lifecycle, merge queueing, and watchdog recovery so the next answer can include grounded examples and concrete refactor recommendations.

---

I’ve now traced the full lifecycle end to end: request ingress → DB-backed state transitions → worktree/overlay launch → completion and merge queue → merger/watchdog repair, with most complexity concentrated in idempotent recovery around assignment, merge ownership, and stale integration.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-core/_rollup.md
