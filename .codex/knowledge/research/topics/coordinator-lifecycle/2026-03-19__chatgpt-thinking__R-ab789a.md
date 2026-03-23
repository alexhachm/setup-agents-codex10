---
kind: research_note
scope: project
id: R-ab789a
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
What are the established patterns for agent lifecycle management in production autonomous coding systems? Cover process spawning strategies, graceful shutdown protocols, crash recovery with state preservation, and task state machine designs used by systems like OpenDevin, SWE-Agent, Aider, and similar multi-agent platforms.

# Findings
I’m grounding this in the actual repos and docs for comparable systems and in your repository structure, so the analysis maps to your Node/Electron, worktree, and SQLite architecture rather than staying generic.

---

One clear pattern has emerged: robust systems keep a durable control plane separate from ephemeral workers, persisting append-only events plus a compact snapshot and explicit runtime pause/resume/stop state.

---

The comparison is sharp now: OpenHands acts like a durable workflow engine, SWE-agent like a restartable batch runner, and Aider like an interactive git-backed session tool.

---

I’m extending this into a concrete Node-oriented design now: explicit state enums, SQLite schema, worker supervisor logic, shutdown and recovery sequences, plus a few TypeScript examples you can adapt directly.

---

I’m tightening it around your actual coordinator mechanics now: tmux/sentinel transport, SQLite lease handling, startup recovery flow, failure escalation, and attempt-level recovery.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator-lifecycle/_rollup.md
