---
kind: research_note
scope: project
id: R-75fbc2
title: "coordinator — ChatGPT thinking research"
created: 2026-04-02
updated: 2026-04-02
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
I’m inspecting the repo on main to map the coordinator as the central control plane—entrypoints, state flow, orchestration boundaries, and how it coordinates masters, workers, and worktree isolation—then I’ll turn that into an architecture-focused analysis with trade-offs, risks, and concrete guidance.

---

I’ve narrowed the coordinator spine to coordinator/src: index.js composes the runtime, cli-server.js acts as the API boundary, and db.js anchors durable state. The orchestration pattern is becoming clear too—allocator, merger, and watchdog loops poll SQLite and drive an isolation cascade (msb → Docker → tmux).

---

I’ve now pinned the sharper boundaries: Node owns transport/RPC, durable SQLite state, and the control loops, while shell sentinels own actual agent execution. The key tension emerging is strong recoverability versus policy concentration in an oversized CLI/API module, plus at least one docs-versus-code mismatch around the GUI/web layer.

---

One

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator/_rollup.md
