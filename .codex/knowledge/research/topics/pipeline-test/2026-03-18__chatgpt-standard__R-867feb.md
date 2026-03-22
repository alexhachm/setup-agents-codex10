---
kind: research_note
scope: project
id: R-867feb
title: "pipeline-test — ChatGPT standard research"
created: 2026-03-18
updated: 2026-03-18
topics:
  - pipeline-test
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
What is the standard pattern for health checks in long-running background processes?

# Findings
Health checks in long-running background processes typically use a combination of heartbeat signals (periodic state writes), watchdog timers (kill-and-restart on missed beats), and structured status files (JSON health blobs). Common patterns include: writing a timestamp to a health file every N seconds, having a supervisor process verify freshness, and exposing a simple HTTP or socket endpoint that returns 200/ok when the service is alive.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/pipeline-test/_rollup.md
