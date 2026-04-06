---
kind: research_note
scope: project
id: R-fdda6e
title: "git-generated-noise-policy — ChatGPT thinking research"
created: 2026-04-06
updated: 2026-04-06
topics:
  - git-generated-noise-policy
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What implementation patterns are robust for keeping a git worktree clean when a system generates runtime state, logs, research artifacts, and ephemeral control files inside the repo? Focus on approaches like relocating generated files, ignore/index strategies, and startup cleanup policies, with tradeoffs for operator-facing repositories.

# Findings
I’m grounding this in the actual repo and Git’s behavior, starting by inspecting the current runtime/worktree file layout. Then I’ll compare relocation, per-worktree ignore/exclude, index-based tactics, and startup cleanup hooks for operator-facing worktrees.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/git-generated-noise-policy/_rollup.md
