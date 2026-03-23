---
kind: topic_rollup
scope: project
topic: research-queue-orchestration-patterns
updated: 2026-03-19
top_notes:
  - R-36b86b
---

# Research Queue Orchestration Patterns

## Current Recommended Approach
Keep the mac10-style coordinator/sentinel architecture, but make the protocol stateful, typed, and enforced. The biggest leverage is moving operational state out of prompt memory and into the coordinator DB.

## Key Recommendations (from R-36b86b deep_research)
1. **Persist operational counters in coordinator** — tasks_completed, context_budget, domain_lock, scan_version_seen, last_exit_reason, restart counts should live in SQLite, not prompt working memory. Highest-leverage anti-drift improvement.
2. **Enforce role contracts at tool layer** — Interface and Allocator should be read-only at runtime, not just in prompt prose. Only Workers get code-write authority.
3. **Typed task envelope** — Add done_when, non_goals, hazards, validation_profile, retry_policy, protocol_version to task schema. Improves decomposition quality, allocator safety, validation relevance, and restart recovery.
4. **Domain-aware validation** — Replace hardcoded npm checks with profile-based validation (node-api, smoke-ui, etc.). Generic validators waste cycles and teach wrong lessons.
5. **Knowledge writes via distillation events** — Workers in worktrees should not write directly to .codex/knowledge/. Submit distillation events; coordinator merges them. Prevents PR diff pollution and conflict.
6. **Structured restart semantics** — Sentinel should use typed exit codes (idle, completed, budget_reset, validation_failed, fatal_tool_error), persist them, and quarantine workers after N failures in M minutes.
7. **Prompt-stack linting** — Generate role/loop docs from shared protocol source. CI should fail on undefined counters, contradictory transport rules, or mismatched task fields.

## Decision Hooks
- When adding new counters/state: put in coordinator DB, not prompt memory
- When defining new roles: enforce capabilities at tool/settings layer
- When creating task decomposition: include done_when and non_goals
- When workers need to share learnings: use distillation events, not direct file writes

## Known Pitfalls
- Contract drift across prompt files (triage_count vs decomposition_count mismatch already observed)
- False confidence from generic validators (npm run build when no build script exists)
- Role leakage in long sessions when runtime doesn't enforce role boundaries
- Knowledge rot when facts lack provenance/scan-version tracking

## Evidence
- R-36b86b (chatgpt-deep_research): Compared codex9, mac10, OpenHands, SWE-Agent, Aider architectures. Identified coordinator-owned state as key differentiator for long-running reliability.

## What We Tried That Did NOT Work
- File signals + JSON locks (codex9 era): creates platform-specific watch logic, stale-lock handling, duplicate sources of truth
- Prompt-memory counters: unreliable across resets, crash recovery, model inconsistency
- Architect editing code directly: pollutes planner context in long-running sessions
