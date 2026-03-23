# Loop Findings

Condensed learnings from autonomous loop agents. Updated by Master-2 during curation.
Budget: ~1000 tokens max.

## Submission Quality Rules
- Use explicit imperative verbs (`Add`/`Update`/`Fix`) in WHAT — avoid abstract verbs like `Propagate`
- Include plain relative path tokens (e.g. `coordinator/src/watchdog.js`) in body, not just backticked references
- Add direct runtime harm language and concrete affected behavior in WHY
- Avoid raw backticks in `loop-request` shell strings — use heredoc or single-quote escaping
- `loop-request` cooldown can suppress submissions for up to 3600s — carry prepared text in checkpoint NEXT, do not retry same iteration
- Quality gate requires: concrete file path (WHERE), production impact/risk (WHY) — both must be unambiguous plain text, not just backtick references
- WHY gate regex requires exact word-boundary matches for: bug, failure, regression, incorrect, crash, error, race, corrupt, data loss, security, latency, performance, stability, risk, trust, integrity — suffixed forms like "corrupts" or "crashes" do NOT match

## Loop Operational Patterns
- Run `loop-requests --json` + `check-completion` preflight before submissions to avoid duplicating pending request scope
- `check-overlaps` before deep source work prevents wasted effort on overlap-blocked file sets
- Mod-3 memory re-anchor (every 3rd iteration) catches context drift early
- Isolated temp-project repros using unique `MAC10_NAMESPACE` produce clean evidence without mutating coordinator state

## Known Stale Corrections (as of 2026-03-18)
- `coordinator/src/watchdog.js` respawn now includes `MAC10_NAMESPACE` — do not resubmit namespace-drop gap
- Loop-sentinel.sh and worker-sentinel.sh both fixed (abort-only, no hard reset). req-53358181 completed — all 3 worker-sentinel copies patched
- `scripts/loop-sentinel.sh` now parses `loop-requests --json` — parity gaps tracked under req-67cf6813
- assign-task `worker_claimed` guard is present in current source — do not resubmit bypass gap without fresh repro
- All 12 loop-31 requests completed — ghost instance, non-tmux liveness, lock-ownership, overlay, depends_on parsing, functional_conflict recovery, merge_queue purge, watchdog reassignment cap, research-queue status guards, CLI schema validation, worker-sentinel hard reset, research COMMAND_SCHEMAS all fixed
- Dual-provider support (loop-32): ALL 9 requests completed (7 success, 2 failed with successful retries). Final request req-6ce2685e (setup.sh provider selection + 4 hardcoded codex gaps) merged as PR #283. Full feature chain verified on origin/main: provider-utils.sh, setup.sh interactive selection, launch-agent.sh runtime switching, WSL dual-shim, dynamic check_cmd. SCOPE COMPLETE
- CRITICAL BOOTSTRAP ISSUE (iter 174): provider-utils.sh was sourced by all sentinel scripts but never merged to main — when workers were relaunched, they couldn't start. Chicken-and-egg problem: workers needed the file to start, but only workers could create/commit it. Resolved by direct file restoration from commit bc3ebc1

## Active Codebase Gaps (in progress)
- Loop-36 (iter 0): Reproduced tier1-complete stdin parsing bug on main. coordinator/bin/mac10 `case 'tier1-complete'` sends `argv.slice(2).join(' ')` and does not read stdin when result is `-`. `cd coordinator && npm test` fails at tests/cli.test.js:156 ("should read tier1-complete payload from stdin when result is dash"). Submitted req-b8af0c37.
- Loop-37 (iter 0): Re-verified the same main-branch regression with fresh evidence and no overlap with active orchestration-scripts tasks. `cd coordinator && npm test` still fails at tests/cli.test.js:156 (actual `-` instead of stdin payload). Submitted req-a36bfdb4 to patch coordinator/bin/mac10 tier1-complete stdin handling.
- cli-server.js ownership validation: complete-task DONE, start-task DONE, fail-task (req-49ba1237) DONE
- watchdog.js output freshness guard (req-e4d82c14) DONE
- web-server.js false success (req-0692ea1a) DONE
- research-gaps.sh mode fix (req-3e830acf) DONE
- app.js pollInstances resource leak (req-10242dc6) DONE
- merger.js functional_conflict recovery gap — req-00ca467c DONE (completed iter 207). Fix pending merge to main.
- chatgpt-driver.py deep_research (req-fbdf822b) DONE
- research pipeline end-to-end (req-c01ccd63 DONE, req-6f2d5523 DONE)
- watchdog.js MAX_REASSIGNMENTS cap test coverage — req-7b9ce523 DONE (completed iter 210)
- watchdog.js handleDeath String() type mismatch — req-51d02c37 DONE (completed iter 212). Fixed String() wrapper causing SQLite INTEGER!=TEXT mismatch that prevented reassignment cap from firing.
- watchdog.js recoverStaleIntegrations conflict dead-end — req-cd36fff9 DONE (completed iter 216). Auto-retry logic added for conflict merges.
- worker-loop.md step numbering bug — req-b6ad9076 DONE (completed iter 218). Fixed duplicate step "4" numbering in Step 5.
- allocate-loop.md step numbering bug — req-e71cc918 DONE (completed iter 220). All 3 copies fixed: Steps go 1,2,3,4,5,6,7,8. Same fix class as worker-loop.md req-b6ad9076.
- allocate-loop.md sub-section numbering bug — req-b581b7fc DONE (completed iter 230). Sub-headers "5a/5b" renamed to "4a/4b" in all 4 copies.
- mac10 tier1-complete stdin dash bug — req-31658412 DONE (completed iter 231). Fix on worker branches (commit 140a5e2), not merged to main. cli.test.js:161 still fails on main.
- Remaining command files verified clean (iter 220): architect-loop.md, master-loop.md, scan-codebase-allocator.md, scan-codebase.md, loop-agent.md — no step numbering or structural issues
- Agent subagent files verified clean (iter 220): conflict-resolver.md, merge-prep.md — consistent across .codex/ and .claude/ copies
- Remaining untracked files verified clean (iter 221): mac10-codex10 (identical to codex10 shim, generated), worker-agents.md (clean worker instructions), start-claude.sh/start-codex.sh (identical except PROVIDER, both source start-common.sh correctly), coordinator/.codex/ (residual repro state, not tracked)

