---
doc_kind: reference
scope: project
owner: domains/orchestration-prompts
last_verified: 2026-03-16
rot_risk: low
related_paths:
  - templates/commands/master-loop.md
  - .codex/commands-codex10/master-loop.md
---

# Orchestration Prompts

## Executive Summary
- Controls prompt templates for Master-1 (interface) loop and clarification flows
- Key change: clarification checks use `codex10 inbox master-1`, not legacy `clarification-queue.json`
- Biggest foot-gun: editing `.codex/` paths directly instead of tracked template mirrors

## Invariants and Contracts
- Clarification polling in master-loop prompts must reference `codex10 inbox master-1`
- Legacy `clarification-queue.json` polling is obsolete and must not appear in prompts
- Edit the tracked template (`templates/commands/master-loop.md`) and let propagation handle `.codex` mirrors

## Pitfalls
- `.codex/` prompt files are runtime state in Windows worktrees; edits there may not persist or appear in PRs
- Any reintroduction of `clarification-queue.json` breaks the mailbox contract

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
