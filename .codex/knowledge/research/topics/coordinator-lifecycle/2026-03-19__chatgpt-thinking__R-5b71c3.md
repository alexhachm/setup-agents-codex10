---
kind: research_note
scope: project
id: R-5b71c3
title: "coordinator-lifecycle — ChatGPT thinking research"
created: 2026-03-19
updated: 2026-03-19
topics:
  - coordinator-lifecycle
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What are the established patterns for agent lifecycle management in production autonomous coding systems like OpenHands, SWE-Agent, and Devon? Cover process spawning strategies, graceful shutdown protocols, crash recovery with state preservation, and task state machine designs. Include concrete implementation examples from open-source codebases.

# Findings
I’m grounding this in actual OpenHands, SWE-Agent, and Devon code, breaking lifecycle management into agent startup, shutdown, recovery, and task-state modeling before mapping the trade-offs to your Node/Electron coordinator.

---

I’ve confirmed a key production pattern already: OpenHands is session-centric and event-sourced, with durable session identity separate from the live process. I’m also checking its newer Software Agent SDK path so I don’t anchor the recommendation on legacy lifecycle code.

---

I’ve mapped the three lifecycle archetypes now: OpenHands emphasizes resumable sessions with detach/reattach, SWE-Agent favors disposable attempts with durable trajectories, and Devon lands between them with persisted sessions plus git-backed checkpoints.

---

I’m checking your repo structure now so the recommendation matches your actual coordinator, worktree, and sentinel-loop constraints instead of staying generic.

---

I’m at the source-level pass now: tracing exact entrypoints, signal/close hooks, persistence boundaries, and restart paths so I can turn this into concrete Node/Electron supervisor guidance.

---

I’ve pinned down the remaining implementation details that matter most in production: PID ownership, reconnect semantics, idempotent lifecycle transitions, and exactly what must be persisted before a worker dies. Devon’s especially useful here because its Session uses explicit start/pause/terminate states and checkpoints history with an event-log cutoff and git commit metadata.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-lifecycle/_rollup.md
