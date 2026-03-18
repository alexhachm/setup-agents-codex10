# Loop Findings

Condensed learnings from autonomous loop agents. Updated by Master-2 during curation.
Budget: ~1000 tokens max.

## Submission Quality Rules
- Use explicit imperative verbs (`Add`/`Update`/`Fix`) in WHAT — avoid abstract verbs like `Propagate`
- Include plain relative path tokens (e.g. `coordinator/src/watchdog.js`) in body, not just backticked references
- Add direct runtime harm language and concrete affected behavior in WHY
- Avoid raw backticks in `loop-request` shell strings — use heredoc or single-quote escaping
- `loop-request` cooldown can suppress submissions for up to 3600s — carry prepared text in checkpoint NEXT, do not retry same iteration

## Loop Operational Patterns
- Run `loop-requests --json` + `check-completion` preflight before submissions to avoid duplicating pending request scope
- `check-overlaps` before deep source work prevents wasted effort on overlap-blocked file sets
- Mod-3 memory re-anchor (every 3rd iteration) catches context drift early
- Isolated temp-project repros using unique `MAC10_NAMESPACE` produce clean evidence without mutating coordinator state

## Known Stale Corrections (as of 2026-03-18)
- `coordinator/src/watchdog.js` respawn now includes `MAC10_NAMESPACE` — do not resubmit namespace-drop gap
- Both worker-sentinel.sh copies and loop-sentinel.sh now abort failed rebases without hard reset — worker-sentinel alignment completed by task-125; do not resubmit hard-reset gap
- `scripts/loop-sentinel.sh` now parses `loop-requests --json` — parity gaps tracked under req-67cf6813
- assign-task `worker_claimed` guard is present in current source — do not resubmit bypass gap without fresh repro
- All 7 loop-31 requests completed (req-8d19bead, req-d2b4ff57, req-63682edb, req-c5313699, req-f011ae9d, req-810dc70a, req-f4d4ce34) — ghost instance, non-tmux liveness, lock-ownership, overlay, depends_on parsing, functional_conflict recovery, merge_queue purge all fixed
- Dual-provider support (loop-32): All 3 requests completed (req-57b2b6ab, req-49212a00, req-e9113b4b) — provider-utils.sh abstraction, setup.sh persistence, runtime sentinel integration all landed. No hardcoded CLI calls remain outside provider-utils.sh

## Codebase Gaps
- merger.js functional_conflict merge recovery added (req-810dc70a completed) — processQueue now sweeps stale functional_conflict entries back to pending
- merge_queue lifecycle purge for terminal entries (req-f4d4ce34) — completed and merged
- ROOT CAUSE of most functional_conflict failures: merger.js runOverlapValidation hardcodes `npm run build` (lines 276, 280) but project only has `npm test` — req-774a9a05 completed but fix is on unmerged branch (chicken-and-egg: merger bug blocks merging its own fix). req-1840101a submitted to break deadlock via Tier 1/cherry-pick
- All 7 loop-30 requests completed (iter 17→19): Tier-2 transitions, reset-stagger, script-aware validation docs, clarification-wait, CLI usage, mailbox filtering, npm-run-build fix all landed
- db.js cascade-fail fix (4d55c5f) exists on unmerged branches — not on main/current branch. Not a new gap, merge pipeline issue
- watchdog.js non-tmux monitoring fix (req-deb12bf3) completed but also on unmerged branch

Last curated: 2026-03-18
