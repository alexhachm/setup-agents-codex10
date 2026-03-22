---
doc_kind: reference
scope: project
owner: domains/orchestration-scripts
last_verified: 2026-03-16
rot_risk: medium
related_paths:
  - .codex/scripts/loop-sentinel.sh
  - templates/commands/architect-loop.md
  - templates/docs/master-2-role.md
  - coordinator/bin/mac10
---

# Orchestration Scripts

## Executive Summary
- Covers sentinel scripts, architect loop mirrors, and CLI normalization for loop orchestration
- Core concern: keeping tracked mirrors and runtime copies semantically aligned
- Biggest foot-gun: loop-sentinel ACTIVE_COUNT parsers silently defaulting to zero on JSON parse failure

## Invariants and Contracts
- `.codex/commands-codex10/architect-loop.md` must mirror `templates/commands/architect-loop.md`
- Loop-sentinel ACTIVE_COUNT must use `loop-requests <loop_id> --json` plus JSON parsing; never grep human-readable output
- If command execution or JSON parse fails, treat ACTIVE_COUNT as unknown and back off; never default to zero

## Key Patterns
- **loop-requests normalization**: `coordinator/bin/mac10` must canonicalize loop-request arrays from `requests`, `data.requests`, `data.rows`, `rows`, and raw array payloads
- **Sentinel ACTIVE_COUNT**: prefer the first non-empty array candidate; avoids false zero counts
- **Architect instructions**: avoid hardcoded validation defaults; use script-aware task payload generation
- **Mirror drift detection**: if setup detects drift between tracked and runtime copies, preserve the runtime copy

## Pitfalls
- **False zero active count**: parser failures silently returning zero causes sentinel to exit loops prematurely
- **Mirror drift**: tracked script and runtime copies can diverge silently; always check both after edits
- **Hardcoded validation**: adding default `npm run build` validation for repos without build scripts breaks docs-only tasks

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