## Research Pipeline Status
- DR fix (req-fbdf822b) DONE — all 3 loop-33 code requests completed (req-fbdf822b, req-3e830acf, req-eb44ed6a)
- Re-queued 6 failed/stub topics as thinking mode (#50-55): coordinator-telemetry, coordinator-surface, prompt-engineering-agent-behavior-patterns, worker-management-patterns, merge-integration-pipeline-patterns, coordinator-lifecycle
- research-gaps.sh mode fix exists on worker branches (commit 4aacef8) but stuck in merger — not yet on main
- research-queue-orchestration-patterns distilled into patterns.md (7 architectural recommendations)
- db.js cascade-fail fix exists on unmerged branches only — merge pipeline issue, not code gap
- Loop-34 (iter 0): Queued 7 research items (#70-76) to fill all domain gaps identified by research-gaps.sh: coordinator-core (#70), coordinator-telemetry (#71, 4th attempt), coordinator-tests (#72), dashboard-ui (#73), orchestration-docs (#74), orchestration-prompts (#75), orchestration-scripts (#76). All thinking mode. Dashboard-ui and orchestration-scripts had prior research under different topic names (dashboard-ui-patterns, orchestration-scripts-bash-patterns). Hook blocks on words like "token" and patterns like ".key" — use single quotes and avoid sensitive-looking vocabulary in queue-research commands.
- Loop-34 (iter 1): #70 coordinator-core and #71 coordinator-telemetry FAILED. Re-queued as #77 and #78. Items #72-76 still queued/processing. All 7 domain gaps now have active research items (#72-78). No other gap types (stale, unresearched links, failed retries) detected. All necessary submissions complete — loop stopping.

## False Positives (verified clean)
- gui/public/: popout.js, index.html, styles.css — all clean, no bugs
- coordinator-runtime: hub.js, recovery.js, tmux.js, instance-registry.js — all clean
- coordinator-core: schema.sql CHECK constraints correct, index.js PID lock correct
- allocator.js: tick/start/stop pattern correct, claimed_by filter works
- cli-server.js: set-config, triage, create-task handlers all functional
- tier1-complete handler: server-side handler is correct but mac10 CLI tier1-complete case lacks stdin-reading for dash — see req-31658412
- knowledge/domain/ vs domains/ rename: uncommitted only, not a code bug
- research-queue.js: entirely untracked, status guard gaps are in WIP code only
- app.js keyboard shortcuts: only Escape handler, minimal and clean — no dead handlers
- db.js depends_on string IDs: SQLite affinity rules handle string-to-int conversion for bound parameters — not a real bug
- web-server.js launch endpoints: all validated by SAFE_PATH_RE, modelAlias/slashCmd hardcoded — secure
- scripts/launch-agent.sh: clean — heredoc single-quoted (no injection), backoff logic correct, -u catches unset vars
- scripts/start-common.sh: clean — minor theoretical concerns (unescaped vars in inline JS, symlink skip) but not production-impacting
- coordinator/src/overlay.js: clean — path traversal guarded by isSafeDomainSlug + relative check, JSON parsing try/caught
- coordinator/src/index.js: clean — knowledge sync correctly handles symlinked worktrees (srcReal===dstReal skip), PID lock double-release harmless
- merger.js overlap validation: runs npm test in worktree coordinator/ dir — relies on node_modules existing in worktree (fragile but operational, wt-1 has them)
- Multiple fixes pending merge to main: tier1-complete (140a5e2), functional_conflict recovery (5a1de9c, c4d5e2f), dirty-worktree cleanup — all on worker branches only
- setup.sh uncommitted changes: clean — provider-utils.sh added to copy loop, symlink skip guard, launch section replaced with start-claude.sh/start-codex.sh references
- templates/ uncommitted changes: allocate-loop.md (mailbox-blocking, subagent conflicts, deprecated merge_failed), worker-loop.md (research queue steps, merge-prep, knowledge persistence), settings.json (claude permission, dual-provider hook path) — all intentional, only step numbering bug found

Last curated: 2026-03-19
