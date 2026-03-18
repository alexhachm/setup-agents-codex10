# Decomposition Patterns

Learnings from past task decompositions. Updated by the Architect after completing triage cycles.

## Good Patterns
- **Batch-triage 4 Tier 2 tasks simultaneously** when 4 idle workers available — claim all, create tasks, assign, release in sequence. Maximizes worker utilization.
- **Script-aware validation** is critical: this repo has no `build` script, only `test`. Hardcoded "npm run build" caused 15+ merge failures.
- **Group docs-only Tier 1s strategically**: fix highest-impact docs first (validation defaults > stagger guards > triage steps > help text).
- **Record triage tier after Tier 2 assignment**: prevents requests lingering as `[pending]` and polluting backlog drain counts.

## Good Patterns (cont.)
- **Serialize same-file tasks with depends_on**: tasks touching the same file across different requests (e.g. scripts/loop-sentinel.sh, merger.js, db.js checkAndPromoteTasks) should be chained to avoid merge conflicts.
- **Triage without idle workers**: create task + triage even when no workers are idle. Task enters ready queue for Master-3 allocation.
- **Aggressive curation**: loop-findings.md grew to 52K tokens. Prune to actionable patterns only during curation.
- **Bulk triage builds ready buffer**: triaging all pending requests in one session fills ready queue well above floor.
- **Detect duplicates early**: req-b744636d was identical to req-9f5526cb (same active-state guard fix). Triage as covered to avoid wasted worker cycles.
- **Group related requests**: provider-switching requests (namespace, reload, persistence, umbrella) benefit from joint triage to identify overlaps and proper Tier 3 decomposition.

## Anti-Patterns
- **Hardcoded npm run build validation**: caused widespread merge failures. Always use script-aware selection.
- **Skipping triage call for Tier 2**: leaves requests as pending, confuses backlog drain metrics.
- **Using codex10 status for stagger check**: status output has no agent reset fields. Use agent-health.json directly.
- **Uncurated knowledge files**: loop-findings.md at 52K tokens wastes context budget and slows agent reads. Enforce token budgets aggressively.
