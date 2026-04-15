---
kind: research_note
scope: project
id: R-f2780f
title: "workspace-hygiene-wrapper — ChatGPT thinking research"
created: 2026-04-06
updated: 2026-04-06
topics:
  - workspace-hygiene-wrapper
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
For a persistent multi-agent git workspace, what is the safest policy for automatically handling a root checkout that may be behind origin/main and may be dirty due to mixed runtime-generated files and real source edits? Focus on guardrails for fetch, classification of generated/runtime dirt vs user edits, when fast-forward is safe, when to avoid rebase/pull, and how to keep operator UX quiet without risking data loss.

# Findings
I’m reviewing the repo and its current git/worktree flow first, then I’ll turn that into a concrete safety policy with implementation guidance.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/workspace-hygiene-wrapper/_rollup.md
