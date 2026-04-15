---
kind: research_note
scope: project
id: R-f93e29
title: "coordinator-routing — ChatGPT thinking research"
created: 2026-04-02
updated: 2026-04-02
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
I’m mapping the repo structure and coordinator-related call paths first so the analysis is grounded in the actual files. Then I’ll trace how routing flows across coordinator, masters, workers, and state, and turn that into architecture, key files, patterns, trade-offs, and concrete guidance.

---

I’ve confirmed routing is an in-process control plane inside a compact Node coordinator: src/index.js boots the socket/CLI server, SQLite workflow state, allocator, merger, watchdog, and worker backend. Now I’m tracing the handoff chain—command ingress and normalization in cli-server.js, DB-backed routing metadata/state transitions, then allocation/spawn, mailbox bridges, and recovery loops.

---

I’ve finished tracing the boundary: routing is layered across bin/mac10 transport, cli-server.js dispatch, db.js as the durable state/mailbox engine, and index.js side-effect handlers. Two finer points stand out—cli-server.js embeds fallback model-routing/handoff logic, and handoff.json plus the allocator mainly serve as compatibility/recovery bridges rather than the final scheduler.

---

At this point the answer is concrete: the routing core is centralized and deterministic, but conceptually clean layers are undermined by heavy concentration in cli-server.js. I’m now anchoring the recommendations to specific routing commands, handler paths, and role-prompt wiring in the source.

---

I’ve pinned down the concrete seams I’ll use for the deeper pass: command handlers in cli-server.js, durable task/mail primitives and schema touchpoints in db.js, and pull-based assignment in allocator.js.

---

I’m now pinning the exact request, assignment, and recovery branches—including claim/assign/start/complete transactions—so I can show where to split services. The two concrete refactors emerging are extracting routing policy from cli-server.js and unifying the request-handoff and task-assignment paths.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-routing/_rollup.md
