# Instruction Patches

Governed pipeline for proposing instruction improvements from validated learnings.
Patches are sourced from distill summaries, curation cycles, and agent observations.

## Governance Gates
- Role/agent doc patches (`*-role.md`, `worker`, `architect`): ≥3 observations before approval
- Knowledge/domain patches: ≥1 observation before approval
- All patches require explicit human reviewer attribution (non-anonymous) before application
- Applied patches are immutably recorded in the audit trail; they cannot be un-applied via this pipeline

## Pipeline Commands
```
codex10 propose-patch <target> <summary> <pattern> <suggestion> [--by <agent>] [--rationale <text>] [--evidence <text>]
codex10 observe-patch  <patch-id> <evidence>
codex10 approve-patch  <patch-id> <reviewer>
codex10 apply-patch    <patch-id>
codex10 reject-patch   <patch-id> <reviewer> [reason]
codex10 list-patches   [--status proposed|approved|applied|rejected|all]
codex10 scan-distills  <domain> <content>
```

## Pending Proposals

### PATCH-001 [patterns.md] — Add anti-pattern for merge queue race condition
**Status:** approved  |  **Score:** 1/1 ✓ READY FOR REVIEW
**Pattern observed:** Workers calling complete-task before verifying PR is merged causes merge queue loops
**Suggested change:** Before calling complete-task, verify the PR status is 'merged' not just 'ready'
**Rationale:** Prevents the infinite merge loop pitfall observed multiple times
**Evidence:**
- 2026-03-18T09:16:02.003Z: T-11 2026-03-16: worker completed task before PR was actually merged, triggering re-queue loop
**Proposed by:** master-2 at 2026-03-18T09:16:02.003Z
**Reviewed by:** alex at 2026-03-18T09:16:26.874Z

### PATCH-002 [master-2-role.md] — Require observation count check before staging instruction patches
**Status:** proposed  |  **Score:** 1/3
**Pattern observed:** Role doc patches staged without evidence backing can cause instruction drift
**Suggested change:** Always check observation count meets threshold before calling approve-patch on role doc patches
**Evidence:**
- 2026-03-18T09:16:13.824Z: 2026-03-16: patch was staged with only 1 observation, leading to premature role doc change
**Proposed by:** master-2 at 2026-03-18T09:16:13.824Z

## Applied Patches (Audit Trail)

### ❌ PATCH-003 [patterns.md] — Duplicate test
**Status:** rejected  |  **Observations:** 0/1
**Pattern:** Workers calling complete-task before PR merged
**Reviewed by:** alex  |  **At:** 2026-03-18T09:16:53.415Z
**Rejection reason:** test entry — duplicate of PATCH-001
