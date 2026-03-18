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

## Research-Distilled Patterns (2026-03-18)

### Loop Progress Gating
- Add a hard-stop at iteration 25: require checkpoint diff + net failing tests; stop if no improvement
- Circuit breaker: if iteration grows but diff stays tiny (same files, same edits), fail fast rather than loop
- Workers already emit heartbeats; watchdog should also check `net_change_size` to detect non-progress loops

### Merger Patterns
- **Validate speculative integrated commit**, not PR head alone: two individually-green PRs can break main when combined (merge skew)
- Model merger as a state machine: `queued → checks_running → checks_passed → ready → merged` with explicit failure states
- Queue invalidation: when a PR is removed or updated, invalidate downstream speculative builds and rebuild
- Serialized file writes: for any file-mutating agent task, ensure only one writer per path at a time (write temp → rename)
- Use small batches for agent-authored PRs (failure-prone); single-entry integration is safer than large batch

### Conflict Remediation Convergence
- Convergent pattern: conflict detected → rebase/update branch → rerun tests → if still failing, generate dedicated fix-PR
- Never auto-resolve conflicts blindly; mark as CONFLICT_UNRESOLVED and create fix task
- `git rerere`: consider enabling for repeated rebase cycles on a fast-moving mainline

### Dual-Provider Worker Patterns
- Parse CLI output as NDJSON/JSONL event streams (`--output-format stream-json` for Claude, `--json` for Codex); never parse formatted text
- Set `cwd` explicitly on every subprocess spawn and scope `CLAUDE_CONFIG_DIR` per worktree
- Encode safety tiers explicitly in CLI flags per task: plan-only → workspace-write → danger-only-in-isolated-env
- On task retry after non-deterministic failure: use `--fork-session` to branch from last good state, not `--continue`

### Routing and Registry
- Route by typed task envelope + capability registry; hard rules first (capability match, concurrency limit), then scoring, LLM routing last
- Never let agents call each other directly; all hops go through coordinator (prevents circular routing, fan-out storms)
- Include `deadlineAt` + `idempotencyKey` in every task to enable safe retries and duplicate detection

### Quality Gating Beyond Tests
- "Tests pass" is insufficient for mergeability; add: lint/format/typing gates + patch-size limit per task
- Consider "review notes" artifacts from worker explaining rationale and risks — improves human review at scale
