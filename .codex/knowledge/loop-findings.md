# Loop Findings

## Successful Patterns
- Loop 4 iteration 12 (2026-03-16): running checkpoint-directed overlap checks first (`loop-requests`, `status`, `check-completion`) showed `req-f345a353`/`req-ed004636`/`req-3e4154f2` were already ALL DONE and avoided duplicate stale-completion scope already pending as `req-0b10b9da`, which left room for a distinct loop-lifecycle defect submission (`req-29cca40f`).
- Loop 2 iteration 14 (2026-03-16): phase-2 outcome review showed recent completed allocator requests (`req-06a7ffa0`, `req-a179239f`, `req-315afdcf`) all used imperative WHAT verbs, exact coordinator file/function anchors, and concrete runtime contradictions; preserving that packet shape continued to pass execution quality gates.
- Loop 4 iteration 2 (2026-03-16): extracting the prior quality-gate miss from checkpoint state, then pairing loop-prompt directives with direct file/CLI handler contradictions and plain WHERE path tokens, produced accepted request req-9a2e8f54 without overlap churn.
- Loop 2 iteration 4 (2026-03-16): high-confidence allocator lifecycle requests that include a direct source contradiction plus an isolated runtime/DB repro continued to complete (e.g., req-6a20de1d), reinforcing the current WHAT/WHERE/WHY/EVIDENCE packet format.
- Loop 2 iteration 3 (2026-03-16): combining phase-2 outcome review (`loop-requests` showed `req-6a20de1d` completed) with live runtime checks (`status`, `check-completion`) and direct DB verification for `req-5cf58afb` (`decomposed` + `0/0` tasks) produced a concrete, allocator-aligned lifecycle submission (`req-315afdcf`) with explicit WHAT/WHERE/WHY/EVIDENCE.
- Loop 21 iteration 14 (2026-03-13): pairing loop-outcome preflight (`loop-requests`, `status`, `check-completion`) with direct source inspection in `coordinator/src/db.js` and an isolated temp-DB repro (`depends_on [999999]` auto-promotes to `ready`) produced accepted allocator-scope request `req-ab8d975a` without overlapping active stale-decomposed remediation.
- Loop 21 iteration 11 (2026-03-13): phase-2 `loop-requests` refresh showed a 4/4 completed streak with no failures (req-e229ad57, req-768fdda8, req-a4abcc15, req-ccf8e1e3), reinforcing that narrow, file-anchored allocator parity fixes keep landing reliably.
- Loop 17 iteration 13 (2026-03-13): combining checkpoint-directed `check-completion` rechecks with `origin/main` parity prevented a stale branch false positive (local `complete-task` looked telemetry-blind while `origin/main` still had usage normalization/persistence); this preserved submission quality and uncovered a real UI-only telemetry defect, producing accepted request `req-ed041c12`.
- Loop 17 iteration 12 (2026-03-13): checkpoint-directed lifecycle validation (`check-completion req-e4949f4d`) plus `origin/main` parity checks before drafting avoided a duplicate telemetry submission when local branch drift contradicted upstream code.
- Loop 17 iteration 3 (2026-03-13): combining mandatory external-source evidence (OpenAI/Anthropic/Vertex/AutoGen docs + niche repo issue signals) with isolated local CLI repros and origin/main parity anchors produced a high-confidence, non-overlapping routing-quality/cost submission (`req-a079b39b`) in one pass.
- Loop 18 iteration 2 (2026-03-13): validated overlap first (`loop-requests` + `status` confirmed active `req-c90d2149`), then used an executable stopped-loop lifecycle repro (`loop` -> `stop-loop` -> `loop-checkpoint` -> `loop-prompt`) to submit a non-overlapping high-confidence request (`req-d6cdbbf7`).
- Loop 7 iteration 11 (2026-03-13): phase-2 preflight (`loop-requests`, `status`, and `request-history req-e9d91584`) before drafting prevented overlap with an active architect mirror-sync request and kept scope focused on a distinct docs/bootstrap reliability defect.
- Loop 13 iteration 8 (2026-03-13): reviewing loop outcomes first showed three prior architect-loop parity requests completed (req-bc3491c3, req-7ec89473, req-9668b77b), which kept follow-up research scoped to non-overlapping reset-cadence checks rather than re-submitting mirror drift.

- Loop 11 iteration 7 (2026-03-13): reviewing `loop-requests` first showed a 4/4 completed streak (`req-c5dbd414`, `req-cd576590`, `req-6bf0f470`, `req-dd86c6d4`), reinforcing that single-defect telemetry packets with explicit WHAT/WHERE/WHY/EVIDENCE remain the most reliable shape.

- Loop 7 iteration 10 (2026-03-13): reviewing loop-scoped outcomes first (`loop-requests`) plus checkpoint-directed `status`/`check-completion` refresh for `req-7a344cb6` prevented overlap assumptions and kept research aligned to a net-new Master-2 prompt/runtime contradiction.

- Loop 12 iteration 6 (2026-03-13): reviewing loop-scoped outcomes first (`loop-requests`) and then validating master-3 doc parity against `origin/main` avoided a duplicate submission when local template/.claude drift was branch-local while upstream already matched codex10 guidance.
- Loop 13 iteration 6 (2026-03-13): validating architect-loop candidates against origin/main before submission filtered out stale local Step2a/3b/3c drift and surfaced a real role-doc contradiction; the file-anchored parity packet was accepted as req-bc3491c3.

- Loop 10 iteration 5 (2026-03-13): outcome review first (`loop-requests`) confirmed prior submissions `req-07ef293b` and `req-002e6542` completed while `req-2a6156eb` remained decomposed, which prevented lifecycle-overlap and enabled a distinct high-confidence submission (`req-05a42584`).
- Loop 13 iteration 6 (2026-03-13): loop-scoped outcome review showed both prior submissions completed (req-7ec89473, req-9668b77b), reinforcing that tightly scoped architect-loop parity requests with explicit mirror/file anchors continue to complete reliably.
- Loop 9 iteration 4 (2026-03-13): reviewing loop-completed requests (req-d5612788, req-b3206ea6) first, then proving an origin/main app-vs-popout budget telemetry contradiction with explicit spend-overshoot WHY produced accepted request req-1a3bf3dc on first submission.
- Loop 13 iteration 5 (2026-03-13): re-checking `check-completion` plus `history` during active integration avoided stale overlap assumptions (`req-7ec89473` moved from decomposed to integrating and reached `1/1 completed`) before drafting follow-up scope.
- Loop 10 iteration 4 (2026-03-13): loop-scoped outcome review first (`loop-requests`) showed both prior submissions completed (`req-07ef293b`, `req-002e6542`), and then a minimal CLI lifecycle repro before submission produced a new non-overlapping high-confidence candidate without speculative scope drift.
- Loop 11 iteration 3 (2026-03-13): combining official Anthropic usage-schema updates with `origin/main` parser contradictions (`coordinator/src/cli-server.js` and `coordinator/bin/mac10` unsupported-key guards) and explicit correctness/performance risk wording produced accepted request `req-cd576590` in one submission.
- Loop 2 iteration 24 (2026-03-13): status plus active-request history preflight prevented overlap, and an executable routing_budget_state clear-path repro produced a concrete optimization candidate quickly.
- Loop 6 iteration 9 (2026-03-13): outcome review showed three architect-instruction requests from this loop (`req-b762f00a`, `req-75dbc736`, `req-31741e74`) all completed when scoped to one contradiction and one mirror set, reinforcing that narrow WHAT/WHERE doc-sync packets land reliably.
- Loop 4 iteration 22 (2026-03-13): status/check-completion preflight showed req-538c1258 and req-b04b1eeb cleared while req-73cd48c8 and req-fb68a1bd remained active, reinforcing that overlap gating before research prevents duplicate telemetry submissions.
- Loop 5 iteration 14 (2026-03-13): combining checkpoint follow-up (`status` + `check-completion` for `req-b04b1eeb`/`req-538c1258`) with live DB telemetry queries (`merge_queue`, `tasks`, `activity_log`) and local source inspection produced a new non-overlapping allocator/merger throughput request (`req-fbfa15de`) with concrete runtime timestamps.
- Loop 3 iteration 21 (2026-03-13): mandatory outcome review plus checkpoint-directed `status`/`check-completion` and `origin/main` parity checks prevented a stale local-branch resubmission when runtime task-state drift was already fixed upstream.
- Loop 1 iteration 33 (2026-03-13): loop-scoped history remains heavily completed when requests stay single-defect, function-anchored WHAT/WHERE/WHY/EVIDENCE packets with concrete repro evidence before submission.
- Loop 1 iteration 32 (2026-03-13): checkpoint-directed recheck of tracked requests (`req-bd1a59c7`, `req-325844b9`) plus `origin/main` heuristic audit and a minimal Node repro (`Emergency typo fix` => `hasMergeOrConflictSignal=true`) surfaced a new non-overlapping routing-cost defect candidate and produced request `req-c720b0db`.
- Loop 3 iteration 20 (2026-03-13): reviewing loop outcomes first (all loop-3 requests still completed), then pairing checkpoint-directed `status`/`check-completion` with runtime DB/source contradiction checks (`merge_queue` errors + `merger.js` overlap path) isolated a non-overlapping validation root cause and produced accepted request `req-f2ab5d20`.
- Loop 2 iteration 20 (2026-03-13): checkpoint-directed preflight (`status`, `check-completion`, `history`) plus origin/main/source-level repro of the scalar-clear budget path isolated a non-overlapping routing-cost defect and produced accepted request `req-73dd9f4e` in one submission.
- Loop 5 iteration 10 (2026-03-13): outcome review plus checkpoint-guided overlap checks (`status`, `check-completion`, `history`) and an origin/main parity check with a temp-DB repro (`depends_on [999999]` promoted to `ready`) produced accepted allocator correctness request `req-325844b9` on first submission.
- Loop 2 iteration 19 (2026-03-13): checkpoint-directed `status`/`check-completion` preflight plus `origin/main` contradiction validation across `assign-task` and `resolveFallbackRoutingClass` produced accepted request `req-bd1a59c7` for metadata-aware routing quality without overlapping active docs/usage fixes.
- Loop 6 iteration 3 (2026-03-13): loop-outcome review first, then `origin/main` launch-path verification (`scripts/launch-agent.sh` prompt resolution) plus a minimal parser repro isolated an active Architect backlog-drain contradiction without overlapping in-flight request scopes.
- Loop 3 iteration 19 (2026-03-13): starting with loop-scoped outcome review (`loop-requests`) and then checkpoint-targeted `status`/`check-completion` plus activity-log timeline validation prevented a duplicate reopen-regression submission when the only contradiction was local runtime drift versus already-updated `origin/main`.
- Loop 1 iteration 30 (2026-03-13): checkpoint-directed status/check-completion preflight plus origin/main function-extraction repro (and explicit overlap exclusion against active `req-481f0e1d`) produced accepted routing optimization request `req-bd3408f2` on first submission.
- Loop 4 iteration 17 (2026-03-13): after checking pending overlap first (`req-481f0e1d`, `req-b762f00a`), anchoring a new candidate in official OpenAI reasoning-token telemetry docs and `origin/main` parser/schema contradictions produced accepted request `req-a30691ab` without duplicate scope.
- Loop 5 iteration 9 (2026-03-13): checkpoint-guided overlap checks (`status` + `history`/`check-completion`) followed by origin/main parity review and a minimal temp-DB repro isolated a new allocator-scope dependency-ordering defect candidate without overlapping active merge/conflict routing work.
- Loop 2 iteration 18 (2026-03-13): checkpoint-driven `status`/`check-completion` preflight plus `origin/main` parity review against the recently fixed refactor heuristic exposed the analogous merge/conflict description gap and produced accepted request `req-481f0e1d`.
- Loop 6 iteration 2 (2026-03-13): validating origin/main vs local before resubmitting backlog-parser drift with allowlisted WHAT verb "Fix" produced accepted request req-b762f00a.
- Loop 1 iteration 29 (2026-03-13): combining checkpoint-directed status/check-completion preflight with origin/main validation and a minimal router-logic repro produced a concrete, prompt-aligned upscale/downscale defect candidate without duplicating in-flight request ownership work.
- Loop 3 iteration 18 (2026-03-13): validating checkpoint targets first (`status` + `check-completion` for `req-34e37198` and `req-592efca7`), then cross-checking `origin/main` code paths with live `activity_log`/DB state before drafting produced accepted request `req-16e6a189` without duplicating active parser/usage work.
- Loop 5 iteration 8 (2026-03-13): reviewed loop outcomes first, validated allocator behavior on `origin/main` to avoid branch-drift noise, then used an isolated temp-DB repro for claimed-worker assignment to produce accepted request `req-a1856410` in one submission.
- Loop 4 iteration 16 (2026-03-13): running checkpoint-directed `status` + `check-completion` for `req-b0fb73e3`, `req-a0b3fcce`, and `req-592efca7`, then validating `origin/main` ownership/usage parser state before drafting, prevented duplicate submissions while tracked work was still decomposed/integrating.
- Loop 2 iteration 17 (2026-03-13): combining `status` plus `history req-b0fb73e3` before drafting prevented overlap with an already-pending OpenAI usage-compat request and kept research focused on a distinct optimization contradiction.
- Loop 1 iteration 28 (2026-03-13): combining loop-history review (all loop-1 requests completed), checkpoint-directed `status` plus `check-completion req-592efca7`, and a direct routing-logic contradiction check produced accepted request `req-28d293b2` for subject-only refactor routing under-scaling.
- Loop 4 iteration 15 (2026-03-13): reviewing `loop-requests --json` first and then running checkpoint-directed `status` plus `check-completion req-592efca7` exposed partial-failure state (`2/3 completed`) and prevented duplicate ownership submissions while opening space for a distinct parser-compatibility candidate.
- Loop 3 iteration 17 (2026-03-13): reviewing `loop-requests` outcomes first and then running checkpoint-directed `status`/`check-completion` plus event-timeline validation isolated a concrete watchdog state-transition defect and produced accepted request `req-34e37198` without overlapping active prompt/doc requests.
- Loop 5 iteration 7 (2026-03-13): a direct sentinel precheck repro comparing `loop-requests` default output against `loop-requests --json` plus exact mirrored file anchors (`scripts/loop-sentinel.sh` and `.codex/scripts/loop-sentinel.sh`) produced accepted request `req-13228251` on first submit.
- Loop 2 iteration 16 (2026-03-13): loop outcome review plus checkpoint-directed `status`/`check-completion` preflight, followed by `origin/main` contradiction validation, produced accepted optimization request `req-a0b3fcce` for worker usage-instruction telemetry alignment.
- Loop 4 iteration 14 (2026-03-13): checkpoint-directed overlap checks (`status` + `check-completion`) before deeper research confirmed `req-592efca7` was still in progress and prevented ownership-scope duplicate submissions.
- Loop 1 iteration 27 (2026-03-13): executing checkpoint-directed preflight checks for req-c62d6c19, req-fdb3d123, and req-e1c4f76e confirmed all tracked requests were done and avoided unnecessary re-land submissions.
- Loop 3 iteration 16 (2026-03-13): running `loop-requests` outcome review first (all loop-3 requests completed), then checkpoint-directed `status`/`check-completion` and an `origin/main` parity check, prevented a duplicate submission when the only fresh contradictions were already covered by active work or upstream commits.
- Loop 5 iteration 6 (2026-03-13): reviewing loop outcomes plus live `status`/`check-completion` before drafting surfaced active overlap (`req-592efca7` in progress) and avoided resubmitting the same ownership defect scope.
- Loop 4 iteration 13 (2026-03-13): running checkpoint-directed status/check-completion first, validating against `origin/main`, and then using an executable local repro before submission produced accepted request `req-592efca7` without overlap churn.
- Loop 3 iteration 15 (2026-03-12): validating local/runtime findings against `origin/main` before submission filtered out a stale duplicate-mail candidate and surfaced a distinct parser bug with a concrete shell repro, producing accepted request `req-31dab37b`.
- Loop 2 iteration 15 (2026-03-12): re-checking `status` plus targeted `check-completion` (`req-60b3c06b`, `req-f09fb5b9`) before drafting confirmed prior optimization work was fully done and avoided duplicate fallback-budget submissions.
- Loop 1 iteration 26 (2026-03-13): checking status plus request completion first, then validating against origin/main before runtime timeline replay, produced a fresh high-confidence start-task replay hardening submission (`req-c62d6c19`) instead of duplicating already-landed routing-budget fixes.
- Loop 5 iteration 5 (2026-03-12): loop-scoped outcome review shows all prior submissions completed (`req-6d720dd2`, `req-cbf93c49`, `req-6a692107`), reinforcing that allocator-focused single-defect packets with exact file anchors are executing reliably when scoped to one correctness gap.
- Loop 3 iteration 15 (2026-03-12): loop request history shows sustained completion for concise WHAT/WHERE scoped coordinator fixes (`req-908190c1`, `req-3f170ea8`, `req-0699db1c`, `req-84d6f05a`, `req-6cdb51d0`), reinforcing that single-defect, file-anchored descriptions remain the highest-confidence submission shape.
- Loop 3 iteration 14 (2026-03-12): reviewing loop outcomes first (all prior loop-3 requests completed), then proving a parser-contract contradiction between `templates/commands/architect-loop.md` and `coordinator/bin/mac10` with a minimal shell repro, produced a new high-confidence request (`req-fdb3d123`) without overlap churn.
- Loop 5 iteration 4 (2026-03-12): outcome review showed prior loop requests completed (req-6a692107 and req-cbf93c49), and re-validating allocator behavior against origin/main plus runtime logs avoided duplicate overlap while surfacing a new reset-ownership candidate.
- Loop 4 iteration 12 (2026-03-12): re-running status plus check-completion first, validating parser contracts on origin/main, and then submitting a single provider-compat telemetry request produced immediate acceptance as req-e1c4f76e.
- Loop 1 iteration 24 (2026-03-12): combining `status`/`check-completion` preflight with direct runtime DB + `activity_log` timeline validation and then source anchoring (`start-task` state transition) produced a concrete, prompt-aligned credit/quality defect candidate without duplicate fallback-routing churn.
- Loop 2 iteration 14 (2026-03-12): running `status` + targeted `check-completion` first (`req-935a8a59` done, `req-f09fb5b9` still 2/4), then validating against `origin/main` before drafting produced a non-overlapping optimization request (`req-60b3c06b`) instead of duplicating active model_source work.
- Loop 3 iteration 13 (2026-03-12): validating `check-completion` first and then proving current-runtime behavior with a direct `better-sqlite3` mail aggregation query exposed unresolved architect duplicate-notification behavior without speculation.
- Loop 5 iteration 3 (2026-03-12): reviewing loop outcomes first (both prior requests completed), then validating remaining allocator areas against runtime mail evidence and signal-writer paths, produced an accepted single-defect request (`req-6d720dd2`) without overlap churn.
- Loop 4 iteration 11 (2026-03-12): combining prompt-aligned external optimization docs (Anthropic prompt-caching usage schema + OpenAI usage details) with origin/main parser/validator allowlists produced a concrete, file-anchored cross-provider telemetry defect candidate without overlapping active model_source or merger in-flight work.
- Loop 1 iteration 24 (2026-03-12): checking `status` plus `check-completion` for both active (`req-66e2644b`) and recently completed requests (`req-f09fb5b9`) before drafting prevented a duplicate submission while still capturing fresh runtime evidence of completion-integrity drift.
- Loop 2 iteration 13 (2026-03-12): status/check-completion preflight plus origin/main validation filtered out stale local fallback-routing drift and produced a new non-overlapping optimization request (`req-935a8a59`) focused on scalar-budget compatibility in the active fallback router.
- Loop 2 iteration 13 outcome review: loop-scoped history remained 5/5 completed with no failures before submission, reinforcing that one-request iterations with explicit WHAT/WHERE/WHY/EVIDENCE remain the highest-signal pattern.
- Loop 3 iteration 12 (2026-03-12): pairing source-path contradiction checks (`db.createRequest`/`createLoopRequest` mail writes vs `bridgeToHandoff` mail writes) with live inbox evidence (`codex10 inbox architect --peek`) and DB aggregation on `mail` produced a concrete, non-speculative architect triage-control defect candidate.
- Loop 5 iteration 2 (2026-03-12): reviewing loop outcomes first (`req-6a692107` now completed) and then validating candidate defects against `origin/main` prevented stale-branch duplicate submissions before drafting new work.
- Loop 4 iteration 10 (2026-03-12) submission result: a single-defect API telemetry parity packet anchored to explicit source contradictions (schema+db migrations+API handlers) was accepted immediately as req-f09fb5b9.
- Loop 1 iteration 23 (2026-03-12): re-validating `origin/main` after request completion and then confirming behavior with an executable Node repro produced a distinct follow-up submission (`req-66e2644b`) instead of a duplicate re-land request.
- Loop 4 iteration 10 (2026-03-12): running status plus check-completion first and then validating against origin/main avoided duplicate work once req-2f9c8a7d was already ALL DONE.
- Loop 2 iteration 12 (2026-03-12): combining `status`/`check-completion` validation with direct runtime DB evidence (`tasks` routing columns all null) plus source anchors in `coordinator/src/cli-server.js` produced a concrete re-land candidate without overlapping active in-progress tasks.
- Loop 3 iteration 11 (2026-03-12): validating `status` + `check-completion` first, then checking local help-surface contradictions against `origin/main`, prevented a duplicate request when `req-3f170ea8` had already landed the `claim-worker`/`release-worker` usage update upstream.
- Loop 5 iteration 1 (2026-03-12): pairing direct source-path gating review (`coordinator/src/db.js` + `coordinator/src/cli-server.js`) with an executable Node repro of `checkRequestCompletion` produced an immediate accepted request (`req-6a692107`) for failed-task integration hardening.
- Loop 4 iteration 9 (2026-03-12): rechecking `status` + `check-completion` first, then validating candidate gaps against `origin/main` before submission, produced an immediate accepted optimization request (`req-2f9c8a7d`) without duplicating already-landed routing fixes.
- Loop 1 iteration 22 (2026-03-12): combining `loop-requests --json` outcome review with runtime DB/task checks and activity-log timestamps (`request_completed` before `task_started`) produced an immediate accepted re-land request (`req-fb25e990`) for completion-integrity hardening.
- Loop 2 iteration 11 (2026-03-12): validating optimization findings against `origin/main` before drafting avoided stale-worktree false positives while local branch `agent-5-task70` was behind and diverged from landed telemetry code.
- Loop 2 iteration 11 outcome review: loop-scoped request history remains 5/5 completed (`req-a1598713`, `req-d1859a52`, `req-7eec822f`, `req-5acfb25f`, `req-bc997d74`), reinforcing that single-defect WHAT/WHERE/WHY/EVIDENCE packets are still the most reliable acceptance pattern.
- Loop 3 iteration 10 (2026-03-12): pairing live CLI output with source anchors in `coordinator/bin/mac10` (usage printer + implemented command cases) produced a high-confidence, non-speculative request shape for help-surface parity fixes.
- Loop 4 iteration 8 (2026-03-12): re-running `status` plus targeted `check-completion` for checkpointed request IDs before drafting avoided a duplicate submission when `req-3ea46261` remained active (`0/2`) and `req-d0c21d70` showed contradictory completion signals.
- Loop 1 iteration 21: combining status plus check-completion contradiction with timestamped log events and direct merger.js control-flow review produced an immediate accepted request (req-091411bd) for premature completion integrity.
- Loop 3 iteration 9: validating completion with `codex10 status` plus direct mirror diffs before drafting prevented a duplicate submission when `req-0699db1c` had already landed across all master-loop mirrors.
- Loop 2 iteration 10: pairing `status`/`check-completion` with a direct runtime DB read prevented a duplicate submission when `req-d0c21d70` advanced from `2/3 completed` to fully `completed` during the same iteration window.
- Loop 3 iteration 9 outcome review: all recent loop-scoped mirror/clarification prompt fixes (`req-0699db1c`, `req-84d6f05a`, `req-6cdb51d0`) are now `completed`; pairing status validation with narrow parity-focused follow-up scope remains high-signal and avoids duplicate submissions.
- Loop 4 iteration 7: combining current Anthropic/OpenAI optimization guidance (token, cache, and spend monitoring) with direct repo contradictions (`complete-task` has no usage payload path and schema has no token/cost persistence) produced an accepted request on first submit (`req-3ea46261`).
- Loop 4 iteration 7 outcome review: `req-cd016d2a` and `req-8c2aa344` were still completed while `req-d0c21d70` remained decomposed; running `status` plus targeted `check-completion` first prevented duplicate submissions.
- Loop 3 iteration 8: reviewing prior loop outcomes (`req-84d6f05a`, `req-6cdb51d0`) before re-validation of current source/template state, then submitting a single imperative re-land request with fallback-path evidence, produced immediate acceptance (`req-0699db1c`).
- Loop 1 iteration 20: pairing `status`/`check-completion` with immediate source and runtime DB re-validation yielded another accepted high-confidence re-land request (`req-e67c85ee`) when completed metadata contradicted active code.
- Loop 2 iteration 9: outcome review still showed 4/4 loop-scoped requests completed with no failures, and a fresh imperative WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE packet focused on active fallback routing-control no-ops was accepted immediately as `req-bc997d74`.
- Loop 4 iteration 6: re-framing the dashboard telemetry gap with a concrete production failure path (blind budget/routing triage -> overspend and throughput stalls) cleared prior quality-gate suppression and created `req-d0c21d70`.
- Checking `codex10 status` plus targeted `check-completion` before drafting kept this iteration non-duplicative (`req-a304e336` still decomposed on task `#9`, `req-5acfb25f` complete), then allowed a new, non-overlapping request.
- Iteration 19 review for loop 1 shows the same pattern still holds: optimization requests with single-defect scope and explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE continue to flow to `completed` status quickly in history.
- Running targeted `check-completion` for prior-checkpoint request IDs before deeper source validation (`req-a304e336`, `req-5acfb25f`) is a fast way to decide whether to hold or draft a new submission.
- Loop 2 iteration 8 outcome review: all four loop-scoped routing optimization requests (`req-a1598713`, `req-d1859a52`, `req-7eec822f`, `req-5acfb25f`) are marked `completed`; single-defect WHAT/WHERE/WHY/EVIDENCE packets remain high-yield for acceptance/completion flow.
- Iteration 19 outcome review shows loop-3 mirror-drift requests `req-6cdb51d0` and `req-84d6f05a` both reached `completed`; tight WHAT/WHERE parity scope with bootstrap/runtime-path evidence remains a reliable acceptance pattern.
- Iteration 19 outcome review (loop 4 history) shows both submissions completed (`req-cd016d2a`, `req-8c2aa344`) when requests stayed concrete about active-path router contradictions and explicitly asked for regression coverage in the same scope.
- Iteration 18 confirms that checking live `codex10 status` plus `check-completion` before drafting a new optimization request prevents duplicate submissions while dependent decomposed work is still running (`req-a304e336` task `#9`, `req-5acfb25f` task `#17`).
- Loop 2 iteration 7 confirmed the imperative re-land pattern still clears quality gate after prior suppression: a single-defect routing-telemetry persistence request with explicit `Fix` WHAT + runtime DB contradiction evidence was accepted immediately as `req-5acfb25f`.
- When merge-integrity hardening (`req-a304e336` task `#9`) is still in progress, deferring new re-land submissions avoids low-signal duplicates and preserves request quality.
- Clarification-path drift submissions pass when WHAT starts with an imperative verb and evidence ties prompt-line contradictions to runtime mailbox transport plus missing queue file (`req-84d6f05a` accepted on first submit).
- Even with prior completion drift, tightly scoped re-land submissions with exact stale-source contradictions and explicit optimization impact still pass triage quickly (latest: `req-deb22873` reached T2 task creation within minutes).
- Loop 2 outcome review (iteration_count 5 -> 6) shows all three most recent routing optimization requests completed (`req-a1598713`, `req-d1859a52`, `req-7eec822f`) when descriptions stayed single-defect, file-specific, and included runtime DB evidence plus regression-test asks.
- Running `./.codex/scripts/codex10 status` before submission surfaces decomposed requests with active `in_progress` tasks, which helps avoid low-signal duplicate loop requests.
- Post-completion divergence can still pass quality gate when framed as a re-landing request with exact stale-line evidence plus active-path proof; loop 16 created `req-deb22873` immediately.
- Loop 16 outcome review confirms optimization requests that isolate a single config/read-site contradiction with explicit credit impact continue to complete quickly (`req-b1107c73`).
- A high-confidence optimization request was accepted immediately when evidence chained schema/code contradiction, executable local repro, and live runtime DB mismatch in one packet (`req-7eec822f`).
- Loop 3 history shows `req-6cdb51d0` completed with strict mirror-drift scope, reinforcing that parity-focused prompt/doc sync requests with concrete bootstrap reseed impact remain execution-worthy.
- Completed request `req-6cdb51d0` indicates mirror-drift fixes succeed when phrased as strict source-of-truth parity updates across runtime/template docs with explicit bootstrap reseed risk.
- Mirror-drift requests grounded in direct file diffs plus bootstrap-path evidence (who copies the stale file and when) clear loop-request gating with high confidence.
- Verifying completed loop-request outcomes directly in live source/tests before follow-up submissions prevents false closure and yields stronger evidence packets.
- Request descriptions with explicit `WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE`, concrete file paths, and production-impact wording passed loop request quality gating on first attempt.
- Completed request `req-e96f96a9` confirms that tightly scoped budget-aware routing changes in `coordinator/src` can be accepted and executed when production credit impact is explicit.
- Completed request `req-3039ba5e` reinforces that imperative WHAT wording ("fix/use/update") plus explicit low-credit failure risk maps well to accepted optimization work.
- Completed request `req-8c9bd82e` shows that pairing schema/code contradictions with runtime DB evidence is accepted quickly by loop-request validation.
- Request `req-16bdcac3` was accepted immediately when evidence combined static code contradiction (`configuredModel === defaultModel` branch labels) with live DB telemetry snapshots, indicating this evidence format passes quality gating well for routing/credit fixes.
- Request status metadata (`completed`) consistently returns quickly for optimization requests, so keeping descriptions narrowly scoped to one router defect still clears orchestration quickly.
- Loop requests with explicit local runtime repro steps/results (for example constrained `routing_budget_state` plus observed `assign-task` routing payload) continue to pass quality gating when tied to production credit-risk language.
- Combining external optimization guidance (model-tier cost tuning from official Claude/OpenAI docs) with local code contradictions still passes `loop-request` quality gating; request `req-cd016d2a` was accepted immediately.
- Combining static code-path contradiction with live DB telemetry counts in the same request (`tasks` routing columns all null while `activity_log` carries routing fields) passed quality gate and created `req-d1859a52` immediately.
- Requests that identify write-only config keys with exact read/write-site evidence continue to pass quality gating; request `req-b1107c73` (model_codex_spark alias no-op) was accepted immediately.
- Pulling loop history with `loop-requests --json` (instead of truncated table output) preserves full WHAT/WHERE/WHY/EVIDENCE text and improves pattern extraction quality for next submissions.
- Loop 4 request `req-cd016d2a` reached `completed`, reinforcing that optimization requests framed as a concrete config no-op plus production credit impact can move through execution, not just quality gate acceptance.
- Bundling unresolved optimization contradictions (inverted telemetry + write-only reasoning/model knobs) with exact file/line evidence and explicit regression-test scope still passes quality gating; this iteration created `req-8c2aa344`.

## Failed Patterns
- Loop 2 iteration 14 (2026-03-16): request `req-1c0d8c67` remained `failed` from unresolved merge conflicts even though `check-completion` reported `1/1 completed`; request-level status must still be validated against merge state before assuming allocator remediation is closed.
- Loop 4 iteration 1 (2026-03-16): loop-request was quality-gate suppressed for missing concrete WHERE file-path signal; include plain standalone paths in WHERE (no markdown-wrapped path formatting) before resubmitting.
- Loop 21 iteration 11 (2026-03-13): A watchdog-recovery request was suppressed by `loop-request` quality gate (`missing concrete file path signal (WHERE)`) even though WHERE used markdown-wrapped paths; avoid backtick/label-heavy WHERE formatting and prefer plain path tokens like coordinator/src/watchdog.js in future submissions.
- Loop 17 iteration 13 (2026-03-13): direct `mac10` lifecycle checks failed when coordinator daemon was down (`Error: Coordinator not running`); use `./.codex/scripts/codex10` wrappers for loop-state validation in sentinel iterations to avoid wasted pre-submit cycles.
- Loop 16 iteration 1 (2026-03-13): loop status can flip to stopped mid-iteration; a pre-submit `./.codex/scripts/codex10 loop-heartbeat <loop_id>` returned `Loop stopped` (exit 2), so this iteration produced no submission and checkpointed candidate evidence instead of retrying.
- Loop 7 iteration 11 (2026-03-13): loop-request submission for incremental-rescan reports-directory hardening returned `Loop is stopped, not active`; when status flips mid-iteration, checkpoint evidence and avoid same-iteration retry.
- Loop 7 iteration 11 review (2026-03-13): prior failed request `req-7a344cb6` remains incomplete (`check-completion` 2/3 completed), so follow-up requests should not assume the dynamic rate-limit retry fix has landed.
- Loop 13 iteration 8 (2026-03-13): submission attempted after research but loop-request returned Loop is stopped, not active; add a just-before-submit heartbeat/state check to avoid spending the single submission attempt on a stopped loop.

- Loop 7 iteration 10 (2026-03-13): `loop-request` was suppressed by quality_gate (`missing production impact/risk signal (WHY)`) despite solid WHAT/WHERE/EVIDENCE, so future submissions must state immediate throughput/latency or correctness impact in explicit production-risk language.
- Loop 12 iteration 6 (2026-03-13): no loop-scoped failed requests were present (`req-0baabb72`, `req-9802198b`, `req-0c50ff41`, and `req-8f60e568` all completed), so avoid inferring new failure patterns from unrelated global failed requests in `status`.
- Loop 9 iteration 4 (2026-03-13): local-runtime-only model_source inversion looked actionable, but origin/main parity check showed the fix and regression tests already landed; validate upstream before drafting to avoid stale-branch duplicates.
- Loop 13 iteration 5 (2026-03-13): `loop-request` can be suppressed by cooldown even for high-confidence non-overlapping mirror-drift packets (`retry_after=48s`); checkpoint and defer without same-iteration retry.
- Loop 11 iteration 3 (2026-03-13) outcome review: this loop still has no completed/failed requests to learn from (`req-c5dbd414`/`req-b3206ea6` showed integrating in status while `check-completion` already reported ALL DONE), so rely on direct `check-completion` before assuming closure.
- Loop 2 iteration 24 (2026-03-13): loop-request submission can fail with Loop is stopped, not active even after an active start-of-iteration check; re-check loop status immediately before submission.
- Loop 2 outcome review (2026-03-13): req-a0b3fcce failed through repeated functional_conflict merges because overlap validation invoked npm run build in a repo without a build script.
- Loop 4 iteration 22 (2026-03-13): a high-confidence loop-request submission was blocked because loop 4 transitioned to `stopped` mid-iteration (`loop-request` returned "Loop is stopped, not active"); when this happens, checkpoint the candidate and defer resubmission to the next active window.
- Loop 4 iteration 22 (2026-03-13): req-a0b3fcce remained marked failed due integration merge steps invoking `npm run build` where coordinator has no build script, so future requests should explicitly avoid build-gated verification assumptions.
- Loop 3 iteration 21 (2026-03-13): treating local runtime branch state as authoritative without `origin/main` parity can produce false positives (for example a suspected start-task replay regression already fixed upstream), so always confirm upstream before filing.
- Loop 1 iteration 33 review: checkpointed failure req-a0b3fcce (status failed; remediation still incomplete in status timeline) indicates resubmissions should be blocked until status/check-completion plus source contradiction proof confirms unresolved behavior.
- Loop 1 iteration 32 (2026-03-13): carrying forward prior-checkpoint failure labels without a fresh status/completion refresh is unreliable (`req-592efca7` moved from failed in prior checkpoint context to integrating in current status), so always refresh before drafting overlap assumptions.
- Loop 3 iteration 20 (2026-03-13): loop-scoped request history may show all-completed while global status still carries legacy failed requests with active remediation tasks (`req-a0b3fcce`, `req-592efca7`), so treat request-level `failed` as non-authoritative and require task/merge evidence before drafting follow-up scope.
- Loop 2 iteration 20 (2026-03-13) outcome review: request-level `failed` remains non-authoritative while remediation progresses (`req-a0b3fcce` now `4/6 completed`, `req-592efca7` `3/4 completed`), so always pair `status` with targeted `check-completion` before treating failures as closed.
- Loop 2 iteration 19 (2026-03-13) outcome review: request health remains non-authoritative from `status` alone (`req-a0b3fcce` still shows `failed` while `check-completion` reports `3/4 completed`), so keep pairing status with completion checks before filing remediation follow-ups.
- Loop 6 iteration 3 (2026-03-13): passing loop-request descriptions with unescaped shell metacharacters/backticks in a single quoted command can execute fragments locally and trigger cooldown suppression; submit via safe quoting (stdin/file payload) instead.
- Loop 1 iteration 30 (2026-03-13): check-completion snapshots can change mid-iteration (`req-a0b3fcce` moved from `2/3` to `ALL DONE` minutes later) while `status` still reports `failed`; avoid treating a single completion read as stable without a refresh before submission/checkpoint.
- Loop 4 iteration 17 (2026-03-13) outcome review: `status` alone is non-authoritative for remediation health (`req-a0b3fcce` and `req-592efca7` both show `failed` while `check-completion` reports `2/3 completed`), so do not treat failed status as closure without task/completion checks.
- Loop 5 iteration 9 (2026-03-13): `loop-request` submission for missing `depends_on` gating was suppressed by cooldown (`retry_after=59s`); checkpoint and defer without same-iteration retry.
- Loop 2 iteration 18 (2026-03-13) outcome review: request-level status can remain `failed` while remediation progresses (`req-a0b3fcce` shows `failed` in status but `check-completion` reports `2/3 completed`), so always pair status with `check-completion` before resubmitting.
- Loop 1 iteration 29 (2026-03-13): loop-request submission for description-only merge/conflict routing misclassification was suppressed by cooldown (retry_after=79s); checkpoint and defer without same-iteration retry.
- Loop 3 iteration 18 (2026-03-13) outcome review: `req-592efca7` remains failed because watchdog marked terminal failure before remediation-task execution began, so request-level status can remain stale/failure-coded during active retries unless explicit reopen logic exists.
- Loop 6 iteration 1 (2026-03-12): a request starting WHAT with "Sync ..." was quality-gate suppressed as `missing concrete change verb (WHAT)`; start WHAT with allowlisted imperative verbs like `Fix/Update/Add/Remove` to avoid same-class rejection.
- Loop 2 iteration 17 (2026-03-13): `loop-request` can still be suppressed by short cooldown (`retry_after=34s`) even for non-overlapping, high-confidence optimization defects; checkpoint and defer without same-iteration retries.
- Loop 4 iteration 15 (2026-03-13): failed request `req-592efca7` shows merge/remediation tasks can fail on environment assumptions (`npm run build` missing in coordinator/package.json), so resubmission planning must explicitly avoid build-script expectations in this repo.
- Loop 4 iteration 14 (2026-03-13): a high-confidence OpenAI usage compatibility request was suppressed by `rate_limit retry_after=3600s`; when this cooldown appears, checkpoint the exact candidate and defer without same-iteration retries.
- Loop 5 iteration 6 (2026-03-13): reset-worker hardening submission was `quality_gate`-suppressed for `missing concrete file path signal (WHERE)` despite file paths inside punctuation/code formatting; include at least one plain-text path token like coordinator/src/cli-server.js in the body to satisfy `LOOP_REQUEST_FILE_SIGNAL_RE`.
- Loop 5 iteration 5 (2026-03-12): reset-worker ownership hardening request was suppressed again for WHY despite concrete outage mechanics; `coordinator/src/db.js` quality gate uses `LOOP_REQUEST_WHY_SIGNAL_RE`, so WHY must include explicit terms like `failure` or `integrity risk` to pass.
- Loop 2 iteration 15 (2026-03-12): a worker-instruction telemetry request was `quality_gate`-suppressed for `missing production impact/risk signal (WHY)`; doc/protocol defects still need explicit outage language (for example missing usage payloads causing blind spend/cache triage and wrong routing-cost decisions).
- Loop 5 iteration 5 (2026-03-12): previous iteration suppression (`quality_gate: missing production impact/risk signal (WHY)`) confirms allocator submissions must describe the concrete outage path (active assignment reset to idle, task execution interruption), not just state contract mismatch.
- Loop 3 iteration 14 (2026-03-12): including literal `$(...)` fragments inside a double-quoted `loop-request` shell argument triggered command substitution, which mangled stored evidence text; avoid unescaped `$()` in inline submissions.
- Loop 5 iteration 4 (2026-03-12): allocator reset-ownership submission was `quality_gate`-suppressed (`missing production impact/risk signal (WHY)`); even with strong code/runtime evidence, WHY must explicitly state concrete production failure risk (for example stale sentinel clearing an active assignment and stalling task execution).
- Loop 1 iteration 24 (2026-03-12): high-confidence request submission for start-task replay hardening was suppressed by `rate_limit retry_after=3600s`; when long cooldown fires, checkpoint evidence and defer instead of reword/retry in the same iteration.
- Loop 3 iteration 13 (2026-03-12): a loop request can be suppressed (`quality_gate`) even with strong evidence when the WHY sentence lacks explicit production-risk phrasing expected by `LOOP_REQUEST_WHY_SIGNAL_RE`; include concrete outage/churn/risk keywords.
- Loop 4 iteration 11 (2026-03-12): loop-request submission for Anthropic usage-key alias support was suppressed by `rate_limit retry_after=3600s`; when this long cooldown appears, checkpoint the exact candidate and defer to a later iteration instead of retrying/rewording.
- Loop 3 iteration 12 (2026-03-12): backticks inside the quoted `loop-request` shell payload still triggered command substitution and mangled the stored request body (`req-908190c1`); keep submissions plain-text without backticks/inline command markers.
- Loop 1 iteration 23 (2026-03-12): unescaped backticks in a `loop-request` shell argument still trigger command substitution and can strip source evidence text; avoid backticks in inline submissions.
- Loop 2 iteration 12 (2026-03-12): `loop-request` still failed quality gate when WHAT started with `Re-land ...` (`missing concrete change verb (WHAT)`), even with strong runtime/source evidence and explicit WHY; for this queue, start WHAT with `Fix/Add/Update/Persist`.
- `completed` metadata can still be stale even right after a "fix" request closes: on 2026-03-12, `req-091411bd` is marked completed but active `coordinator/src/merger.js` still lacks task-level completion gating and runtime emitted premature `request_completed` for `req-3ea46261` while task `#24` remained unfinished.
- Loop 2 iteration 11 (2026-03-12): a usage-telemetry worker-guidance submission was `quality_gate`-suppressed with `missing production impact/risk signal (WHY)`; WHY must explicitly state an immediate operational failure mode, not just observability parity.
- Treating `status` request rows as authoritative still fails: on 2026-03-12 iteration 8, `req-d0c21d70` displayed `[completed]` in status while `check-completion` reported `2/3` and task `#20` remained `in_progress`.
- Loop 3 iteration 9: a help-text discoverability submission was quality-gate suppressed with `missing concrete file path signal (WHERE)`; future WHERE fields should anchor exact file + section/function targets, not just a top-level file path.
- Request-level status=completed is non-authoritative when merges are finishing: req-d0c21d70 showed completed while check-completion stayed 2/3 and task #20 remained assigned, so always cross-check task completion before treating completion as final.
- Drafting from a single `status` snapshot is unreliable during active merges/tasks; this iteration observed `req-d0c21d70` as partially complete and then fully complete minutes later, so one-pass checks can create duplicate low-signal requests.
- Prompt-sync completion metadata can still be non-authoritative: after `req-84d6f05a` reached `completed`, `templates/commands/master-loop.md` still retained legacy clarification-queue wording, so re-verify all mirrors before assuming closure.
- Even after `req-a304e336` moved to `completed` on 2026-03-12, source still keeps inserted-path duplicate PR ownership as non-blocking (`merge_queue_duplicate_pr_ownership_preserved` then `queued:true`), so completion metadata alone is not closure for merge-integrity defects.
- Prior checkpoint statement "req-a304e336 still decomposed/in progress" is now stale after recheck on 2026-03-12; always re-run `status`/`check-completion` before carrying forward blocker assumptions.
- Loop 3 iteration 7 on 2026-03-12: a submission starting WHAT with "Re-land Master-1 clarification guidance parity..." was quality-gate suppressed (`missing concrete change verb (WHAT)`); even parity re-land requests must start with imperative verbs like `Fix/Update`.
- Treat `completed` as non-authoritative while merge-integrity hardening remains active (`req-a304e336` task `#9`): re-land optimization requests are likely to churn without proving landed source changes.
- Cooldown suppression remains active even after no new in-flight loop-2 requests: on 2026-03-12 iteration 8, a high-confidence fallback-routing control request was suppressed with `retry_after=70s`; checkpoint and retry in a later iteration without same-iteration resubmission.
- Dashboard-focused optimization submissions can still be `quality_gate`-suppressed for "missing production impact/risk signal (WHY)" even when credit-overspend language is included; next attempt should anchor risk to a concrete operational failure path (for example wrong triage/action decisions caused by missing budget/routing state in the only UI surface operators use).
- Request lifecycle can still end in `completed` after duplicate PR reuse on the re-land path (latest: `req-deb22873` reused merged PR `#57`), so completion metadata remains non-authoritative until merge-ownership hardening lands.
- Quality gate on 2026-03-12 rejected WHAT starting with "Re-land" as non-concrete ("missing concrete change verb"); use leading verbs like "Fix/Add/Update/Persist" even for re-landing requests.
- `loop-request` quality gate can suppress high-evidence submissions when WHAT lacks a leading imperative verb (latest on 2026-03-12: "missing concrete change verb (WHAT)"); start WHAT with explicit actions like "Fix/Update/Replace/Add".
- Avoid resubmitting while adjacent integrity work is already active: with `req-a304e336` still decomposed and task `#9` in progress, duplicate completion-integrity submissions are likely low-signal duplicates.
- Documentation-drift requests can be `quality_gate`-suppressed when WHY is framed as operational ambiguity; include explicit production-risk wording tied to failed/blocked clarification delivery paths to pass gating.
- `loop-request` cooldown suppression can still occur after prior request completion (latest observed `retry_after=71s` on loop 2); checkpoint the candidate and retry in a later iteration only.
- A request can still be `quality_gate`-suppressed when WHY is framed as observability/optimization only; include an explicit production failure mode (e.g., incorrect routing, stalled completion, or credit overspend risk) in WHY.
- Even with detailed evidence, loop quality gate can suppress if WHAT is not phrased as explicit imperative changes (for example, "add/extend/persist") and WHY does not explicitly state operational risk language.
- Loop submissions can be suppressed by cooldown (`retry_after`) even when request quality is high; do not retry in the same iteration.
- `completed` request status is not sufficient proof that optimization code landed; re-verify source + tests before assuming routing fixes are present.
- Cooldown suppression can recur across consecutive iterations; keep the pending candidate in checkpoint `NEXT` instead of rewording/resubmitting immediately in-loop.
- Loop request cooldowns can still trigger even after prior request completion (latest observed `retry_after=46s`), so treat suppressed submissions as iteration output and advance checkpoint state without retries.
- "Completed" optimization requests may still leave fallback routing logic unchanged in source; treat completion metadata as orchestration status only and always validate landing in `coordinator/src/cli-server.js` plus tests.
- Merge ownership collisions can silently masquerade as success: `queueMergeWithRecovery` may log duplicate PR ownership but still enqueue/merge a previously merged PR for a different request, producing false `completed` status without new code landing.
- Submitting `loop-request` via shell with backticks in the quoted description can trigger command substitution and silently strip key identifiers (e.g., config keys/commands); escape backticks or omit them in inline shell submissions.
- Cooldown suppression can trigger even for high-confidence, non-duplicate requests with very short windows (latest observed `retry_after=6s`); do not retry in the same iteration.
- Even with mailbox-vs-file contradiction evidence, quality gate may still suppress unless WHY explicitly states immediate production risk language (for example "architect blocked on clarification reply causing pending-request stall"), not just "operational correctness."
- Cooldown suppression remains frequent even after multiple completions in the same loop; latest observed during this iteration was `retry_after=39s`.
- Cooldown suppression still applies to high-confidence merge-integrity requests; latest observed on 2026-03-12 was `retry_after=84s`, so checkpoint and retry in a later iteration without rewording in-loop.

## Codebase Gaps
- Fresh stopped-loop checkpoint mutation gap (loop 4 iteration 12, 2026-03-16): `coordinator/src/cli-server.js` `loop-checkpoint` still updates `last_checkpoint` and increments `iteration_count` without checking loop status. Live repro: `loop` -> `stop-loop` -> `loop-checkpoint` returns `Checkpoint saved (iteration 1)` and `loop-prompt` shows `status: "stopped"` with mutated checkpoint/iteration fields. Submitted `req-29cca40f`.
- Fresh merge-queue PR-identity dedupe gap (2026-03-16, loop 2 iteration 14): `coordinator/src/cli-server.js` integrate + `queueMergeWithRecovery` iterates all completed tasks and `coordinator/src/db.js` `enqueueMerge` deduplicates only by `request_id/task_id`, so repeated fix tasks for the same PR/branch create duplicate pending rows. Runtime evidence: request `req-64dd6533` currently has three pending rows for identical `pull/54|agent-1` (merge ids 31/32/33), and merger repeatedly retries the same PR with duplicate `merge_failed` churn. Submitted `req-e252166f`.
- Fresh Master-2 role-doc drift (loop 4 iteration 2, 2026-03-16): .codex/docs/master-2-role.md and templates/docs/master-2-role.md still omit Tier-2 triage transition and still instruct Tier-3 touch .codex/signals/.codex10.task-signal, while loop-prompt architect instructions require codex10 triage for Tier 2 and explicitly deprecate file/signal handoff writes.
- Fresh verified allocator claim-bypass gap (loop 2 iteration 4, 2026-03-16): `coordinator/src/cli-server.js` `assign-task` still allows assignment when `workers.claimed_by` is set and then clears the claim. Isolated temp-DB repro: claim worker 1 as architect, then CLI `assign-task` returns `{ok:true}` and post-state flips `claimed_by` from `architect` to `null` with task/worker both `assigned`, enabling Tier-3 to race through Tier-2 reservations.
- Fresh decomposed-lifecycle liveness gap (2026-03-16, loop 2 iteration 3): live runtime request `req-5cf58afb` remains `decomposed` with zero tasks (`check-completion` reports `0/0`, direct DB query confirms `tasks.total=0`). `coordinator/src/cli-server.js` sets tier-3 requests to `decomposed` before task creation, `coordinator/src/db.js` `checkRequestCompletion` requires `total > 0` for `all_done`, and `coordinator/src/watchdog.js` has no stale-decomposed recovery path (only integrating recovery), allowing indefinite request stalls. Submitted `req-315afdcf`.
- Fresh allocator dependency-integrity gap (2026-03-13, loop 21 iteration 14): `coordinator/src/db.js` `checkAndPromoteTasks` promotes pending tasks when `depends_on` references missing task IDs because it only counts existing unfinished dependencies (`SELECT COUNT(*) ... id IN (...) AND status != 'completed'`) and treats zero rows as satisfied. Isolated repro on current code: pending task with `depends_on [999999]` transitions to `ready` immediately after `checkAndPromoteTasks`, allowing allocator dispatch out of dependency order. Submitted `req-ab8d975a`.
- Loop 21 iteration 11 (2026-03-13): Runtime still shows a decomposed-zero-task deadlock candidate (`req-f33aa5e5` is `decomposed` while `check-completion` returns `0/0`), and source still sets decomposed before task creation (`coordinator/src/cli-server.js` triage) with no stale-decomposed watchdog repair path (`coordinator/src/watchdog.js` only recovers integrating requests).
- Fresh origin/main telemetry-quality gap (2026-03-13, loop 17 iteration 13): `gui/public/app.js` and `gui/public/popout.js` compute `cache-hit` as `cached_tokens / input_tokens` with no provider semantic guard. `coordinator/src/cli-server.js` normalizes Anthropic `cache_read_input_tokens -> cached_tokens` while preserving `input_tokens`; Anthropic prompt-caching docs show cache-read can dwarf input (`input_tokens=21`, `cache_read_input_tokens=188086`), so current UI can render impossible cache-hit values (>100%, e.g. ~895,648%), distorting cost/efficiency triage. Submitted `req-ed041c12`.
- Loop 17 iteration 12 (2026-03-13): merge throughput risk remains active while `req-f33aa5e5` is still decomposed; status continues to show repeated `functional_conflict: npm run build` failures and deep pending merge backlog, so overlap-validation script fallback is still a quality/cost bottleneck.
- Fresh active-worktree routing regression (2026-03-13, loop 17 iteration 3): fallback routing in `coordinator/src/cli-server.js` is missing budget-aware effective-class logic and metadata-heavy complexity signals while `coordinator/src/model-router.js` is absent, so the fallback path is always used. Isolated repros show constrained budget (`remaining=0`, `threshold=10`) still routes merge/conflict tasks to `mid`/flagship and code-heavy metadata tasks with neutral text route to `spark`; origin/main contains the missing helpers (`hasCodeHeavyMetadataSignals`, `parseBudgetScalarFallback`, `resolveFallbackEffectiveClass`).
- Fresh loop lifecycle integrity gap (2026-03-13, loop 18 iteration 2): `coordinator/src/cli-server.js` `loop-checkpoint` still lacks `status === 'active'` gating and mutates stopped loops. Runtime repro: `./.codex/scripts/codex10 loop "tmp loop lifecycle repro"` -> `stop-loop` -> `loop-checkpoint ...` returns `Checkpoint saved (iteration 1)`; `loop-prompt` then reports `status: "stopped"` with updated `last_checkpoint` and `iteration_count`.
- Fresh origin/main optimization observability gap (2026-03-13, loop 16 iteration 1): `coordinator/bin/mac10` `parseCompleteTaskUsage` and `coordinator/src/cli-server.js` `normalizeCompleteTaskUsagePayload` map cached/reasoning/prediction detail fields but still drop OpenAI audio detail fields (`input_tokens_details.audio_tokens`, `prompt_tokens_details.audio_tokens`, `completion_tokens_details.audio_tokens`, `output_tokens_details.audio_tokens`). `coordinator/src/schema.sql` has no `usage_audio_*` columns, so multimodal token-cost telemetry is silently lost and performance/cost measurements are undercounted.
- Fresh verified staleness-flow reliability gap (loop 7 iteration 11, 2026-03-13): Master-2 staleness instructions write the incremental review queue to `.codex/state/reports/master2-incremental-scan-files.txt` without creating `.codex/state/reports`, and `setup.sh` creates `.codex/state` but not the `reports` subdirectory. Runtime repro in this workspace: the exact documented redirect command fails with `No such file or directory` and `exit_code=1`. `origin/main` mirrors the same issue in `templates/docs/master-2-role.md` via `.claude/state/reports/...` while `setup.sh` only creates `$CLAUDE_DIR/state`.
- Fresh Master-2 reset-cadence docs contradiction (loop 13 iteration 8, 2026-03-13): .codex/docs/master-2-role.md and templates/docs/master-2-role.md staleness procedure writes .codex/state/reports/master2-incremental-scan-files.txt without ensuring parent directory exists. Workspace repro: .codex/state has no reports/ directory, and running the documented redirect command returns No such file or directory with exit=1.

- Fresh Master-2 staleness-flow contradiction (loop 7 iteration 10, 2026-03-13): `.codex/commands-codex10/architect-loop.md` Step 5 writes `.codex/state/reports/master2-incremental-scan-files.txt` without ensuring `.codex/state/reports` exists. Runtime repro in this workspace: the exact command fails with `No such file or directory` (exit 1), which can break incremental-rescan execution and skip stale-context mitigation.

- Fresh origin/main architect guidance parity gap (2026-03-13, loop 13 iteration 6): .claude/docs/master-2-role.md backlog and Tier 2 snippets still lag .claude/commands/architect-loop.md. Docs use grep-based pending extraction (lines 40-42) and assign-task placeholder flow without captured task_id (lines 90-91), while command canon uses request_rows plus anchored status parsing and explicit task_id capture before assignment (lines 122-126, 189-199), risking wrong oldest-pending selection and brittle Tier 2 dispatch on fresh starts.
- Fresh loop-request dedup-ordering correctness gap on 2026-03-13 iteration 5 (loop 10): `coordinator/src/db.js` `createLoopRequest` evaluates cooldown/rate-limit before exact/similar active duplicate checks, so immediate duplicate submissions are returned as cooldown suppression instead of deduplication. Isolated temp-DB repro with `loop_request_quality_gate=false`: first call created `req-01cdc284`; second identical call returned `{suppressed:true, deduplicated:false, reason:'cooldown', retry_after_sec:600}`. Submitted `req-05a42584`.
- Loop 9 iteration 4 (2026-03-13): origin/main /api/status and websocket payloads already include routing_budget_state/routing_budget_source and dashboard app.js renders constrained/healthy budget summaries, but gui/public/popout.js still lacks budget-state parsing/rendering, hiding budget pressure for popout-first operators.
- Remaining architect-loop mirror drift beyond active Step 1/Step 6 sync: `templates/commands/architect-loop.md` and `.claude/commands/architect-loop.md` still diverge from `.codex/commands/architect-loop.md` in backlog parsing (`grep '\[pending\]'` vs exact-column awk), Tier 2 task-id capture (`assign-task <task_id>` placeholder), and Tier 3 queue/handoff-file flow instead of coordinator-native `codex10` task creation/triage commands.
- Fresh loop lifecycle integrity gap on 2026-03-13 iteration 4 (loop 10): `coordinator/src/cli-server.js` `loop-checkpoint` allows checkpoint writes and iteration increments for stopped loops (no `status === active` guard), and `loop-heartbeat` updates `last_heartbeat` before returning stopped/paused status. Runtime repro: create loop `#15`, `stop-loop 15`, then `loop-checkpoint 15 "stopped-loop checkpoint repro"` returns `Checkpoint saved (iteration 1)` while `loop-prompt 15` still reports `status: "stopped"` with updated checkpoint/iteration. This can corrupt loop lifecycle telemetry and restart/control stability. Submitted `req-2a6156eb`.
- Fresh `origin/main` optimization compatibility gap (2026-03-13, loop 11 iteration 3): usage parsers in `coordinator/src/cli-server.js` and `coordinator/bin/mac10` still reject `usage.cache_creation` nested objects as unsupported keys. Anthropic usage docs now expose cache-creation token detail objects (including ephemeral 1h fields), so forwarded raw payloads can fail `complete-task`/`fail-task`, causing task-completion failure and dropping cache telemetry for optimization. Submitted `req-cd576590`.
- Fresh origin/main optimization gap on 2026-03-13 iteration 24 (loop 2): clearing routing_budget_state with blank or unparseable set-config input leaves mirrored scalar budget keys stale, and fallbackModelRouter then reuses those stale scalar values for budget downscale/upscale decisions.
- Fresh architect-doc parity gap (2026-03-13, loop 6 iteration 9): `.claude/docs/master-2-role.md` still diverges from codex10 canon (`templates/docs/master-2-role.md` and `.codex/docs/master-2-role.md`). Evidence from `diff -u` shows stale raw `mac10` command guidance, missing operational counters/Tier3 signal-wait sections, and legacy `grep '\[pending\]'` backlog parsing. This can misdirect Master-2 behavior after fresh-start doc reads and degrade backlog-drain correctness.
- Fresh coordinator throughput correctness gap (2026-03-13, loop 4 iteration 22): `coordinator/src/db.js` `createLoopRequest` returns `reason: rate_limit` with a fixed `retry_after_sec: 3600` whenever `loop_request_max_per_hour` is hit, instead of computing seconds until the oldest in-window request exits the 1-hour window. Runtime evidence from `.codex/state/codex10.db`: loop-4 checkpoints at `2026-03-12 23:46:17` and `2026-03-13 00:20:47` reported `rate_limit retry_after=3600s`, while the oldest qualifying requests were `22:52:23` and `23:22:02`, implying expected retries of ~366s and ~76s. This over-throttles optimization loops and delays prompt-aligned submissions.
- Active worktree merger starvation gap (2026-03-13, loop 5 iteration 14): `coordinator/src/merger.js` `processQueue` defers all merges whenever `getReadyTasks().length > 0` and `prioritize_assignment_over_merge=true`, with no stale-deferral escape. Runtime evidence shows pending merges accumulating (#68/#70/#71/#72), 217 `merge_deferred_assignment_priority` logs, and no `merge_start` after 01:16:03 despite integrating requests waiting on merge completion.
- Runtime drift visibility remains weak: there is no first-class indicator that the running coordinator code is behind `origin/main`, so live DB/task anomalies can appear as active defects when they are already fixed upstream.
- Loop 1 iteration 33 (2026-03-13): origin/main fallback routing still uses raw substring checks for docs/typo/refactor in coordinator/src/cli-server.js resolveFallbackRoutingClass (`includes` on lines ~140-142). Repro against origin/main function block shows low-priority code task subject "Typography renderer cleanup" routes `mini` while equivalent non-typography task routes `mid`, indicating partial-word downscaling false positives that can reduce quality-per-credit.
- Fresh origin/main routing-cost gap on 2026-03-13 iteration 32 (loop 1): `resolveFallbackRoutingClass` still uses raw substring keyword checks (`subject.includes('merge')`, etc.), allowing unrelated tokens like `emergency`/`submerge` to trigger `mid` routing and unnecessary credit spend on low-complexity tasks. Submitted `req-c720b0db`.
- Fresh origin/main/runtime contradiction on 2026-03-13 iteration 20 (loop 3): `coordinator/src/merger.js` `runOverlapValidation` still runs `npm run build` unconditionally when overlap validation is enabled, even when task validation is `npm test` or null and `coordinator/package.json` has no build script. Runtime merge failures for `req-592efca7` and `req-a0b3fcce` show repeated `functional_conflict` with `Missing script: \"build\"`. Submitted `req-f2ab5d20`.
- Fresh origin/main optimization contradiction on 2026-03-13 iteration 20 (loop 2): `set-config` only rewrites `routing_budget_state` for `routing_budget_flagship_remaining` / `routing_budget_flagship_threshold` when scalar input parses as numeric, so clearing those scalars leaves stale JSON budget constraints/upgrades active. Because `fallbackModelRouter.getBudgetState` prefers parseable `routing_budget_state` over scalar fallback, routing can stay downscaled/upscaled after operators clear scalar controls. Submitted `req-73dd9f4e`.
- Dependency gating bug remains in `coordinator/src/db.js` `checkAndPromoteTasks`: dependency completion is checked with `COUNT(*) ... WHERE id IN (...) AND status != 'completed'`, so missing dependency IDs are ignored and blocked tasks can be promoted to `ready` incorrectly.
- Fresh origin/main optimization gap on 2026-03-13 iteration 19 (loop 2): fallback complexity routing ignores structured task metadata. `assign-task` passes full task fields (`domain`, `files`, `validation`) into `modelRouter.routeTask`, but `resolveFallbackRoutingClass` only inspects `tier`, `priority`, `subject`, and `description`, leaving architect-provided complexity cues unused and allowing keyword-sparse code tasks to under-route to spark. Submitted `req-bd1a59c7`.
- `origin/main` still has brittle backlog parser snippets in `.claude/commands/architect-loop.md` (Step 2a) and `.claude/docs/master-2-role.md` (Backlog Drain Control): both use `grep '\[pending\]'`/`tail -n 1`, which can miscount pending rows and pick a non-pending `oldest_pending_id` when descriptions contain the token; `templates/commands/architect-loop.md` already demonstrates the anchored-awk fix pattern.
- Fresh origin/main routing-cost gap on 2026-03-13 iteration 30 (loop 1): `coordinator/src/cli-server.js` `resolveFallbackRoutingClass` applies low-priority mini heuristics asymmetrically (`subject.includes('docs')` but not description; `description.includes('typo')` but not subject), so equivalent editorial tasks can route spark and spend more credits without quality gain. Submitted `req-bd3408f2`.
- Fresh origin/main optimization gap on 2026-03-13 iteration 17 (loop 4): complete-task usage normalization accepts prompt/input detail aliases for cached tokens but still rejects OpenAI completion/output detail reasoning telemetry (`completion_tokens_details` / `output_tokens_details` reasoning_tokens), and task usage schema/migrations still have no `usage_reasoning_tokens` persistence path. Submitted `req-a30691ab`.
- Fresh allocator ordering gap on 2026-03-13 iteration 9 (loop 5): `coordinator/src/db.js` `checkAndPromoteTasks` promotes dependency-blocked tasks when `depends_on` contains missing task IDs. The unfinished-count query (`SELECT COUNT(*) ... WHERE id IN (...) AND status != 'completed'`) returns zero when IDs do not exist, so tasks transition to `ready` despite unresolved prerequisites; add existence-aware gating plus regression coverage in `coordinator/tests/state-machine.test.js`.
- Fresh origin/main optimization gap on 2026-03-13 iteration 18 (loop 2): `coordinator/src/cli-server.js` `resolveFallbackRoutingClass` still checks merge/conflict only in subject while refactor now checks subject+description parity, so description-only merge/conflict tasks misclassify to spark. Submitted `req-481f0e1d`.
- Master-2 role docs backlog parser still drifts from architect-loop parser: templates/docs/master-2-role.md uses grep "\[pending\]" for pending_count/oldest_pending_id while architect-loop uses anchored request-row status-column predicates, so descriptions containing "[pending]" can misroute drain ordering.
- Fallback complexity detection still misses description-only merge/conflict signals: coordinator/src/cli-server.js resolveFallbackRoutingClass checks merge/conflict only in subject, so tier-2 normal tasks with generic subjects but conflict-heavy descriptions route as spark instead of mid.
- Fresh runtime/source gap on 2026-03-13 iteration 18 (loop 3): request lifecycle can remain `failed` during active remediation retries. Runtime shows `req-592efca7` failed since 00:21:11 while task `#46` is repeatedly `in_progress`; `origin/main` `coordinator/src/cli-server.js` `assign-task`/`start-task` do not reopen parent request state, and `coordinator/src/watchdog.js` recovery scans only `status='integrating'`. Submitted `req-16e6a189`.
- Fresh allocator ownership gap on 2026-03-13 iteration 8 (loop 5): `coordinator/src/cli-server.js` `assign-task` enforces only `worker.status === 'idle'` and does not require `claimed_by IS NULL`, so claimed Tier-2 workers can be assigned and have claims silently cleared in the same transaction (submitted `req-a1856410`).
- Loop 4 iteration 16 (2026-03-13): `req-b0fb73e3` remains decomposed with active task `#50`, so OpenAI-native complete-task usage aliases (`prompt_tokens`/`completion_tokens`) and nested cached-token detail ingestion are still not fully landed and should be monitored instead of resubmitted.
- Master-2 backlog-drain parser drift persists in docs/templates: `.codex/docs/master-2-role.md`, `templates/docs/master-2-role.md`, and `templates/commands/architect-loop.md` still use grep-based `[pending]` matching, while `.codex/commands-codex10/architect-loop.md` uses anchored request-row awk predicates that avoid status-token false positives.
- Fresh origin/main optimization contradiction on 2026-03-13 iteration 17 (loop 2): `set-config routing_budget_flagship_remaining`/`routing_budget_flagship_threshold` only synchronize `routing_budget_state` when values parse as numbers, so blank/non-numeric clears leave stale JSON thresholds active. Because `fallbackModelRouter.getBudgetState` prioritizes parsed `routing_budget_state`, routing can keep stale budget downscale/upscale behavior after scalar keys are cleared, distorting model-tier cost/quality decisions.
- Fresh routing-quality gap on 2026-03-13 iteration 28 (loop 1): `coordinator/src/cli-server.js` `resolveFallbackRoutingClass` checks `description.includes('refactor')` but not `subject.includes('refactor')`, so tier2/normal tasks titled as refactors can misclassify to `spark` instead of `mid`, reducing quality for complex changes and increasing retry/credit churn. Submitted `req-28d293b2`.
- Loop 4 iteration 15 (2026-03-13): submitted req-b0fb73e3 to add OpenAI-native usage compatibility in complete-task ingestion. origin/main still rejects prompt_tokens/completion_tokens aliases and nested cached-token fields (input_tokens_details.cached_tokens and prompt_tokens_details.cached_tokens) even though prompt-caching optimization telemetry uses those native shapes.
- Fresh runtime + source contradiction on 2026-03-13 iteration 17 (loop 3): `coordinator/src/watchdog.js` marks integrating requests `failed` immediately in the non-conflict `merge_failures` branch without the active-task/grace handling used for conflicts, but allocator can still spawn remediation tasks after that failure. Runtime timeline shows `req-592efca7` marked failed at 00:21:11 and new remediation task `#46` created at 00:22:11, leaving a failed request with in-progress work.
- Loop sentinel active-request precheck is currently ineffective in `scripts/loop-sentinel.sh` and `.codex/scripts/loop-sentinel.sh`: it greps for JSON status fields on default `loop-requests` text output, yielding false zero-active counts and unnecessary loop respawns.
- Re-verified on `origin/main` (2026-03-13 iteration 16, loop 2): worker completion guidance still omits `--usage JSON` in `coordinator/src/overlay.js`, `.claude/commands/worker-loop.md`, `templates/commands/worker-loop.md`, and `templates/worker-claude.md` even though complete-task usage ingestion exists in CLI/coordinator paths; submitted `req-a0b3fcce`.
- Re-verified on `origin/main` (2026-03-13): complete-task usage parsers still reject OpenAI-native nested usage details and prompt/completion token aliases. `coordinator/bin/mac10` and `coordinator/src/cli-server.js` allow only flat canonical usage keys plus Anthropic cache aliases, with unknown-key rejection enabled; this blocks direct ingestion of OpenAI payloads carrying `input_tokens_details.cached_tokens` and chat-style `prompt_tokens`/`completion_tokens`.
- Prompt-aligned area still needing deeper evidence: current fallback scaling logic primarily keys off tier, priority, keyword heuristics, and budget signals; no explicit request-quality score is fed into routing decisions yet, so future iterations should verify whether this is intentional design or missing optimization linkage.
- Allocator reset integrity gap remains active in source/runtime: `.codex/scripts/worker-sentinel.sh` still calls `reset-worker` without task/token context, `coordinator/src/cli-server.js` still permits non-idle reset when expected ownership fields are null, and runtime `activity_log` shows the failure chain (`task_assigned` id 1692 -> `task_started` id 1701 -> `sentinel_reset` busy with null expectations id 1702 -> `orphan_task_recovered` id 1704 -> reassigned id 1712).
- Fresh origin/main/runtime contradiction on 2026-03-13 iteration 13 (loop 4): `start-task`, `complete-task`, and `fail-task` in `coordinator/src/cli-server.js` still mutate task/worker lifecycle without verifying ownership (`task.assigned_to` and `worker.current_task_id`), enabling wrong-worker state transitions that corrupt task usage attribution and leave true owners stuck assigned; submitted `req-592efca7`.
- Fresh parser correctness gap on 2026-03-12 iteration 15 (loop 3): Master-2 backlog drain commands in `templates/commands/architect-loop.md`, `.codex/commands-codex10/architect-loop.md`, and `.codex/commands/architect-loop.md` match `\\[pending\\]` anywhere on request lines (`grep '\\[pending\\]'`), so completed/decomposed descriptions containing literal `[pending]` are misclassified as pending. Repro status sample with one true pending row returns `pending_count=2` and `oldest_pending_id=req-old`. Submitted `req-31dab37b`.
- Fresh origin/main instruction-path mismatch on 2026-03-12 iteration 15 (loop 2): usage telemetry ingestion exists in coordinator complete-task handlers, but worker-facing completion instructions still omit `--usage` in `coordinator/src/overlay.js`, `.claude/commands/worker-loop.md`, `templates/worker-claude.md`, and `templates/commands/worker-loop.md`, so the documented worker happy path does not invoke task usage persistence for optimization triage.
- Fresh runtime/source contradiction on 2026-03-13 iteration 26 (loop 1): `coordinator/src/cli-server.js` `start-task` on origin/main still unconditionally sets `tasks.status='in_progress'` and logs `task_started` without ownership/state validation, allowing replay after completion. Runtime evidence for task `#38` (`req-6d720dd2`): completed at `2026-03-12 23:55:03`, replay-started at `2026-03-12 23:56:52`, then completed again at `2026-03-13 00:05:02` with a different PR, demonstrating duplicate execution churn.
- `coordinator/bin/mac10` status renderers (`printStatus` and loop-requests summary rows) emit unsanitized request descriptions; multiline/control-character input can break the architect backlog parser (`status | sed | grep '\\[pending\\]' | awk '{print $1}'`) and misidentify `oldest_pending_id`.
- Fresh allocator integrity gap on 2026-03-12 iteration 4 (loop 5): `coordinator/src/cli-server.js` includes `parseResetOwnership` mismatch guards, but `coordinator/bin/mac10` `reset-worker` and both sentinel scripts call reset with only `worker_id`, leaving `expected_task_id` and `expected_assignment_token` null in runtime `sentinel_reset` logs and effectively bypassing stale-reset protection.
- Fresh origin/main/runtime correctness gap on 2026-03-12 iteration 12 (loop 4): complete-task and fail-task paths in coordinator/src/cli-server.js update worker/task state without verifying task existence or worker-task ownership, while coordinator/src/db.js updateTask does not enforce changed-row checks. Runtime repro: complete-task 1 999 returned success, emitted worker-1 task_completed, and set worker-1 current_task_id to null/tasks_completed +1 even though tasks.id=999 does not exist.
- Fresh runtime/source contradiction on 2026-03-12 iteration 24 (loop 1): `coordinator/src/cli-server.js` `start-task` unconditionally sets `tasks.status='in_progress'` without validating prior state/assignment ownership, so duplicate/replayed `task_started` events can reopen already completed tasks and temporarily regress completion accounting. Runtime evidence: `activity_log` for `req-f09fb5b9` shows task `#34` completed at `23:49:45`, then `task_started` again at `23:51:15`, then completed again at `23:52:22`.
- Fresh origin/main contradiction on 2026-03-12 iteration 14 (loop 2): `coordinator/src/web-server.js` `buildBudgetSnapshotFromConfig` uses nullish-coalescing for scalar fallback (`routing_budget_flagship_* ?? legacy`) so blank primary values suppress legacy fallback and parse to null, while `coordinator/src/cli-server.js` `parseBudgetScalarFallback` falls back by parsed-value (`routingParsed !== null ? routingParsed : legacyParsed`). This can desync operator budget telemetry from active budget-aware routing whenever primary scalar keys are blank.
- Active worktree still emits duplicate architect request notifications: `coordinator/src/cli-server.js` `bridgeToHandoff()` calls `db.sendMail('architect', 'request_queued', ...)` while `coordinator/src/db.js` `createRequest`/`createLoopRequest` already emit `new_request`; runtime DB evidence shows both types per request (including `req-908190c1`).
- Allocator wake-up contract drift persists: allocator loop prompts/docs still wait on `.codex10.completion-signal`, but runtime allocator events are delivered through mailbox (`mail`) and there is no completion-signal writer path.
- Fresh origin/main contract mismatch on 2026-03-12 iteration 11 (loop 4): complete-task usage parsers only accept canonical keys (`model,input_tokens,output_tokens,cached_tokens,cache_creation_tokens,total_tokens,cost_usd`) in both `coordinator/bin/mac10` and `coordinator/src/cli-server.js`, with explicit unknown-key rejection. Anthropic prompt-caching telemetry reports `cache_creation_input_tokens` and `cache_read_input_tokens`, so provider-native usage payloads are currently rejected unless manually remapped, blocking consistent cache-efficiency telemetry ingestion for optimization triage.
- Fresh runtime/source contradiction on 2026-03-12 iteration 24 (loop 1): `req-f09fb5b9` is marked `completed`, but `check-completion` reports `1/4 completed` with tasks `#32/#33` still `in_progress` and `#34` pending; current `coordinator/src/merger.js` `checkRequestCompletion` still finalizes on `all merge_queue rows merged` without task-state gating, so premature `request_completed` remains active until `req-66e2644b` lands.
- Fresh origin/main contradiction on 2026-03-12 iteration 13: fallback routing budget logic reads only `routing_budget_state` in `coordinator/src/cli-server.js` `fallbackModelRouter.getBudgetState`, while config management and dashboard budget hydration still maintain/read scalar keys (`routing_budget_flagship_remaining`/`routing_budget_flagship_threshold` and legacy `flagship_budget_remaining`/`flagship_budget_threshold`). This can leave operators seeing constrained/healthy budget telemetry while fallback routing ignores those scalar signals when state JSON is absent. Submitted loop-2 request `req-935a8a59`.
- Fresh contradiction on 2026-03-12 iteration 12 (loop 3): architect request creation currently emits duplicate inbox events per request ID on `origin/main` and runtime. `coordinator/src/db.js` `createRequest` + `createLoopRequest` already send `mail(type='new_request')`, while `coordinator/src/cli-server.js` `bridgeToHandoff` additionally sends `mail(type='request_queued')`. Runtime `codex10 inbox architect --peek` showed paired same-timestamp messages for the same request (`new_request` + `request_queued`), and runtime DB aggregation over `mail` shows recent requests with `new=1` and `queued=1` per request_id. This doubles architect inbox traffic and can trigger duplicate triage/decomposition actions in backlog-drain flow.
- Allocator inbox recipient mismatch remains active: docs still point Master-3 to `inbox master-3`, but runtime producers send allocator control mail to `allocator` and `checkMail` uses exact recipient matching; loop 5 submitted `req-cbf93c49` to add alias normalization and help/doc parity.
- Fresh recheck on `origin/main` (2026-03-12 iteration 23): failed-task completion hardening is still incomplete in `coordinator/src/merger.js`; `onTaskCompleted` treats `failed` as terminal-success and can call `completeRequestIfTransition` on no-merge paths, and merge-path completion still gates on `taskCompletion.all_done` instead of strict success (`all_completed && failed===0`), allowing false `request_completed` after failed work.
- Web telemetry contract mismatch on origin/main: /api/status hydrates task model_source from allocator logs in coordinator/src/web-server.js, but /api/tasks and /api/requests/:id return raw db.listTasks rows and tasks schema/db migrations do not persist model_source, so non-status API consumers lose routing provenance.
- Fresh runtime/source contradiction on 2026-03-12 (loop 2 iteration 12): `coordinator/src/cli-server.js` `assign-task` still writes only `status`/`assigned_to` to task rows while routing metadata is emitted only to mail/log payloads; live DB shows `tasks total=29` with `routing_class_set=0`, `routed_model_set=0`, `reasoning_set=0` even though latest `activity_log` `task_assigned` rows still carry routing/model/reasoning fields.
- Allocator completion semantics currently conflate terminal with successful: `coordinator/src/db.js` `checkRequestCompletion` sets `all_done` true when `completed + failed >= total`, and `coordinator/src/cli-server.js` `integrate` gates only on `all_done`, so failed tasks can still pass merge gating while CLI reports `ALL DONE`.
- Re-verified on `origin/main` (2026-03-12 iteration 9): complete-task usage telemetry is persisted and carried through `/api/status` task rows, but operator task views still do not render usage model/token/cost metrics (`gui/public/app.js` and `gui/public/popout.js` contain no `usage_*` rendering path), leaving spend/cache optimization signals invisible during live triage.
- Fresh runtime contradiction on 2026-03-12 after `req-091411bd` completion: `coordinator/src/merger.js` `checkRequestCompletion` still finalizes requests from merge_queue-only state, and `activity_log` shows `req-3ea46261` `request_completed` at `23:14:06` before task `#24` started (`23:14:39`), then completed again later when task `#24` actually finished.
- Usage telemetry path is partially disconnected in source-of-truth docs: `origin/main` `coordinator/bin/mac10` supports `complete-task ... [--usage JSON]` and `coordinator/src/cli-server.js` + `coordinator/src/db.js` map/persist usage fields, but worker-facing completion instructions still omit usage in `coordinator/src/overlay.js`, `templates/worker-claude.md`, and `templates/commands/worker-loop.md`.
- Fresh recheck on 2026-03-12 iteration 8 (loop 4): task-usage telemetry remains unlanded in active source while request `req-3ea46261` is still decomposed (`0/2`) — `coordinator/bin/mac10` `complete-task` still sends only `worker_id/task_id/pr_url/branch/result`, `coordinator/src/cli-server.js` `complete-task` still persists only status/result/branch/PR/completed_at, and repo search still finds no `input_tokens|output_tokens|cached_tokens|total_tokens|cost_usd` fields in coordinator source/tests/UI.
- Fresh recheck on 2026-03-12 iteration 8 (loop 4): dashboard routing/budget visibility remains partial while `req-d0c21d70` is not fully complete (`2/3`) — `coordinator/src/web-server.js` `/api/status` still returns only `{requests,workers,tasks,logs}`, and `gui/public/app.js` + `gui/public/popout.js` task rendering still omits routing/budget/model-source metadata.
- Active completion-integrity gap: coordinator/src/merger.js checkRequestCompletion marks requests completed based only on merge_queue rows and does not verify db.checkRequestCompletion(requestId).all_done, allowing premature request_completed while request tasks are still pending/assigned.
- Workspace branch/head drift can mask true landing state during research: current checkout is `agent-5-task70`, while runtime DB records newer merged optimization PRs (`#61`, `#62`, `#63`) for `req-bc997d74` and `req-d0c21d70`.
- As of 2026-03-12 iteration 7, optimization observability still lacks per-task usage telemetry: `complete-task` does not accept structured token/cost usage, schema has no persisted usage fields/table, and repo-wide search for `input_tokens|output_tokens|cached_tokens|total_tokens|cost_usd` in `coordinator/src`, `coordinator/tests`, and `gui/public` returns no matches.
- Fresh recheck on 2026-03-12 iteration 8 (loop 3): `templates/commands/master-loop.md` still has stale clarification-queue timeout/rules text while `.codex/commands-codex10/master-loop.md` and `.codex/commands/master-loop.md` use mailbox wording; `scripts/launch-agent.sh` template fallback keeps this drift production-relevant. Submitted re-land request `req-0699db1c`.
- Fresh recheck on 2026-03-12 iteration 20: runtime merge queue still has cross-request merged PR reuse (`#57` across req-b1107c73/req-8c2aa344/req-deb22873; `#50`, `#51`, `#55` each reused), matching current `queueMergeWithRecovery` inserted-path behavior that logs duplicate ownership but still returns queued success.
- Fresh runtime recheck on 2026-03-12 iteration 20: task-row routing telemetry remains unpersisted (`tasks total=20`, `routing_class_set=0`, `routed_model_set=0`, `reasoning_set=0`) while recent `activity_log` `task_assigned` rows still include routing/model/model_source/reasoning fields.
- Re-verified on 2026-03-12 after `req-a304e336` reached `completed`: duplicate PR ownership is still non-blocking on the inserted path in `coordinator/src/cli-server.js` `queueMergeWithRecovery` (logs `merge_queue_duplicate_pr_ownership_preserved` and returns queued), so completion-integrity drift risk remains.
- Re-verified on 2026-03-12 iteration 9: active fallback routing still leaves optimization controls inert in `coordinator/src/cli-server.js` (`resolveFallbackRoutingClass` emits only `high|mid|spark`; `routeTask` hardcodes `reasoning_effort` to `high|low`) while `set-config` allowlists `model_xhigh/model_mini` and `reasoning_xhigh/high/mid/spark/mini`; submitted re-land request `req-bc997d74`.
- Runtime DB snapshot on 2026-03-12 iteration 9 still shows task-row telemetry persistence gap despite prior completions: `.codex/state/codex10.db` `tasks` has `total=20` with `routing_class_set=0`, `routed_model_set=0`, `reasoning_set=0`, while `activity_log` `task_assigned` rows continue carrying routing metadata.
- Fresh recheck on 2026-03-12 (loop 4 iteration 6): operator optimization visibility is still missing in the active dashboard path. `coordinator/src/web-server.js` `/api/status` and websocket state payloads do not include routing/budget summary fields, and `gui/public/app.js` `renderTasks` still renders no routing/model/budget metadata.
- Runtime contradiction remains active on 2026-03-12 despite completed routing-telemetry requests: `.codex/state/codex10.db` currently has `tasks total=17` with `routing_class_set=0`, `routed_model_set=0`, `reasoning_set=0`, while recent `activity_log` `task_assigned` entries include routing metadata (`routing_class`, `model`, `model_source`, `reasoning_effort`).
- Re-verified on 2026-03-12 after `req-84d6f05a` shows `completed`: `templates/commands/master-loop.md` still has legacy clarification guidance at lines ~190 and ~221 (`check clarification-queue` / `Poll clarification-queue.json`), while `.codex/commands-codex10/master-loop.md` and `.codex/commands/master-loop.md` already use mailbox wording (`codex10 inbox master-1`); `scripts/launch-agent.sh` fallback to templates keeps bootstrap drift risk active.
- Fresh recheck on 2026-03-12 after `req-5acfb25f` reached `completed`: telemetry persistence is still missing in active source/runtime — `coordinator/src/db.js` `VALID_COLUMNS.tasks` still omits `routing_class`/`routed_model`/`reasoning_effort`, `coordinator/src/cli-server.js` `assign-task` still updates only `status`/`assigned_to`, and runtime `tasks` remains `total=17` with all three routing columns unset (`0`).
- Fresh recheck on 2026-03-12: fallback optimization behavior remains stale in active source despite multiple completed requests — `fallbackModelRouter.routeTask` still inverts `model_source`, hardcodes `reasoning_effort`, and uses `model_spark` as spark default while `model_codex_spark` remains allowlist-only.
- Routing optimization regression coverage is still absent in `coordinator/tests/cli.test.js` and `coordinator/tests/security.test.js` (no matches for routing/model_source/budget/reasoning telemetry keys), so these contradictions remain unguarded.
- Re-verified on 2026-03-12 iteration 8: active fallback routing still leaves allowlisted optimization knobs inert in `coordinator/src/cli-server.js` — `resolveFallbackRoutingClass` emits only `high|mid|spark` (no `xhigh|mini`), and `routeTask` hardcodes `reasoning_effort` (`high|low`) instead of reading `reasoning_xhigh/high/mid/spark/mini`; `coordinator/src/model-router.js` remains absent so fallback path is active.
- Runtime evidence on 2026-03-12 iteration 8 from `.codex/state/codex10.db`: `tasks` has `total=17` with `routing_class_set=0`, `routed_model_set=0`, `reasoning_set=0`; `activity_log` `task_assigned` distinct values currently show `routing_class in {mid,spark}` and `reasoning_effort in {low}`, consistent with unresolved routing-control and persistence gaps.
- Recheck on 2026-03-12 shows partial landing for Master-1 clarification guidance: `.codex/commands-codex10/master-loop.md` and `.codex/commands/master-loop.md` now use mailbox polling, but `templates/commands/master-loop.md` still has `clarification-queue` timeout/rules text while task `#16` is already in progress for this sync.
- Dashboard optimization visibility is still incomplete in active source: CLI `status` includes `budget_state`/`budget_source` from routing logic, but `coordinator/src/web-server.js` `/api/status` currently returns only `requests/workers/tasks/logs`, and `gui/public/app.js` task rendering has no routing/budget fields.
- As of 2026-03-12 iteration 18, merge-ownership hardening request `req-a304e336` remains decomposed with task `#9` in progress, so completion metadata still cannot be treated as proof that optimization fixes landed in source.
- As of 2026-03-12 iteration 18, telemetry persistence remediation is already active via `req-5acfb25f` (task `#17` assigned), so new routing-telemetry submissions in this window would likely duplicate in-flight work.
- Re-verified on 2026-03-12 before submitting `req-5acfb25f`: `coordinator/src/schema.sql` defines `tasks.routing_class`/`routed_model`/`reasoning_effort`, but `coordinator/src/db.js` `VALID_COLUMNS.tasks` still omits them and local repro still throws `Invalid column "routing_class" for table "tasks"`; runtime DB remains unpopulated (`total=16`, all three routing columns set count `0`) while `activity_log` `task_assigned` rows continue carrying routing values.
- Runtime state on 2026-03-12 still shows `req-a304e336` task `#9` as `in_progress` with no `merge_queue` rows yet, so duplicate-PR completion-integrity remediation has not landed and remains a blocker for trusting request-completed metadata.
- Latest runtime snapshot (2026-03-12) still has `tasks` routing telemetry unpopulated (`total=15`, `routing_class_set=0`, `routed_model_set=0`, `reasoning_effort_set=0`) while active source keeps `VALID_COLUMNS.tasks` without these fields.
- Master-1 loop prompt mirrors still contain legacy clarification-queue instructions at the timeout path and Rules section (`check clarification-queue` and `Poll clarification-queue.json`) across `.codex/commands-codex10/master-loop.md`, `.codex/commands/master-loop.md`, and `templates/commands/master-loop.md`, while runtime clarification transport is mailbox (`ask-clarification` -> `db.sendMail('master-1','clarification_ask', ...)`) and `.codex/state/clarification-queue.json` is absent.
- Fresh log validation on 2026-03-12 (around 22:27 UTC) shows `req-deb22873` emitted `merge_queue_duplicate_pr_ownership_preserved` against already merged PR `https://github.com/alexhachm/setup-agents-codex10/pull/57` and then `request_completed`; active `coordinator/src/cli-server.js` still has pre-fix fallback routing behavior, so optimization landing drift persists.
- Fresh recheck on 2026-03-12 shows request-landing drift remains active for routing telemetry persistence: `req-7eec822f` is `completed`, but `coordinator/src/db.js` `VALID_COLUMNS.tasks` still omits `routing_class`/`routed_model`/`reasoning_effort`, and `coordinator/src/cli-server.js` `assign-task` still does not persist these fields into `tasks`.
- Fresh runtime proof on 2026-03-12: `merge_queue` now shows PR `#57` reused across `req-b1107c73` and `req-8c2aa344` (both `merged`), while `coordinator/src/cli-server.js` still contains the pre-fix fallback routing code expected to change in `req-8c2aa344`, indicating duplicate-PR completion drift remains active.
- As of 2026-03-12 loop 16, request metadata still diverges from source: `req-8c2aa344` is `completed`, but `fallbackModelRouter.routeTask` in `coordinator/src/cli-server.js` still has inverted `model_source`, hardcoded `reasoning_effort`, and no read-path for allowlisted `reasoning_*` knobs.
- Budget-scaling regression coverage remains weak: repo search on 2026-03-12 found budget keys only in `coordinator/src/cli-server.js`, with no budget/routing-budget assertions in `coordinator/tests/cli.test.js`.
- Active root-cause contradiction remains in `coordinator/src/db.js`: `VALID_COLUMNS.tasks` omits `routing_class`, `routed_model`, and `reasoning_effort`, so `db.updateTask` rejects routing field writes even though `coordinator/src/schema.sql` defines those columns.
- Clarification transport mismatch remains unresolved: Master-1 loop prompt mirrors still direct timeout/rules checks to `clarification-queue.json`, but runtime clarification delivery is mailbox (`db.sendMail('master-1','clarification_ask', ...)`) and `codex10 inbox master-1 --peek` currently returns 21 unconsumed mailbox messages.
- Master-1 loop prompts still contain legacy clarification-queue guidance in `.codex/commands-codex10/master-loop.md`, `.codex/commands/master-loop.md`, and `templates/commands/master-loop.md` (timeout sentence and rules bullet), despite active clarification flow using `codex10 inbox master-1`/`codex10 clarify`.
- `scripts/launch-agent.sh` falls back to `templates/commands/master-loop.md` when project-local command prompts are missing, so stale clarification-queue instructions in templates can be reintroduced after reset/bootstrap.
- Bootstrap propagation risk remains: `.codex/commands-codex10/scan-codebase.md` copies `templates/commands/architect-loop.md` when the project prompt is missing, so stale template text can reseed incorrect architect behavior after fresh setup/reset.
- Completed request metadata can diverge from active source state: loop 2 request `req-a1598713` is marked completed, but `coordinator/src/cli-server.js` still reads only `model_spark` in fallback routing and `rg -n model_codex_spark` still matches only the set-config allowlist entry.
- Routing regressions remain under-tested in current branch state: `coordinator/tests/cli.test.js` has no fallback assign-task coverage for spark key alias behavior (`model_codex_spark` vs `model_spark`).
- `coordinator/src/cli-server.js` fallback router parses `routing_budget_state` but does not use budget thresholds to change routing/model selection.
- `coordinator/src/model-router.js` is absent, so fallback routing path appears to be the active routing implementation.
- Current fallback behavior can miss intelligent up/down scaling under constrained credit budgets.
- Task routing telemetry persistence is inconsistent: `tasks` schema has `routing_class`, `routed_model`, and `reasoning_effort`, but assignment flow does not persist these values and DB task column validation does not currently include them.
- Runtime confirmation in `.codex/state/codex10.db`: all current task rows are null for `routing_class`/`routed_model`/`reasoning_effort` (3/3), while `activity_log` `task_assigned` entries include those routing values, proving telemetry is generated but not persisted on task rows.
- Request status can report `completed` while these routing gaps remain in current source/runtime state, so each iteration should re-verify landed code rather than assuming closure.
- `gui/public/popout.js` does not expose routing/budget telemetry, which limits operator visibility but is secondary to the active fallback routing bug.
- Fallback router hard-codes `reasoning_effort` to `high/low`; allowlisted config knobs `reasoning_xhigh/high/mid/spark/mini` are currently no-ops.
- Fallback class resolution never emits `xhigh` or `mini`, so allowlisted `model_xhigh`/`model_mini` cannot be selected in current active router behavior.
- Fallback router inverts model-source telemetry: `configuredModel === defaultModel` is labeled `config-fallback` while override path is labeled `fallback-default` in `coordinator/src/cli-server.js`, so optimization telemetry cannot reliably distinguish default routing from explicit config-driven scale changes.
- Runtime evidence remains consistent with inversion: `.codex/state/codex10.db` has null `config.model_spark/model_flagship`, but `activity_log` `task_assigned` rows still report `model_source=\"config-fallback\"` for default model picks, proving misattribution in active telemetry.
- Fallback budget parsing has a compatibility blind spot: `fallbackModelRouter.getBudgetState` reads only `routing_budget_state`, while scalar keys (`routing_budget_flagship_remaining`/`routing_budget_flagship_threshold`) and legacy keys (`flagship_budget_remaining`/`flagship_budget_threshold`) are maintained elsewhere in `cli-server.js` but never read during routing when state JSON is absent.
- Runtime repro on current source confirms constrained budget is still non-enforcing in active fallback routing: with `routing_budget_state.flagship.remaining=5` and `threshold=100`, `assign-task` for tier-3 still routes `{ class: \"high\", model: \"gpt-5.3-codex\", reasoning_effort: \"high\" }`, so no downscale occurs despite budget pressure.
- `coordinator/src/cli-server.js` `queueMergeWithRecovery` inserted-path duplicate check is non-blocking: it logs `merge_queue_duplicate_pr_ownership_preserved` but still returns queued success, allowing a previously merged PR URL to be reused by a new request/task and incorrectly drive completion.
- Spark model configuration has a live no-op path: `set-config` allowlists `model_codex_spark`, but active fallback routing reads only `model_spark`; isolated repro shows `set-config model_codex_spark my-custom-spark-model` still routes spark tasks to `gpt-5.3-codex-spark`, while `model_spark` changes routing as expected.
- Re-verified in current source: `model_codex_spark` appears in `set-config` allowlist (`coordinator/src/cli-server.js`, line ~1956) but is never read by fallback routing (`routeTask` reads `model_spark` at line ~52; repo-wide `rg` finds no other read sites), so spark downscale config can silently no-op on the active router path.
- Prompt-aligned optimization gap remains open in active source: fallback spark routing still ignores `model_codex_spark` alias despite being operator-configurable, so model-tier cost optimization guidance from AI team docs/newsletters cannot be applied reliably through this key.
- Task routing telemetry persistence is still broken in active source/runtime: `assign-task` computes and logs routing decision metadata, but does not update `tasks.routing_class`, `tasks.routed_model`, or `tasks.reasoning_effort`; runtime DB snapshot on 2026-03-12 shows 0 populated rows for all three columns while recent `activity_log` `task_assigned` entries include those values.
- `gui/public/app.js` currently has no routing/budget telemetry hooks (`rg` for routing/budget/model_source/routed_model/reasoning_effort returns no matches), leaving operators without dashboard visibility into optimization routing state.
- Loop 1 request `req-a304e336` remains `decomposed` (not completed), so merge ownership hardening for duplicate PR reuse is still unresolved in current branch state.
- Fallback spark alias gap remains in current source before `req-b1107c73` lands: `set-config` allows `model_codex_spark`, but `fallbackModelRouter.routeTask` still reads only `model_spark`.
- Runtime recheck on 2026-03-12 confirmed routing task-field persistence is still broken post-completion metadata: `tasks` has 12 total rows with `routing_class/routed_model/reasoning_effort` all null, while recent `activity_log` `task_assigned` rows include those routing values.
- Reasoning config knobs are currently no-op on the active path: `coordinator/src/model-router.js` is absent (fallback router active), `set-config` allowlists `reasoning_xhigh/high/mid/spark/mini`, but `fallbackModelRouter.routeTask` still hard-codes `reasoning_effort` as `high` for high class and `low` otherwise.
- Re-verified after `req-b1107c73` moved to `completed`: active source still shows legacy fallback behavior (`model_source` inversion and hardcoded `reasoning_effort` in `coordinator/src/cli-server.js`), so completion metadata still diverges from landed optimization code.
- Runtime DB still carries cross-request duplicate merged PR ownership in `.codex/state/codex10.db`: PR `#51` (`req-0e45a0f5` + `req-628a3b3e`) and PR `#55` (`req-a1598713` + `req-cd016d2a`), confirming duplicate-PR completion integrity remains unresolved.
- Re-verified on 2026-03-12: despite `completed` statuses on prior requests (`req-16bdcac3`, `req-0e45a0f5`), active source still has `model_source` inversion (`configuredModel === defaultModel ? config-fallback : fallback-default`) and hard-coded `reasoning_effort` in `fallbackModelRouter.routeTask`, so optimization controls remain partially unlanded.

## False Positives
- Loop 4 iteration 12 (2026-03-16): suspected stopped-loop heartbeat exit-code defect is not present at CLI boundary (`./.codex/scripts/codex10 loop-heartbeat <stopped_loop>` exits 2 with "Loop stopped"); the confirmed lifecycle bug is checkpoint mutation on stopped loops.
- Architect-loop command mirrors are currently in parity for Tier-2/Tier-3 flow: diff -u .codex/commands/architect-loop.md against .codex/commands-codex10/architect-loop.md and templates/commands/architect-loop.md returned no differences in this iteration.
- Loop 21 iteration 14 (2026-03-13): repeated `tasks_available` mail with idle workers and ready tasks is not by itself a coordinator logic defect; it can be allocator-process inactivity, so require runtime allocator-process evidence before filing dispatch-starvation bugs.
- Loop 17 iteration 13 (2026-03-13): local branch `master2-req-768fdda8` still lacks origin/main usage-ingestion paths in `coordinator/src/cli-server.js`, but this is branch drift (origin/main has parse/normalize/map usage logic); do not submit ingestion regressions without upstream parity checks.
- Loop 17 iteration 12 (2026-03-13): local branch `agent-5-task70` appears to lack usage telemetry parsing/persistence, but `origin/main` still contains usage parser/mapping/schema paths; treat this as branch-local drift, not a new upstream request.
- Loop 18 iteration 2 (2026-03-13): suspected stopped-loop `loop-heartbeat` mutation was not submitted this pass; direct runtime evidence in this iteration proves checkpoint mutation, but heartbeat state is not directly surfaced by CLI output and was treated as unconfirmed.

- Loop 12 iteration 6 (2026-03-13): local hashes showed master-3 role-doc mismatch (`.codex/docs` vs `templates`/`.claude`), but `origin/main` has `templates/docs/master-3-role.md` and `.claude/docs/master-3-role.md` aligned to the codex10 mailbox guidance, so this was local branch drift.
- Loop 13 iteration 6 (2026-03-13): local branch agent-5-task70 still showed templates/.claude architect-loop Step2a/3b/3c drift, but origin/main already contained those fixes, so local worktree drift was not a valid submission target.
- Loop 9 iteration 4 (2026-03-13): coordinator/src/cli-server.js model_source inversion seen in local worktree is branch drift; origin/main has corrected fallback-default/config-fallback attribution and dedicated cli.test coverage.
- Loop 3 iteration 21 (2026-03-13): runtime evidence showed tasks `#64`/`#67` with `completed_at` set while status was `in_progress`, but this was not a new submission candidate after `origin/main` verification showed `start-task` ownership/state guards already landed.
- Loop 2 iteration 19 (2026-03-13): local runtime DB sampling for recent routed tasks returned zero rows with `routing_class`, so task-distribution claims from `.codex/state/codex10.db` on this branch are unreliable; prefer `origin/main` source contradictions unless runtime state is freshly populated.
- Loop 3 iteration 19 (2026-03-13): local coordinator runtime on branch `agent-5-task70` can show requests stuck `[failed]` with remediation tasks `in_progress` and zero `request_reopened_for_active_remediation` events even after `req-16e6a189` is marked completed; treat this as runtime/source drift unless reproduced on current `origin/main`.
- Loop 2 iteration 18 (2026-03-13): local runtime `.codex/state/codex10.db` missing `tasks.model_source`/routing columns is stale-schema noise on branch `agent-5-task70`; `origin/main` already defines and migrates these fields, so do not file from local DB state alone.
- Loop 4 iteration 16 (2026-03-13): treating failed status on `req-592efca7` as proof of an open ownership defect is a false positive; `origin/main` now contains `validateWorkerTaskOwnership` use in start/complete/fail paths and ownership regression tests, so resubmission would likely duplicate landed fixes.
- Loop 6 iteration 1 (2026-03-12): `origin/main` already has robust pending-row parsing in `templates/commands/architect-loop.md` (under `.claude` paths), so local `.codex` template/parser drift can be branch-specific; verify branch context before filing upstream parity requests.
- Loop 4 iteration 15 (2026-03-13): local branch agent-5-task70 `coordinator/bin/mac10` lacks complete-task usage parsing found on origin/main, so local CLI repros can falsely suggest compatibility and must be treated as branch drift unless validated against origin/main source.
- Loop 4 iteration 14 (2026-03-13): local worktree grep for usage-parser symbols returned no matches because branch `agent-5-task70` is heavily behind `origin/main`; treat local parser absence as branch drift and validate compatibility findings against `origin/main`.
- Loop 1 iteration 27 (2026-03-13): local agent-5-task70 still showed unguarded start-task behavior and missing tasks.model_source and usage columns in .codex/state/codex10.db, but origin/main already contains the hardening and migration paths; treat this combination as local branch/runtime drift unless reverified on fresh main state.
- Loop 3 iteration 16 (2026-03-13): local branch `agent-5-task70` still shows unguarded `start-task` and unsanitized status-line rendering, but `origin/main` already contains both hardenings; treat local/runtime contradictions as branch drift unless reproduced against current upstream source.
- Point-in-time completion mismatch can be transient during active worker retries: in this iteration `req-f09fb5b9` briefly appeared `completed` with task `#34` non-terminal, but timeline replay showed a duplicate `task_started` followed by a second `task_completed`; confirm with `activity_log` ordering before filing snapshot-only completion-status reports.
- `origin/main` already replaced the bridge-path architect mail with coordinator logging (`request_queued` log only), so local duplicate-mail findings can be branch-drift if not validated against branch context before resubmission.
- Loop 4 iteration 10 (2026-03-12): local branch agent-5-task70 still lacks usage telemetry rendering in gui/public/app.js and gui/public/popout.js, but origin/main already includes the landed telemetry chips and dashboard render regression tests; treat local view as branch drift.
- Loop 3 iteration 11 (2026-03-12): local `agent-5-task70` `coordinator/bin/mac10` usage output still omitted `claim-worker`/`release-worker`, but `origin/main` (`be1820d`) already includes both entries, so this is branch-drift noise and not a new actionable gap.
- Local runtime/schema checks can mislead when the loop worktree is stale: iteration 11 saw missing usage columns in local `.codex/state/codex10.db` and local source, but `origin/main` already contained usage telemetry CLI/server/schema support; always validate landed state on a fresh branch snapshot before re-land submissions.
- Assumption that `req-d0c21d70` was finished based on `[completed]` status alone is false on 2026-03-12 iteration 8; `check-completion` and task table still show unfinished work (`2/3`, task `#20` active).
- Local-source recheck findings right after request completion can be stale when running on a non-main task branch; verify branch recency alongside DB merge metadata before re-land submissions.
- Earlier assumption that `req-a304e336` was still decomposed became stale within one iteration; current `check-completion` reports 1/1 done, so request status assumptions must be refreshed each run.
- Initial assumption that `codex10 claim-worker` was removed was incorrect: command works (`claim-worker 1` returns availability state), and any missing usage entry can be branch-specific drift; verify `origin/main` before filing parity fixes.
- Earlier "all three master-loop mirrors still stale" evidence is outdated after recheck on 2026-03-12; runtime `.codex` mirrors are updated and only `templates/commands/master-loop.md` remains stale.
- Pending-order parsing in the Master-2 backlog command path appears correct: `status` request rows are sorted `created_at DESC` in `db.listRequests`, so `tail -n 1` over `[pending]` rows does select the oldest pending request.
- `coordinator/src/allocator.js` appearing as a non-scaling allocator is expected in this codebase; it is a thin notifier and assignment happens via allocator command flow.

## Iteration Updates
### Loop 1 Iteration 31 (2026-03-13)
- Successful Patterns: Checkpoint-driven preflight (`status` + `check-completion` + `history`) before source review avoided duplicate submission while optimization requests `req-bd3408f2` and `req-481f0e1d` were already fully landed.
- Failed Patterns: Relying on request `status` alone remains unsafe for closure decisions (`req-a0b3fcce`/`req-592efca7` still show failed while `check-completion` reports partial completion with zero failed tasks), so completion gating should continue using both signals.
- Codebase Gaps: No new non-overlapping fallback up/downscale defect found this pass; active decomposed request `req-bd1a59c7` already targets unresolved metadata-aware complexity classification in `resolveFallbackRoutingClass`.
- False Positives: Local branch fallback-router code looked stale versus optimization expectations, but `origin/main` already contains budget-aware routing upgrades and expanded regression coverage; treat local-only drift as non-actionable unless reproduced on `origin/main`.
- Loop 4 iteration 18 (2026-03-13): combining loop-outcome review with `origin/main` parser/schema contradiction checks, a direct executable parser repro, and official OpenAI predicted-outputs docs produced accepted-quality request `req-11a468fb` without overlapping active routing/dependency work.
- Loop 4 iteration 18 (2026-03-13): recurring merge failures on ownership request `req-592efca7` were infrastructure-gated (`npm run build` missing in coordinator/package.json) rather than evidence of unresolved ownership logic; avoid resubmitting ownership scope without fresh `origin/main` contradiction.
- Prompt-aligned gap confirmed on origin/main: complete-task usage normalization in `coordinator/bin/mac10` and `coordinator/src/cli-server.js` only extracts `reasoning_tokens` from `completion_tokens_details` and drops `accepted_prediction_tokens`/`rejected_prediction_tokens`, with no corresponding task columns in schema/db.
- Loop 4 iteration 18 (2026-03-13): when coordinator is offline, `mac10 status` is unavailable and `check-completion` counters can diverge from `loop-requests` completion metadata; treat these as state-observation limitations unless corroborated by source/runtime evidence.
### Loop 6 Iteration 4 (2026-03-13)
- Successful Patterns: Reviewing loop outcomes first and validating contradictions on `origin/main` before drafting kept scope non-overlapping; prior docs parser fix `req-b762f00a` confirms narrow file-anchored architect-doc requests can land quickly.
- Failed Patterns: `loop-request` quality gate suppressed this iteration's submission because the description did not satisfy its strict WHERE/WHY signal parser (`missing concrete file path signal`, `missing production impact/risk signal`) despite line-level evidence; future requests should include plain path tokens and explicit runtime-impact wording.
- Codebase Gaps: `origin/main` still has curation/reset cadence drift in `.claude/commands/architect-loop.md` where counters are triage-based (`triage_count`) but curation text references decomposition-based cadence (`decomposition_count`), conflicting with `.codex` canon and risking mis-timed curation/reset behavior.
- False Positives: None identified in this pass.
### Loop 5 Iteration 11 (2026-03-13)
- Successful Patterns: Starting with `loop-requests --json` and checkpoint-guided `status`/`check-completion` confirmed no unresolved loop-5 failures and prevented overlap with active requests (`req-11a468fb`, `req-bd1a59c7`) before deeper merge-path research.
- Failed Patterns: Submission attempt for the new merge-validation defect was suppressed by loop-request cooldown (`retry_after=48s`), so this iteration could not land the request despite high-confidence evidence.
- Codebase Gaps: `coordinator/src/merger.js` `runOverlapValidation` unconditionally executes `npm run build` while `coordinator/package.json` has no build script and schema default `merge_validation` is `true`; runtime merge_queue rows (`44,46,54,56,58`) show repeated `functional_conflict` failures with `npm error Missing script: "build"`, including tasks where `validation` is null.
- False Positives: Merge failures on `req-592efca7` / `req-a0b3fcce` are not evidence of unresolved ownership logic alone; they are reproducibly infrastructure-induced by hardcoded overlap validation build assumptions.
### Loop 4 Iteration 19 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests --json`) plus checkpoint-directed preflight (`status` and `check-completion`) confirmed req-bd1a59c7 and req-325844b9 are fully done while req-11a468fb remains active, preventing overlap before new research.
- Successful Patterns: High-specificity optimization requests that pair provider guidance with exact ingestion/rendering contradictions continue to complete reliably (recent loop-4 completions: req-bd1a59c7, req-325844b9, req-a30691ab, req-b0fb73e3).
- Failed Patterns: Prior failed loop-4 requests (req-a0b3fcce, req-592efca7) remain dominated by merge validation infrastructure conflicts (`npm run build` missing) rather than weak defect evidence; avoid re-submitting ownership/instruction scope without fresh origin/main contradictions.
- Failed Patterns: loop-request submission can be suppressed by cooldown even with high-confidence evidence (this iteration: retry_after=64s); do not retry in the same iteration.
- Codebase Gaps: On origin/main, `usage_reasoning_tokens` is parsed/persisted (`coordinator/src/cli-server.js`, `coordinator/src/schema.sql`, `coordinator/src/db.js`) but dashboard/popout telemetry chips still omit reasoning-token rendering and tests omit reasoning-token chip assertions (`gui/public/app.js`, `gui/public/popout.js`, `coordinator/tests/dashboard-render.test.js`). This blocks operator visibility needed for reasoning-cost optimization guidance.
- False Positives: Local branch grep initially suggested no usage telemetry surface, but branch `agent-5-task70` is stale; origin/main validation is required before filing.
### Loop 6 Iteration 5 (2026-03-13)
- Successful Patterns: Replaying loop-local outcomes first (`loop-requests --json`) and then drafting with explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE phrasing plus plain file paths passed the quality gate and produced pending request `req-75dbc736` immediately.
- Successful Patterns: Narrow architect-doc parity requests remain high-yield for this prompt scope; previous loop-6 completion `req-b762f00a` confirms file-scoped wording/counter fixes can land quickly.
- Failed Patterns: Using unsupported inspection commands (`codex10 show`) wastes iteration budget; prefer `codex10 history` for request-level context in this runtime.
- Codebase Gaps: `.claude/commands/architect-loop.md` still mixes `triage_count` with `decomposition_count` semantics (counter defined/incremented on triage while curation/reset text references decomposition cadence), diverging from `.codex` canon counter behavior.
- False Positives: None identified in this pass.
### Loop 2 Iteration 21 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, and targeted `check-completion`) confirmed prior loop-2 optimization requests (`req-73dd9f4e`, `req-bd1a59c7`) are fully done and prevented overlap with active merge-validation work (`req-f2ab5d20`).
- Failed Patterns: High-confidence submissions can still be blocked by loop-request cooldown; this iteration's dashboard reasoning/prediction telemetry request was suppressed (`retry_after=17s`), so retry must wait for a later iteration.
- Codebase Gaps: On origin/main, complete-task ingestion/persistence now includes `usage_reasoning_tokens`, `usage_accepted_prediction_tokens`, and `usage_rejected_prediction_tokens` (`coordinator/src/cli-server.js`, `coordinator/src/schema.sql`, `coordinator/src/db.js`, `coordinator/tests/cli.test.js`), but operator task chips in `gui/public/app.js` and `gui/public/popout.js` still render only model/input/output/cached/total/cost usage fields and `coordinator/tests/dashboard-render.test.js` lacks reasoning/prediction chip assertions.
- False Positives: Local branch greps showing no usage telemetry fields are stale-branch noise on `agent-5-task70`; origin/main validation is required before filing UI telemetry gaps.
### Loop 5 Iteration 12 (2026-03-13)
- Successful Patterns: Running loop-local outcome review first (`loop-requests`) and then checking live `status`/`history` prevented duplicate submission; the previously prepared overlap-validation defect is now actively decomposed (`req-f2ab5d20`, task `#67` in progress), so withholding a duplicate request preserved queue quality.
- Failed Patterns: None this iteration.
- Codebase Gaps: No new distinct allocator/merger correctness defect reached high-confidence non-overlapping quality after validating checkpoint targets and active request scopes.
- False Positives: Local workspace/runtime code paths can lag `origin/main` (for example request-reopen/remediation handling in `coordinator/src/cli-server.js` and `coordinator/src/watchdog.js`), so local-only contradictions must be treated as drift unless re-confirmed on `origin/main`.
### Loop 4 Iteration 20 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests --json`) plus checkpoint-guided preflight (`status`, `check-completion`) and `origin/main` source validation isolated a non-overlapping optimization-visibility gap and produced request `req-538c1258`.
- Failed Patterns: Historical loop-4 failures (`req-592efca7`, `req-a0b3fcce`) still trace to merge validation infrastructure (`npm run build` missing) rather than weak defect evidence; avoid resubmitting ownership/instruction scope without fresh source contradictions.
- Failed Patterns: Using shell backticks inside `loop-request` description text triggers command substitution noise; keep evidence file paths unquoted/plain or single-quoted at shell level in future submissions.
- Codebase Gaps: On `origin/main`, ingestion/persistence includes `usage_reasoning_tokens`, `usage_accepted_prediction_tokens`, and `usage_rejected_prediction_tokens`, but `gui/public/app.js` and `gui/public/popout.js` render only usage model/input/output/cached/total/cost chips, and `coordinator/tests/dashboard-render.test.js` lacks reasoning/prediction chip assertions.
- False Positives: Local branch `agent-5-task70` is significantly behind `origin/main`; local greps that show missing usage telemetry rendering/tests are stale-branch noise unless reconfirmed against `origin/main`.
### Loop 6 Iteration 6 (2026-03-13)
- Successful Patterns: Outcome-first review plus checkpoint-targeted parity checks confirmed both loop-6 architect-doc requests (`req-b762f00a` and `req-75dbc736`) completed, reinforcing that narrow WHAT/WHERE architect-instruction fixes are landing reliably.
- Failed Patterns: Submission was `quality_gate`-suppressed for `missing production impact/risk signal (WHY)` even with strong file-level contradiction evidence; future WHY text must include explicit production outage/throughput risk wording.
- Codebase Gaps: `.claude/commands/architect-loop.md` still contradicts tier flow by defining Step 3a as `Tier 1 or Tier 2 — Create Single Task` while the same file and canon mirrors require Tier 1 docs-only direct execution (`tier1_count`/reset semantics).
- False Positives: Signal-wait/file-signaling drift is not present in current `.claude/commands/architect-loop.md`; the file now explicitly requires `mac10 inbox architect --block` and disallows file-based signaling.
### Loop 5 Iteration 13 (2026-03-13)
- Successful Patterns: Outcome review first (`loop-requests`) still shows strong completion rates for loop-5 submissions (`req-325844b9`, `req-a1856410`, `req-13228251`, `req-6d720dd2`, `req-cbf93c49`, `req-6a692107`), and checkpoint-guided preflight (`status`, `check-completion`, `history`) avoided overlap before new research.
- Successful Patterns: Waiting for tracked in-flight work to finish before deeper audit worked; `req-f2ab5d20` is now completed, which unblocked a fresh origin/main merger-path sweep.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: On origin/main, overlap-validation command parsing in `coordinator/src/merger.js` still splits task validation strings on whitespace and executes `file+args` directly, which mis-handles shell-style validation strings used by runtime tasks (for example `cd coordinator && npm test`) and can raise false `functional_conflict` failures.
- False Positives: Local branch `agent-5-task70` differs substantially from origin/main in merger paths; source-level defect checks were anchored to origin/main plus runtime DB evidence to avoid stale-branch drift.
### Loop 2 Iteration 22 (2026-03-13)
- Successful Patterns: Checkpoint-guided preflight (`status`, `check-completion`, `history`) quickly confirmed prior tracked optimization requests (`req-f2ab5d20`, `req-c720b0db`) were fully landed and avoided duplicate resubmission.
- Failed Patterns: Request-level `failed` state remains weak as a root-cause signal (`req-a0b3fcce` still shows failed while `check-completion` reports `5/6 completed` and no failed tasks), so future follow-ups should require direct source/runtime contradiction proof first.
- Codebase Gaps: On `origin/main`, complete-task ingestion/persistence includes `cache_creation_tokens` (`coordinator/src/cli-server.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, `coordinator/tests/cli.test.js`), but dashboard/popout telemetry chips still render only model/input/output/cached/total/cost (`gui/public/app.js`, `gui/public/popout.js`) and `coordinator/tests/dashboard-render.test.js` has no cache-creation chip assertions.
- False Positives: Submitting the cache-creation visibility gap immediately would overlap the active decomposed telemetry request `req-538c1258` (same dashboard/popout render surfaces), so this iteration deferred submission to avoid duplicate scope churn.
### Loop 6 Iteration 7 (2026-03-13)
- Successful Patterns: Reviewing loop outcomes first (`loop-requests`) confirmed completed requests `req-75dbc736` and `req-b762f00a`, reinforcing that narrow architect-instruction parity fixes with explicit file anchors land reliably.
- Successful Patterns: Re-validating the exact contradiction in source plus canon mirrors and writing WHY with explicit backlog/throughput production impact passed the quality gate, producing request `req-31741e74`.
- Failed Patterns: None this iteration.
- Codebase Gaps: `.claude/commands/architect-loop.md` still conflicts with Tier semantics by defining Step 3a as `Tier 1 or Tier 2 — Create Single Task`, contradicting its own counter rules and canon docs that require Tier 1 docs-only direct execution via `tier1-complete`.
- False Positives: None identified; contradiction is present in current checked-in docs, not branch drift.
### Loop 1 Iteration 34 (2026-03-13)
- Successful Patterns: Outcome-first loop review still shows loop-1 requests in completed state with no new loop-local failures, and checkpoint-guided preflight (`status` + targeted `check-completion`) plus origin/main validation avoided overlap before submission.
- Successful Patterns: Single-defect WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE wording with plain file-path anchors and executable repro evidence again passed loop-request gating (`req-4fd2300c`).
- Failed Patterns: None observed this iteration.
- Codebase Gaps: On origin/main, `coordinator/src/cli-server.js` `resolveFallbackRoutingClass` still uses substring checks for `typo` and `refactor` while merge/conflict already use tokenized matching (`hasKeywordToken`), allowing embedded-word false positives that misroute cost/quality tiers.
- False Positives: None newly identified; defect evidence was validated against origin/main source and executable routing-logic repro before submission.
### Loop 4 Iteration 21 (2026-03-13)
- Successful Patterns: Outcome-first preflight with `status` plus targeted `check-completion` confirmed `req-f2ab5d20` is done and `req-592efca7` has all tasks completed despite still showing `integrating`, which prevented duplicate ownership-scope submissions.
- Successful Patterns: A source-anchored parity contradiction (`complete-task` usage telemetry vs `fail-task` telemetry omission) produced accepted request `req-73cd48c8` without overlapping active dashboard or merger scopes.
- Failed Patterns: Treating `integrating` as equivalent to unresolved work is unreliable; merge pipeline lag can leave request status stale after task completion.
- Codebase Gaps: On `origin/main`, `fail-task` still lacks optional usage ingestion/persistence/mail/log parity with `complete-task`, leaving failed-task token/cost telemetry blind.
- False Positives: Workspace DB files diverge by runtime (`.codex/state/codex10.db` vs `.claude/state/mac10.db`), so schema-based runtime conclusions require source parity checks before filing.
### Loop 3 Iteration 22 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests`, `status`, `check-completion`) plus checkpoint-directed verification of tracked requests (`req-fb68a1bd`, `req-a0b3fcce`, `req-592efca7`) prevented duplicate overlap and surfaced a fresh prompt-aligned docs/runtime drift candidate.
- Successful Patterns: Request descriptions that explicitly mirrored WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE with concrete cross-file contradictions passed loop-request gating cleanly (`req-c89dd29d`).
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `.claude/commands/architect-loop.md` still diverges from codex10 canon (`templates/commands/architect-loop.md`, `.codex/docs/master-2-role.md`) on signaling transport and Tier-2 ownership semantics (`mac10`-only block + "Master-3 handles assignment" guidance), risking architect throughput/backlog-drain behavior drift.
- False Positives: Runtime task lifecycle anomaly (`tasks.id=64` marked `ready` with stale completion metadata) is currently partially tolerated by existing lifecycle/idempotency tests, so no submission was made on that signal this iteration.
### Loop 2 Iteration 23 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, `check-completion`, `history`) kept scope non-overlapping while `req-538c1258` was still integrating; anchoring a new request in explicit ingestion-vs-render contradiction evidence produced accepted request `req-182cf465`.
- Failed Patterns: `status=failed` remains an unreliable standalone signal for root cause in this loop (`req-a0b3fcce` still appears failed while recent `check-completion` snapshots show 5/6 completed with 0 failed tasks), so follow-ups should continue requiring direct source/runtime contradictions.
- Codebase Gaps: On `origin/main`, usage ingestion and persistence include `usage_cache_creation_tokens` (`coordinator/src/db.js`, `coordinator/tests/cli.test.js`), but dashboard/popout telemetry readers in `gui/public/app.js` and `gui/public/popout.js` still omit cache-creation token reads/chips, leaving prompt-cache creation spend invisible during optimization triage.
- False Positives: None identified this iteration.
### Loop 6 Iteration 8 (2026-03-13)
- Successful Patterns: Outcome-first review confirmed prior loop-6 submission `req-31741e74` completed; checking request queue before drafting avoided overlapping the already-pending `.claude/commands/architect-loop.md` runtime-control-flow request (`req-c89dd29d`).
- Failed Patterns: `loop-request` can be suppressed by cooldown even with high-confidence evidence (`retry_after=102s` this iteration); do not retry in the same iteration.
- Codebase Gaps: `.claude/docs/master-2-role.md` still drifts from template canon in prompt-aligned control flow: backlog-drain parsing still uses grep-based `\[pending\]` matching and the doc is missing the operational-counter/reset-cadence + staleness procedure blocks present in `templates/docs/master-2-role.md`.
- False Positives: `.claude/commands/architect-loop.md` drift is already covered by pending request `req-c89dd29d`, so additional submissions on that exact file scope would duplicate in-flight work.
### Loop 1 Iteration 35 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, `check-completion`) plus `origin/main` source validation and an executable repro against upstream code produced a new non-overlapping routing telemetry request (`req-23248b06`) aligned to credit-optimization accuracy.
- Failed Patterns: Historical failed request `req-a0b3fcce` remains an infrastructure-failure pattern, not necessarily a defect-quality issue; request `result` shows repeated merge validation failures from `npm run build` missing script (`functional_conflict: Missing script: "build"`).
- Failed Patterns: Shell backticks in `loop-request` payloads trigger command substitution and can strip critical WHAT/WHERE/EVIDENCE tokens from stored descriptions; avoid backticks in future submissions.
- Codebase Gaps: On `origin/main`, fallback budget downscale to spark can choose `model_codex_spark` while still reporting `model_source=budget-downgrade:model_spark` in `fallbackModelRouter.routeTask`, creating routing telemetry/key-attribution drift that can mislead operator credit-tuning.
- False Positives: Local branch routing behavior in `agent-5-task70` differs from `origin/main`; optimization findings should continue to be validated against `origin/main` before submission.
### Loop 3 Iteration 23 (2026-03-13)
- Successful Patterns: Outcome-first checks (`loop-requests`, `status`, `check-completion`) confirmed tracked request progress (`req-c89dd29d` completed; `req-fb68a1bd` still decomposed) before new research, avoiding duplicate overlap.
- Failed Patterns: Loop liveness can change mid-iteration; `loop-request` returned `Loop is stopped, not active`, so future iterations should re-validate heartbeat immediately before submission to avoid wasted request attempts.
- Codebase Gaps: Active architect loop prompt (`loop-prompt 3`) still carries grep-based Step 2a pending parsing from `.claude/commands/architect-loop.md` (`pending_count`/`oldest_pending_id`), while codex canon uses anchored request-row awk predicates; repro shows old parser misclassifies rows containing literal `[pending]` in description (`old_count=2`, `old_oldest=req-old` vs expected `new_count=1`, `new_oldest=req-new`).
- False Positives: `.claude/docs/master-2-role.md` remains substantially stale versus `.codex/docs/master-2-role.md`, but current architect loop prompt sources `.codex/docs/master-2-role.md`, so docs drift alone was not submitted this iteration.
### Loop 7 Iteration 1 (2026-03-13)
- Successful Patterns: Outcome-aware preflight (`status`, prior findings, and source-path verification) isolated a non-overlapping prompt-scope defect with concrete propagation evidence (`setup.sh` template refresh path) before submission.
- Failed Patterns: `loop-request` quality gate suppressed this iteration because WHAT did not start with an explicit concrete change verb (`missing concrete change verb (WHAT)`); future submissions should lead WHAT with imperative verbs such as Fix/Replace/Update.
- Codebase Gaps: `templates/commands/architect-loop.md` and `.claude/commands/architect-loop.md` Step 2a still use grep-based `[pending]` parsing (`pending_count` and `oldest_pending_id`) while `.codex/commands-codex10/architect-loop.md` uses anchored request-row awk parsing; repro confirms grep parser miscounts and selects a completed row when descriptions contain `[pending]`. Because `setup.sh` refreshes `.codex/commands-codex10` from `templates/commands`, stale template logic can regress fresh setup/reset behavior.
- False Positives: None identified; contradiction is present in current checked-in files with executable parser repro.
### Loop 7 Iteration 2 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, and request-history checks for `req-31dab37b`, `req-b762f00a`, `req-c89dd29d`) confirmed no active overlap and isolated a still-open Step 2a parser drift in command templates.
- Failed Patterns: `loop-request` was suppressed again for `missing concrete change verb (WHAT)` even with a WHAT sentence starting with Replace; next iteration should use an explicit `Fix ...` opener and keep the first clause short before details.
- Codebase Gaps: `templates/commands/architect-loop.md` and `.claude/commands/architect-loop.md` still use grep-based `[pending]` matching in Step 2a (`pending_count` and `oldest_pending_id`), while `.codex/commands-codex10/architect-loop.md` and `.codex/commands/architect-loop.md` already use anchored request-row awk parsing. Repro remains: old parser returns `old_count=2`/`old_oldest=req-old` vs anchored parser `new_count=1`/`new_oldest=req-new` on mixed-status rows containing literal `[pending]` in description text.
- Codebase Gaps: `setup.sh` lines 155-156 always copy `templates/commands/*.md` into `.codex/commands-codex10`, so stale template parsing can repopulate codex10 prompt regressions after setup/reset.
- False Positives: None identified this iteration.
### Loop 7 Iteration 3 (2026-03-13)
- Successful Patterns: Re-validating current source state before submission (not relying on prior completed request status) exposed a real regression and produced accepted request `req-e192d2fb` on first attempt with explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE wording.
- Successful Patterns: Including an executable parser repro (`old_count=3 old_oldest=req-old` vs `new_count=1 new_oldest=req-new`) and propagation path evidence (`setup.sh` template refresh) strengthened quality-gate acceptance.
- Failed Patterns: `loop-requests` may return no rows for this loop even when prior iterations logged suppressed submissions in checkpoints; treat checkpoint FAILED notes as supplemental context for gate tuning.
- Codebase Gaps: `templates/commands/architect-loop.md` and `.claude/commands/architect-loop.md` still use grep-based `\[pending\]` matching in Step 2a while `.codex/commands-codex10/architect-loop.md` and `.codex/commands/architect-loop.md` already use anchored status-column parsing.
- Codebase Gaps: `setup.sh` refresh path (`lines 154-157`) copies `templates/commands/*.md` into `.codex/commands-codex10` on setup/reset, so stale template parser logic can reintroduce backlog-drain misclassification.
- False Positives: None identified; contradiction and repro both matched current checked-in files.
### Loop 7 Iteration 4 (2026-03-13)
- Successful Patterns: Outcome-first review plus checkpoint-directed follow-up (`loop-requests`, `check-completion` on `req-e192d2fb`) confirmed the prior parser-drift request landed before new research, preventing duplicate submissions.
- Successful Patterns: Cross-mirror parity checks with direct `sha256sum` + `diff -u` across `templates/commands/architect-loop.md`, `.codex/commands{-codex10}/architect-loop.md`, and `.claude/commands/architect-loop.md` quickly validated that command-loop counter/reset/staleness drift is now resolved.
- Failed Patterns: None this iteration.
- Codebase Gaps: `.claude/docs/master-2-role.md` remains stale versus `templates/docs/master-2-role.md` / `.codex/docs/master-2-role.md` (legacy raw `mac10` command table, grep-based backlog parser, missing operational counters and executable staleness procedure).
- False Positives: Current architect runtime prompt sources `.codex/docs/master-2-role.md` (`templates/.codex/.claude` command mirrors all `cat .codex/docs/master-2-role.md`), and no non-markdown runtime references to `.claude/docs/master-2-role.md` were found; doc drift was treated as non-runtime this iteration and not submitted.
### Loop 12 Iteration 1 (2026-03-13)
- Successful Patterns: Prompt-scoped allocator research with direct source parity checks (`templates` vs `.codex` mirrors) plus setup propagation validation (`setup.sh` copy paths) produced a concrete, non-overlapping regression request accepted on first submission (`req-0baabb72`).
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `templates/commands/allocate-loop.md` and `templates/docs/master-3-role.md` still contain deprecated `.codex10.task-signal`/`.codex10.fix-signal`/`.codex10.completion-signal` wait/watch guidance while codex mirrors already use mailbox blocking; `setup.sh` overwrites `.codex/commands-codex10` and `.codex/docs` from templates on each setup, so stale template text can repopulate allocator wake-up regressions.
- False Positives: Prior completed request `req-6d720dd2` did not eliminate this gap in current source state; recheck confirms present-day regression rather than historical stale evidence.
### Loop 9 Iteration 1 (2026-03-13)
- Successful Patterns: Outcome-aware preflight with `status` plus `origin/main` parity checks and direct request-history verification (`history` + `check-completion`) exposed a concrete false-completion contradiction and produced accepted request `req-d5612788`.
- Failed Patterns: Local working branch (`agent-5-task70`) is behind current integrations for merger validation logic, so local-only reads can be stale-branch noise unless reconfirmed on `origin/main`.
- Codebase Gaps: Optimization telemetry for `usage_reasoning_tokens`, `usage_accepted_prediction_tokens`, and `usage_rejected_prediction_tokens` remains absent from `gui/public/app.js`, `gui/public/popout.js`, and `coordinator/tests/dashboard-render.test.js` even though request `req-538c1258` is marked completed.
- False Positives: Repeated `functional_conflict: npm run build` failures in runtime status are explained by local branch/runtime drift because `origin/main` merger logic now dynamically selects default validation commands and parses task validation commands safely.
### Loop 13 Iteration 1 (2026-03-13)
- Successful Patterns: Prompt-scope source contradiction plus executable signal-wait repro produced a concrete high-confidence request (`req-9668b77b`) in one pass.
- Failed Patterns: None this iteration.
- Codebase Gaps: Architect loop prompt mirrors currently block twice on the same handoff signal each iteration (`Step 1` and `Step 6` in `.codex/commands-codex10/architect-loop.md`, `.codex/commands/architect-loop.md`, `templates/commands/architect-loop.md`, `.claude/commands/architect-loop.md`), introducing avoidable triage latency after signal consumption.
- False Positives: None identified in this iteration.
### Loop 11 Iteration 1 (2026-03-13)
- Successful Patterns: Updating remote refs first (`git fetch origin main`) and validating against `origin/main` before drafting prevented stale-branch false positives and produced an accepted single-scope request (`req-c5dbd414`) with explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE phrasing.
- Failed Patterns: None this iteration.
- Codebase Gaps: `origin/main` dashboard and popout task telemetry currently expose raw usage chips (`in`, `out`, `cached`, `cache-create`, `total`, `cost`) but no derived cache-hit ratio chip, and `coordinator/tests/dashboard-render.test.js` lacks ratio assertions; this limits cache-effectiveness monitoring called out in current prompt-caching guidance.
- False Positives: Local branch `agent-5-task70` is behind `origin/main` for multiple telemetry paths, so local-only contradictions should be treated as drift unless revalidated on `origin/main`.
### Loop 10 Iteration 1 (2026-03-13)
- Successful Patterns: Combining runtime queue evidence (`codex10 status`, `codex10 merge-status`) with coordinator logs (`codex10 log ... coordinator`) and direct source anchors (`coordinator/src/merger.js`, `coordinator/package.json`) produced a high-confidence, non-speculative regression request accepted immediately as `req-002e6542`.
- Failed Patterns: None observed in this iteration.
- Codebase Gaps: `coordinator/src/merger.js` `runOverlapValidation` still hardcodes `npm run build` and token-splits string validations; active merges continue failing with `Missing script: "build"` despite project scripts only defining `start` and `test`, causing repeated functional-conflict remediation loops.
- False Positives: `origin/main` contains newer overlap-validation handling, but this runtime is executing a different branch state; findings were anchored to live runtime logs plus current source to avoid stale-branch mismatch.
### Loop 8 Iteration 1 (2026-03-13)
- Successful Patterns: Prompt-aligned quality-gate research with an executable repro (`./.codex/scripts/codex10 loop-request $MAC10_LOOP_ID "Replace ..."`) exposed a concrete suppression contradiction and produced accepted request `req-da6b5b65` in one submission.
- Failed Patterns: A high-signal loop-request using `Replace` with valid WHERE/WHY signals was suppressed as `quality_gate` with `missing concrete change verb (WHAT)`, indicating verb-allowlist brittleness.
- Codebase Gaps: `coordinator/src/db.js` `LOOP_REQUEST_WHAT_SIGNAL_RE` omits common concrete verbs (`replace`, `sync`, `align`, `extend`, `improve`), so optimization requests can be rejected before dedup/rate-limit logic despite containing file-path anchors and production-risk impact.
- False Positives: Runtime `functional_conflict: npm run build` signals in this branch are stale-branch drift versus `origin/main`, where `coordinator/src/merger.js` already includes script-aware default validation selection and shell-aware task validation parsing.
### Loop 7 Iteration 5 (2026-03-13)
- Successful Patterns: Reviewing loop-scoped outcomes first (`loop-requests`) and validating active scope with `status` + `history req-9668b77b` prevented duplicate submission while prior loop request `req-e192d2fb` remained confirmed completed.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: No net-new non-overlapping runtime-impacting architect prompt-contract contradiction found; the remaining high-signal drift (duplicate handoff wait in `templates/commands/architect-loop.md` and `.claude/commands/architect-loop.md`) is already tracked by active decomposed request `req-9668b77b`.
- False Positives: `.claude/docs/master-2-role.md` remains stale versus template/codex docs, but command/runtime references continue to source `.codex/docs/master-2-role.md`; no executable runtime reader path for `.claude/docs/master-2-role.md` was found.
### Loop 13 Iteration 2 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests`, `status`, `check-completion req-9668b77b`) prevented duplicate submission while prior request remained decomposed with an open task (`#88`).
- Successful Patterns: Mirror parity checks (`sha256sum` + `diff`) across `.codex/commands{-codex10}/architect-loop.md`, `templates/commands/architect-loop.md`, and `.claude/commands/architect-loop.md` quickly isolated setup/reset propagation risk evidence.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: Current codex architect-loop mirrors already use single-wait flow (adaptive wait in Step 1, Step 6 loops back), but template/claude mirrors still include a second Step 6 wait; `setup.sh` always refreshes `.codex/commands-codex10` from `templates/commands`, so setup/reset can reintroduce duplicate handoff waits.
- False Positives: This contradiction is already covered by active decomposed request `req-9668b77b` (task `#88` ready), so no new request was submitted to avoid overlap churn.
### Loop 10 Iteration 2 (2026-03-13) — Outcome Review
- Successful Patterns: Prior loop request `req-002e6542` moved to `completed`; a single-defect request anchored to live merge-status/log evidence and exact file/function references remained high-signal and executable.
- Failed Patterns: None observed from loop-10 request history in this review step.
- Codebase Gaps: Outcome review only; deeper source-level gap analysis continued in this iteration.
- False Positives: None identified during outcome review.
### Loop 12 Iteration 2 (2026-03-13)
- Successful Patterns: Loop-scoped outcome preflight (`loop-requests --json` + `check-completion req-0baabb72`) confirmed no completed/failed deltas before new research and prevented duplicate follow-up while `req-0baabb72` remained decomposed.
- Successful Patterns: Pairing runtime mailbox evidence (`.codex/state/codex10.db` allocator `merge_failed` payload-key inspection) with source review in `coordinator/src/watchdog.js` and `coordinator/src/merger.js` produced a concrete allocator-mail contract defect candidate.
- Failed Patterns: Local-only contradictions can be stale branch drift (example: `inbox master-3` alias mismatch in current branch) unless revalidated against `origin/main`.
- Codebase Gaps: `recoverStaleIntegrations` Case 4 in `coordinator/src/watchdog.js` emits allocator `merge_failed` mail with only `{request_id,error}` while other merge escalation paths include task/branch context required for targeted fix-task routing.
- False Positives: `master-3` inbox alias support looked broken locally but is already implemented on `origin/main` (`normalizeInboxRecipient` in `coordinator/src/cli-server.js` and `coordinator/bin/mac10`).
### Loop 9 Iteration 2 (2026-03-13)
- Successful Patterns: Reviewing loop-scoped outcomes first showed `req-d5612788` completed; pairing checkpoint-guided status checks with an origin/main source contradiction and executable render-harness repro produced accepted request `req-b3206ea6` in one pass.
- Failed Patterns: Local runtime branch inspection alone was initially misleading for telemetry/test coverage; validating on `origin/main` remains necessary before submission.
- Codebase Gaps: `origin/main` dashboard budget summary parsing in `gui/public/app.js` treats wrapped `routing_budget_state` payloads (`source`/`parsed`/`remaining`/`threshold`) as opaque objects and renders `keys: source, parsed, remaining` instead of constrained or healthy budget state.
- False Positives: `req-a0b3fcce` and `req-592efca7` still report failed statuses with active remediation tasks, but this iteration avoided resubmitting merge-validation conflict scope because active fixes are already in flight.
### Loop 11 Iteration 2 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests --json`, `status`) and `origin/main` source validation avoided overlap with active dashboard telemetry work (`req-c5dbd414`) while narrowing scope to remaining `web-server.js` budget-alert telemetry coverage.
- Failed Patterns: `loop-request` was suppressed by quality gate (`missing production impact/risk signal (WHY)`) even with concrete WHAT/WHERE/EVIDENCE; future submissions should state an explicit operational failure path (for example delayed overspend detection causing late routing-budget intervention) in the WHY clause.
- Codebase Gaps: On `origin/main`, `coordinator/src/web-server.js` `buildStatePayload` exposes `routing_budget_state` and `routing_budget_source` but no rolling spend or burn-rate aggregates, despite `tasks` persisting `usage_cost_usd` and `completed_at` in `coordinator/src/schema.sql`, leaving budget-alert workflows dependent on manual reconstruction.
- False Positives: None identified this iteration.
### Loop 10 Iteration 2 (2026-03-13) — Research + Submission
- Successful Patterns: Checkpoint-directed overlap preflight plus mirror parity verification (scripts vs .codex copy) and a live parser repro produced a non-overlapping high-confidence request accepted immediately as `req-07ef293b`.
- Successful Patterns: Rechecking loop-10 history before submission showed `req-002e6542` completed, preventing duplicate overlap with already-landed merger work.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `scripts/loop-sentinel.sh` still uses legacy ACTIVE_COUNT grep parsing while `.codex/scripts/loop-sentinel.sh` uses structured `loop-requests --json` parsing; `setup.sh` currently copies the stale source script into `.codex/scripts`, so setup/reset can regress the active-request precheck and respawn loops unnecessarily.
- False Positives: Template/runtime drift in architect-loop wait semantics was observed but not submitted because active request `req-9668b77b` already covers that scope.
### Loop 8 Iteration 2 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`) avoided overlap with active work (`req-da6b5b65`, `req-c5dbd414`) before deeper research.
- Successful Patterns: Pairing direct source contradiction (`coordinator/src/db.js` fixed `retry_after_sec: 3600` on rate limit) with an isolated executable Node repro produced accepted request `req-7a344cb6`.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `coordinator/src/db.js` `createLoopRequest` hardcodes `retry_after_sec: 3600` when `loop_request_max_per_hour` is reached instead of calculating time until the oldest in-window request exits the 1-hour window; repro with requests at `now-59m` and `now-10m` returned `retry_after_sec=3600` while expected retry was ~60s.
- Codebase Gaps: `set-config` in `coordinator/src/cli-server.js` still blocks loop quality/rate tuning keys (`loop_request_quality_gate`, `loop_request_min_description_chars`, `loop_request_min_interval_sec`, `loop_request_max_per_hour`, `loop_request_similarity_threshold`), limiting runtime control of quality-vs-credit throughput.
- False Positives: `origin/main` currently lacks local loop quality-gate enhancements entirely, so this iteration anchored submission decisions to active runtime branch behavior rather than upstream parity.
### Loop 7 Iteration 6 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, `check-completion`) plus mirror parity checks (`rg`, `sha256sum`, `diff -u`) quickly confirmed whether architect-loop drift was net-new or already tracked.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: No new non-overlapping runtime-impacting architect prompt-contract contradiction found; remaining duplicate handoff-wait drift stays within active request `req-9668b77b` scope (`templates/.claude` mirrors).
- False Positives: `check-completion` reporting ALL DONE while request status is `integrating` appeared suspicious at first, but the same pattern exists on another integrating request (`req-c5dbd414`), so this was treated as non-actionable without stronger contradiction evidence.
### Loop 13 Iteration 3 (2026-03-13)
- Successful Patterns: Checkpoint-driven preflight (`loop-requests`, `status`, `check-completion req-9668b77b`) prevented duplicate submission while the existing architect-loop parity request remained active.
- Successful Patterns: Fast mirror fingerprinting (`sha256sum` + targeted `diff -u`) isolated that current command drift is still the same duplicate-wait contradiction already covered by `req-9668b77b`.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: No new non-overlapping architect-loop directive contradiction (triage/backlog/decomposition/curation/reset/signal-wait) was verified beyond active request scope.
- False Positives: `check-completion req-9668b77b` reported "ALL DONE" while request status stayed `integrating`; treated as non-actionable because task completion and request merge-state are different lifecycle stages in current coordinator behavior.
### Loop 9 Iteration 3 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, targeted `check-completion`) plus `origin/main` source validation kept research non-overlapping and confirmed that prior loop request `req-d5612788` completion style (single-defect, file-anchored WHAT/WHERE/WHY/EVIDENCE) remains effective.
- Failed Patterns: `loop-request` submission on popout budget-state parity was suppressed by quality gate with `missing production impact/risk signal (WHY)`; future submissions should include an explicit operational failure path (for example delayed budget-pressure reaction causing spend overshoot) in addition to observability wording.
- Codebase Gaps: `origin/main` serves `routing_budget_state`/`routing_budget_source` in `/api/status` and `gui/public/app.js` renders constrained/healthy budget summary, but `gui/public/popout.js` task panel has no budget-state parsing/render path, leaving popout operators without budget-pressure context.
- False Positives: Local runtime branch (`agent-5-task70`) remains far behind `origin/main`; budget telemetry symbols missing locally were treated as drift and not used as primary evidence.
### Loop 8 Iteration 3 (2026-03-13)
- Successful Patterns: Checkpoint-guided focus on remaining scope plus direct source/CLI contradiction checks (`coordinator/src/db.js`, `coordinator/src/cli-server.js`, and `./.codex/scripts/codex10 set-config ...`) produced a concrete optimization candidate quickly.
- Failed Patterns: Submission was suppressed by cooldown (`loop-request` returned `retry_after=127s`) even with high-confidence WHAT/WHERE/WHY/EVIDENCE content; defer without same-iteration retry.
- Codebase Gaps: `coordinator/src/cli-server.js` `set-config` allowlist still excludes loop quality/throughput keys (`loop_request_quality_gate`, `loop_request_min_description_chars`, `loop_request_min_interval_sec`, `loop_request_max_per_hour`, `loop_request_similarity_threshold`) that `coordinator/src/db.js` `createLoopRequest` actively reads, blocking runtime tuning for quality-vs-credit optimization.
- False Positives: None identified; contradiction is backed by executable CLI output (`Key 'loop_request_min_interval_sec' is not configurable`) and source parity checks.
### Loop 10 Iteration 3 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests`) plus checkpoint-directed remaining-area focus produced a concrete loop-lifecycle contradiction with executable CLI + DB evidence before submission.
- Failed Patterns: `loop-request` suppression occurs when WHY text does not match `LOOP_REQUEST_WHY_SIGNAL_RE`; include explicit keywords (for example `regression`, `incorrect`, `error`, `stability`, or `risk`) as standalone terms to pass quality gate.
- Codebase Gaps: `coordinator/src/cli-server.js` allows `loop-checkpoint` to mutate `iteration_count` and `last_checkpoint` even when loop status is `stopped`; same file updates `last_heartbeat` during `loop-heartbeat` for stopped loops before returning stopped status.
- False Positives: None identified in this iteration.
- Successful Patterns: Loop-local outcome review now shows `req-da6b5b65` completed; narrow single-defect quality-gate fixes with explicit file anchors continue to land reliably for this loop.
### Loop 7 Iteration 7 (2026-03-13)
- Successful Patterns: Outcome-first follow-up (`loop-requests`, `status`, `check-completion req-9668b77b`) confirmed prior architect-loop request closure before new research and avoided duplicate-in-flight overlap.
- Successful Patterns: Direct mirror fingerprinting (`sha256sum` + `diff -u`) across `.codex/commands-codex10/architect-loop.md`, `templates/commands/architect-loop.md`, and `.claude/commands/architect-loop.md` quickly exposed remaining non-parity drift with exact Step-1/Step-6 anchors.
- Failed Patterns: `loop-request` submission was suppressed by quality gate (`missing production impact/risk signal (WHY)`), and inline backticks in the shell command caused command substitution noise (`signal-wait: command not found`); future submissions should avoid backticks and state explicit operational risk (for example delayed triage/backlog drain after setup resets).
- Codebase Gaps: `templates/commands/architect-loop.md` and `.claude/commands/architect-loop.md` still use Step 1 fixed `signal-wait ... 15` plus Step 6 adaptive blocking wait, while `.codex/commands-codex10/architect-loop.md` uses adaptive wait in Step 1 and non-blocking Step 6 continuation.
- Codebase Gaps: `setup.sh` lines 154-157 always copy `templates/commands/*.md` into `.codex/commands-codex10`, so stale template control flow can overwrite the active codex10 architect prompt on setup/reset.
- False Positives: None identified; drift and propagation path were verified directly in current checked-in files.
### Loop 13 Iteration 4 (2026-03-13) — Outcome Review
- Successful Patterns: Loop-scoped outcome review showed prior request `req-9668b77b` moved to `completed`; narrow architect-loop contradiction submissions with exact mirror file anchors continue to complete reliably.
- Failed Patterns: None observed from loop-13 request history in this review.
- Codebase Gaps: Outcome review only; deeper architect triage/backlog/decomposition/reset/signal research continued in this iteration.
- False Positives: None identified during outcome review.
### Loop 12 Iteration 3 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests --json`, `status`, `check-completion`) confirmed `req-0baabb72` already completed and captured `req-9802198b` completion during the same iteration, preventing duplicate submissions on already-resolved merge_failed payload scope.
- Failed Patterns: Submitting `loop-request` descriptions with unescaped backticks in shell command strings causes command substitution and payload corruption (created malformed pending request `req-0c50ff41`); use single-quoted/here-doc-safe payload composition for loop submissions.
- Codebase Gaps: Allocator loop guidance still references nonexistent `request_ready_to_merge` signals and uses `inbox allocator --block` without explicit timeout, while runtime producers are `tasks_available`, `tasks_ready`, `task_completed`, `task_failed`, `merge_failed`, and `functional_conflict`; default block timeout remains 300000ms.
- False Positives: Local branch still showed pre-fix template signal-wait lines, but `origin/main` templates already reflect mailbox-blocking guidance; treated as branch drift rather than a new regression.
### Loop 13 Iteration 4 (2026-03-13) — Research + Submission
- Successful Patterns: Checkpoint-directed parity audit (`sha256sum` + `diff -u`) across `.codex/commands-codex10/architect-loop.md`, `templates/commands/architect-loop.md`, and `.claude/commands/architect-loop.md` exposed a concrete post-merge propagation regression and produced accepted request `req-7ec89473`.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `templates/commands/architect-loop.md` and `.claude/commands/architect-loop.md` still use stale dual-wait flow (fixed 15s wait in Step 1 plus adaptive wait in Step 6), while active codex mirrors use adaptive Step 1 and Step 6 loop continuation; `setup.sh` lines 154-157 always refresh `.codex/commands-codex10` from templates, so setup/reset can reintroduce stale signal-wait behavior.
- False Positives: `.claude/docs/master-2-role.md` remains hash-drifted from `templates/.codex` docs, but this iteration did not find an executable architect-loop runtime path consuming that file for codex loop execution.
### Loop 8 Iteration 4 (2026-03-13)
- Successful Patterns: Outcome-first review plus checkpoint-directed follow-up on the deferred set-config contradiction, validated with direct source anchors and an executable CLI repro, produced accepted request req-21b08fe3 in one submission.
- Successful Patterns: Prior loop request req-da6b5b65 is now completed; narrowly scoped loop quality-gate/control-plane fixes with explicit WHAT/WHERE/WHY/EVIDENCE continue to land for loop 8.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: coordinator/src/cli-server.js set-config allowlist still omits loop_request_quality_gate, loop_request_min_description_chars, loop_request_min_interval_sec, loop_request_max_per_hour, and loop_request_similarity_threshold even though coordinator/src/db.js createLoopRequest reads these keys and coordinator/src/schema.sql seeds them.
- False Positives: None identified; contradiction is verified by source and executable output from ./.codex/scripts/codex10 set-config loop_request_min_interval_sec 10 returning Key not configurable.
### Loop 12 Iteration 4 (2026-03-13)
- Successful Patterns: Outcome-first review plus live task inspection (`loop-requests --json`, `check-completion`, `my-task`) avoided duplicate resubmission because malformed request `req-0c50ff41` was already decomposed into clean task 106 with scoped requirements.
- Failed Patterns: `loop-request` was suppressed by quality gate (`missing concrete change verb (WHAT)`) when WHAT started with `Re-land`; prefer allowlisted imperative verbs like `Fix`, `Update`, `Add`, or `Remove` at WHAT start.
- Codebase Gaps: `templates/docs/master-3-role.md` and `.claude/docs/master-3-role.md` remain drifted from `.codex/docs/master-3-role.md` (stale signal-file watch, launch-worker step, and no bounded inbox block timeout example). `setup.sh` lines 172-174 always copy `templates/docs/*.md` into `.codex/docs`, so stale template docs can overwrite allocator runtime guidance after setup/reset.
- False Positives: Prior malformed loop request payload (`req-0c50ff41`) looked like it might require immediate resubmission, but architect decomposition already normalized intent into executable task 106.
### Loop 11 Iteration 4 (2026-03-13)
- Successful Patterns: Outcome-first loop preflight (`loop-requests` + `status`) confirmed `req-c5dbd414` completed while `req-cd576590` remained decomposed, then `origin/main` source validation with explicit production-risk WHY wording produced accepted request `req-6bf0f470` in one submission.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `origin/main` persists `tasks.usage_cost_usd` and `tasks.completed_at`, but `/api/status` (`coordinator/src/web-server.js` `buildStatePayload`) still returns only tasks and routing budget snapshot without rolling spend/burn-rate aggregates, forcing manual reconstruction from task rows.
- False Positives: Local branch `agent-5-task70` remains behind `origin/main`; local-only telemetry contradictions were treated as drift unless revalidated on `origin/main`.
### Loop 7 Iteration 8 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, and targeted `check-completion`) confirmed prior loop-7 submission `req-e192d2fb` completed and exposed active overlap (`req-7ec89473` decomposed), preventing duplicate architect-loop mirror requests.
- Failed Patterns: Treating local task-branch CLI help output as authoritative is unreliable; local `coordinator/bin/mac10` still omits `claim-worker`/`release-worker` in help text, but `origin/main` already contains the help-surface fix, so submission would have been branch-drift duplicate noise.
- Codebase Gaps: No new non-overlapping Master-2 prompt defect found with confidence >= 0.85 this iteration; active request `req-7ec89473` already covers the architect-loop mirror regression scope from the prior checkpoint.
- False Positives: `.claude/docs/master-2-role.md` backlog-parser drift remains stale, but current codex architect runtime prompt path uses `.codex` docs/commands; without a live runtime reader path, `.claude` doc drift alone remains non-actionable for this loop.
### Loop 7 Iteration 9 (2026-03-13) — Outcome Review
- Successful Patterns: `loop-requests` plus checkpoint-completed IDs showed prior submissions (`req-e192d2fb`, `req-07ef293b`) landing when scoped to one architect prompt/runtime contradiction with exact file anchors.
- Failed Patterns: None observed in this outcome review (`FAILED: none`).
- Codebase Gaps: Outcome review only; deeper contradiction research continued in this iteration.
- False Positives: `loop-requests` text output truncates long descriptions, so checkpoint completion fields remain the reliable fallback for result attribution.
### Loop 8 Iteration 5 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, `check-completion`) confirmed loop-8 prior completion (`req-da6b5b65`) and active overlap (`req-21b08fe3`, `req-7a344cb6`) before deeper research, keeping scope non-duplicative.
- Successful Patterns: Validating candidate contradictions against `origin/main` prevented a stale local-branch false positive on fallback `model_source` inversion that was already fixed by completed request `req-16bdcac3`.
- Failed Patterns: `loop-request` submission was suppressed by cooldown (`retry_after=32s`) despite high-confidence WHAT/WHERE/WHY/EVIDENCE; defer and retry in a later iteration instead of resubmitting immediately.
- Codebase Gaps: `origin/main` main dashboard renders budget-state indicator (`gui/public/app.js` `renderBudgetIndicator`/`getBudgetSnapshot`), but popout task rendering in `gui/public/popout.js` has no budget indicator/parser path and tests only cover usage chips (`coordinator/tests/dashboard-render.test.js` popout suite), leaving constrained-vs-healthy budget context missing in popout operations.
- False Positives: Local branch `agent-5-task70` still contains previously fixed fallback-routing telemetry logic; treated as branch drift after `origin/main` verification and not submitted.
### Loop 12 Iteration 5 (2026-03-13)
- Successful Patterns: Outcome-first review with `loop-requests --json` plus `check-completion` avoided overlap and confirmed prior loop-12 requests (`req-0baabb72`, `req-9802198b`, `req-0c50ff41`) were completed before new submission.
- Successful Patterns: Verifying malformed request scope via task metadata (`tasks` row for `req-0c50ff41`) prevented duplicate allocator-loop submission and enabled a distinct master-3 role-doc mirror defect request (`req-8f60e568`).
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `templates/docs/master-3-role.md` and `.claude/docs/master-3-role.md` still drift from `.codex/docs/master-3-role.md`; template still documents deprecated signal-file waits/manual worker launch while current codex doc uses mailbox-blocking allocator wake flow.
- Codebase Gaps: `setup.sh` copies `templates/docs/*.md` into `.codex/docs`, so stale template master-3 guidance can be reintroduced after setup/reset.
- False Positives: `status` still listed `req-0c50ff41` as integrating earlier in the cycle, but loop-scoped JSON/history showed it completed; treated as lifecycle visibility lag, not a new defect submission.
### Loop 7 Iteration 9 (2026-03-13) — Research + Submission
- Successful Patterns: Checkpoint-directed preflight (`status`, `check-completion req-7ec89473`, `check-completion req-7a344cb6`) prevented overlap and confirmed only one tracked request remains integrating.
- Failed Patterns: None observed in this pass.
- Codebase Gaps: No new non-overlapping Master-2 prompt/runtime contradiction on `origin/main` met confidence >= 0.85 this iteration.
- False Positives: Local branch mirror/help drift (`.codex/commands-codex10` hash mismatch and missing `claim-worker`/`release-worker` in local help output) is branch-specific; `origin/main` has synchronized architect-loop command mirrors and current help entries.
### Loop 11 Iteration 5 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests` + `check-completion`) confirmed `req-cd576590` completed and active overlap (`req-6bf0f470`), then combining Anthropic optimization-doc evidence with `origin/main` parser/schema/UI line-level contradictions produced accepted request `req-dd86c6d4` in one submission.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `origin/main` accepts Anthropic `usage.cache_creation.{ephemeral_5m_input_tokens,ephemeral_1h_input_tokens}` but folds them into a single `usage_cache_creation_tokens` value (`coordinator/src/cli-server.js`, `coordinator/bin/mac10`), with no dedicated schema/UI fields for TTL-specific visibility despite prompt-caching docs showing different 5m vs 1h write pricing.
- False Positives: Local branch telemetry gaps were treated as stale drift and excluded unless revalidated on `origin/main`.
### Loop 9 Iteration 5 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests` + targeted `check-completion`) confirmed prior loop-9 requests (`req-b3206ea6`, `req-d5612788`) completed and prevented overlap before new research.
- Successful Patterns: Anchoring the submission in an executable logic repro plus `origin/main` function-level contradictions (budget parser shape handling) produced accepted request `req-20145841` on first submission.
- Failed Patterns: Prior checkpoint `FAILED` labeling for `req-592efca7` was stale in this iteration context; `check-completion` reported `18/20 completed, 0 failed`, so request `status` alone remains non-authoritative during remediation/integration churn.
- Codebase Gaps: In `origin/main`, `coordinator/src/cli-server.js` `parseBudgetStateConfig` and `coordinator/src/web-server.js` `parseJsonObject` accept JSON arrays as valid budget objects; malformed `routing_budget_state` values like `[]` can bypass scalar fallback thresholds and disable budget-driven routing shifts.
- False Positives: TTL-specific cache-creation visibility looked like a candidate in this pass, but shared findings already tracked and submitted that scope as `req-dd86c6d4`, so it was not re-submitted.
### Loop 8 Iteration 6 (2026-03-13)
- Successful Patterns: Outcome-first review with `loop-requests --json` exposed one completion (`req-da6b5b65`), one integration overlap (`req-21b08fe3`), and one failure (`req-7a344cb6`), which prevented overlapping resubmission.
- Successful Patterns: Re-validating candidate gaps against `origin/main` filtered out stale local drift before submission decisions.
- Failed Patterns: `req-7a344cb6` remained failed due integration-side merge/validation conflicts (`functional_conflict`/`git fetch` lock churn), so reusing the same request scope immediately would likely produce low-signal retry noise.
- Codebase Gaps: Local runtime still emits repeated `overlap_validation_failed` events from unconditional `npm run build` execution in `coordinator/src/merger.js` while `coordinator/package.json` has no `build` script; activity_log IDs 7796/7797 and 7744/7745 show this failure path causing functional-conflict escalation and wasted merge throughput.
- False Positives: Popout budget-indicator parity and overlap-validation default-command gaps are already addressed on `origin/main`; local contradictions were treated as branch drift and not re-submitted this iteration.
### Loop 10 Iteration 6 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, `check-completion`) confirmed `req-2a6156eb` completed while `req-05a42584` (`0/1`) and `req-21b08fe3` (`1/2`) remain active, preventing overlap with in-flight scopes.
- Successful Patterns: Isolated temp-DB execution against `coordinator/src/db.js` `createLoopRequest` produced concrete numeric evidence (`oldest retry_in_sec=60` vs returned `retry_after_sec=3600`) before any submission attempt.
- Failed Patterns: Submission was suppressed by runtime throughput guard (`Loop request suppressed: rate_limit retry_after=3600s`); when this branch is at loop hourly cap, defer and retry in a later iteration instead of reissuing same request.
- Codebase Gaps: `coordinator/src/db.js` `createLoopRequest` rate-limit branch still returns fixed `retry_after_sec: 3600` rather than computing seconds until the oldest in-window request exits the 1-hour window, causing unnecessary 1-hour backoff even when capacity reopens in ~1 minute.
- False Positives: `scripts/loop-sentinel.sh` still shows grep-based active-count parsing locally, but `origin/main` already contains JSON parsing parity; treated as branch drift and not resubmitted.
### Loop 12 Iteration 7 (2026-03-13) — Outcome Review
- Successful Patterns: `loop-requests` showed four completed loop-12 submissions (`req-8f60e568`, `req-0c50ff41`, `req-9802198b`, `req-0baabb72`) clustered around narrow master-3 guidance/doc parity fixes; concise single-contradiction WHAT/WHERE requests continue to complete reliably.
- Failed Patterns: None observed in this review (`FAILED: none` in prior checkpoint and no failed statuses in loop request list).
- Codebase Gaps: Outcome review only in this phase; deeper remaining-scope validation deferred to research.
- False Positives: None identified during outcome review.
### Loop 13 Iteration 7 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`) confirmed all prior loop-13 requests were completed before new research, avoiding overlap with active integration/fix traffic.
- Successful Patterns: Every-3rd-iteration memory recall check (architect-loop mirrors, role-doc parity, setup propagation path) plus checkpoint EXPLORED/REMAINING guidance kept this pass focused on prompt-scoped triage/backlog/decomposition/signal-wait instruction parity.
- Failed Patterns: None observed in this iteration.
- Codebase Gaps: `templates/commands/architect-loop.md` and `.claude/commands/architect-loop.md` regressed out of parity with `.codex/commands-codex10/architect-loop.md` in prompt-critical sections (Step 1 wait mode, Step 2a pending parser, Step 3b task-id capture, Step 3c decomposition flow). `setup.sh` lines 154-157 still force-copy `templates/commands/*.md` into `.codex/commands-codex10`, so setup/reset can overwrite active codex architect behavior and reintroduce stale control flow.
- False Positives: `origin/main` command hashes also differ from local for these files, but this was not treated as a branch-only false positive because the local setup propagation path is executable and directly affects runtime prompt behavior in this workspace.
### Loop 12 Iteration 7 (2026-03-13) — Research + Submission
- Successful Patterns: Checkpoint-directed validation (`status`, `check-completion req-05a42584`, and source-path tracing across `loop-prompt`, `loop-agent`, and allocator command mirrors) produced hash-level evidence of active prompt drift instead of speculative doc-only drift.
- Failed Patterns: `loop-request` submission was suppressed by throughput guard (`rate_limit retry_after=3600s`); when loop hourly cap is reached, defer the candidate to a later iteration and do not retry in the same run.
- Codebase Gaps: Active loop directives are persisted as DB prompt snapshots and do not auto-refresh after command/doc updates; loop 12 still runs pre-fix allocator wake guidance (`.codex10.task-signal/.fix-signal/.completion-signal`) even though `.codex/commands-codex10/allocate-loop.md` now uses mailbox-blocking wake flow (`inbox allocator --block --timeout`).
- Codebase Gaps: `loop-agent` Phase 1 treats `loop-prompt.prompt` as authoritative scope each iteration, so stale snapshot prompts continue driving behavior unless an explicit restart/recreate path is triggered.
- False Positives: `scripts/loop-sentinel.sh` still shows older pre-check parsing, but `.codex/scripts/loop-sentinel.sh` already uses `loop-requests --json` + Node parsing; treated as mirror drift, not a new runtime contradiction.
### Loop 11 Iteration 6 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests` + targeted `check-completion`) confirmed loop-scoped completion progress (`req-6bf0f470` now ALL DONE) and avoided overlap with still-active `req-dd86c6d4`.
- Successful Patterns: Combining official OpenAI optimization schema evidence (`openai-openapi` manual_spec) with origin/main parser line anchors plus executable VM normalization repro produced a high-confidence, file-scoped candidate.
- Failed Patterns: Submission was suppressed by loop request hourly rate limit (`loop-request` returned `suppressed: rate_limit retry_after=3600s`); do not retry same-iteration submissions after suppression.
- Codebase Gaps: On origin/main, complete-task usage normalization in `coordinator/bin/mac10` and `coordinator/src/cli-server.js` drops OpenAI `prompt_tokens_details.audio_tokens` and `completion_tokens_details.audio_tokens` (no canonical field/column mapping), so modality-specific optimization telemetry is lost.
- False Positives: Local branch `agent-5-task70` diverges from origin/main in CLI/runtime wiring; findings were anchored to origin/main plus direct parser repro to avoid branch-drift noise.
### Loop 9 Iteration 6 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests`, then targeted `status`/`check-completion`) kept this pass overlap-safe while confirming loop-9 completion state before deeper source analysis.
- Successful Patterns: Verifying candidates against `origin/main` plus live runtime evidence (activity_log query) quickly filtered branch-drift assumptions and produced concrete contradictions only.
- Successful Patterns: Anchoring the merge-validation throughput defect in both source contradiction and fresh activity-log IDs produced a high-confidence submission (`req-f33aa5e5`) without speculative scope.
- Failed Patterns: None observed in this iteration (`FAILED: none`).
- Codebase Gaps: `origin/main` `coordinator/src/merger.js` `runOverlapValidation` still unconditionally executes `npm run build` before task-specific validation; runtime `activity_log` continues emitting `overlap_validation_failed`/`functional_conflict` entries with `Missing script: "build"` (recent IDs 8124/8125/8115/8116/8111/8112), indicating merge-throughput churn remains unresolved.
- Codebase Gaps: In `origin/main` fallback budget parsing, `fallbackModelRouter.getBudgetState` treats any parseable `routing_budget_state` object as authoritative even when `remaining` or `threshold` is null, so scalar fallback keys are ignored for missing fields; this can disable budget-aware routing shifts under partial JSON state.
- False Positives: Partial-budget fallback candidate overlaps active integrating parser-hardening request `req-20145841` in the same functions (`parseBudgetStateConfig`/`getBudgetState`/web budget snapshot path), so it was held for revalidation post-landing instead of re-submitting now.
### Loop 12 Iteration 8 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, then `status`) again confirmed loop-12 history is all completed requests and prevented overlap with active non-loop request scope (`req-05a42584` remains decomposed).
- Successful Patterns: Pairing runtime evidence (`loop-prompt` payload for loop 12) with source-path verification (`coordinator/src/db.js` `createLoop`, `coordinator/src/cli-server.js` `loop-prompt`) produced a concrete, non-speculative prompt-refresh gap.
- Failed Patterns: No loop-scoped failed requests were present in this iteration’s `loop-requests` output.
- Codebase Gaps: Active loop prompts are snapshot-persisted (`loops.prompt`) and `loop-prompt` returns that stored text directly; there is no refresh/reload path after command-template updates, so existing loops can keep stale directives.
- Codebase Gaps: Runtime loop-12 prompt still instructs deprecated signal waits (`.codex10.task-signal/.fix-signal/.completion-signal`), while `origin/main` `templates/commands/allocate-loop.md` now documents mailbox-blocking wake flow (`inbox allocator --block --timeout`) and explicitly deprecates those signal files.
- False Positives: `req-05a42584` (createLoopRequest dedup/cooldown ordering) is adjacent loop infrastructure but not the same defect class as prompt snapshot refresh; treated as separate scope.
### Loop 10 Iteration 7 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, and targeted `check-completion`) confirmed prior loop-10 completions (`req-2a6156eb`, `req-07ef293b`, `req-002e6542`) before new research, preventing overlap with active decomposed requests.
- Successful Patterns: A minimal temp-DB repro against `coordinator/src/db.js` `createLoopRequest` produced concrete payload-shape evidence for supersession handling (`reason=similar_active_duplicate`, `superseded_target` emitted as string).
- Failed Patterns: `loop-request` submission can fail mid-iteration with `Loop is stopped, not active` after an initially active `loop-prompt`; when status flips, stop submission attempts and checkpoint/exit cleanly.
- Codebase Gaps: `coordinator/src/db.js` returns `superseded_target` as a string request ID (lines 913/923) while `coordinator/bin/mac10` only renders supersession details when `result.superseded_target.request_id` exists (line 1186), so deduplicated similar-duplicate responses lose operator-visible supersession context.
- Codebase Gaps: `codex10 status` can show a request as `[failed]` while `check-completion` reports `0 failed` (`req-21b08fe3` observed as `2/3 completed, 0 failed`), indicating lifecycle visibility inconsistency that should be revalidated next active iteration.
- False Positives: None identified; superseded-target mismatch and status/check-completion inconsistency were validated via direct command output and source anchors.
- Loop 9 iteration 7 (2026-03-13): checkpoint-driven remaining-area validation plus origin/main code-path verification surfaced a distinct budget-routing contradiction (partial `routing_budget_state` objects suppress scalar fallback in both router and status snapshot paths); this produced a high-confidence WHAT/WHERE/WHY/EVIDENCE packet, but submission was blocked because loop 9 transitioned to stopped mid-iteration.

- Loop 9 iteration 7 (2026-03-13): avoid treating runtime request/task lifecycle contradictions as upstream defects without origin/main parity checks; local/runtime branch drift can still show stale completion bugs after origin/main has guard logic.

- Loop 9 iteration 7 (2026-03-13): unresolved optimization gap remains in origin/main budget handling — when `routing_budget_state` is a valid object missing one flagship scalar, fallback routing and `/api/status` snapshot both ignore scalar fallback keys and drop budget-signal enforcement.
### Loop 11 Iteration 7 (2026-03-13)
- Successful Patterns: Outcome-first review plus `origin/main` validation and executable parser checks preserved high-confidence scope without duplicating prior completed loop-11 requests.
- Failed Patterns: Submission attempt failed due shell-quoting interpolation of backticked tokens, and a follow-up `loop-prompt` check showed loop 11 transitioned to `stopped`, preventing request intake this iteration.
- Codebase Gaps: On `origin/main`, complete-task usage normalization in both `coordinator/bin/mac10` (`parseCompleteTaskUsage`) and `coordinator/src/cli-server.js` (`normalizeCompleteTaskUsagePayload`) silently drops OpenAI audio token detail payloads (`prompt_tokens_details.audio_tokens`, `input_tokens_details.audio_tokens`, `completion_tokens_details.audio_tokens`, `output_tokens_details.audio_tokens`) because no canonical audio usage fields or task columns exist.
- False Positives: None identified; gap was validated against `origin/main` and executable parser normalization output (`{}`) for audio-only detail payloads.
### Loop 8 Iteration 7 (2026-03-13)
- Successful Patterns: Running `loop-requests --json` first provided precise completion/failure outcomes and concrete integration failure strings, which prevented speculative resubmission.
- Successful Patterns: Validating candidate config/routing gaps against both local source and `origin/main` filtered out stale duplicate scope before drafting.
- Failed Patterns: Prior loop-8 failures were integration-path issues, not weak request quality: `req-7a344cb6` and `req-21b08fe3` both show `functional_conflict` results (`git fetch` ref-lock churn and `npm run build` missing script).
- Failed Patterns: Loop liveness changed during submission; `loop-request` returned `Loop is stopped, not active`, so no request was submitted this iteration.
- Codebase Gaps: Local `coordinator/src/cli-server.js` fallback routing path is effectively always active because `coordinator/src/model-router.js` is absent, and `fallbackModelRouter.routeTask` does not apply budget remaining/threshold to upscale/downscale routing decisions (fixed static fallback reason), which undermines prompt-aligned credit optimization behavior.
- False Positives: `set-config` loop quality/rate key allowlist mismatch is already fixed on `origin/main`; local contradiction was treated as branch drift and not resubmitted.
### Loop 17 Iteration 1 (2026-03-13)
- Successful Patterns: Cross-validating provider primary docs (OpenAI, Anthropic, Google Vertex AI) against concrete local source anchors before submission produced one high-confidence optimization candidate with measurable telemetry outcomes.
- Failed Patterns: Loop runtime state reset mid-iteration; initial `loop-prompt 17` returned active with directive payload, but subsequent `loop-prompt 17`/`loop-request 17` returned `Loop not found`, blocking request intake and checkpoint persistence.
- Codebase Gaps: The current coordinator build has no end-to-end task usage telemetry path: `coordinator/bin/mac10` complete/fail command parsing has no `--usage`, `coordinator/src/cli-server.js` complete-task/fail-task handlers do not normalize usage payloads, and `coordinator/src/schema.sql` `tasks` lacks usage token/cost columns. This blocks quality/performance/cost optimization despite provider-native cache/reasoning/audio usage signals.
- False Positives: None identified in this iteration; candidate was verified with local code reads and a direct tasks schema inspection query.

### Loop 17 Iteration 1 (2026-03-13)
- Successful Patterns: Cross-validating primary provider docs (OpenAI usage details, Anthropic cache-usage fields, Google Vertex usageMetadata, and Claude Code cost tracking docs) against concrete local source anchors produced a strong quality/performance/cost opportunity map before submission.
- Failed Patterns: `loop-request` suppressed the draft for `quality_gate` (`missing concrete change verb (WHAT)`); descriptive WHAT clauses must start with explicit action verbs in the accepted allowlist.
- Codebase Gaps: Local completion/failure ingestion paths still have no structured usage payload support (`coordinator/bin/mac10` complete-task/fail-task argument parsing and `coordinator/src/cli-server.js` handlers), and `tasks` schema lacks usage persistence columns, preventing per-task token/cost telemetry.
- False Positives: None identified this iteration; local gap was confirmed directly in source, and external evidence was gathered from primary docs rather than secondary commentary.
### Loop 18 Iteration 1 (2026-03-13)
- Successful Patterns: Validating live runtime prompt content via `loop-prompt` plus direct mirror diffs (`.codex/commands-codex10/architect-loop.md` vs `.codex/commands/architect-loop.md`) produced a concrete, prompt-scoped architect-loop contradiction before submission.
- Failed Patterns: Using unescaped backticks inside `loop-request` payload text in shell can trigger command substitution and mangle the submitted description; avoid backticks or single-quote the full payload next time.
- Codebase Gaps: Active codex10 architect prompt source (`.codex/commands-codex10/architect-loop.md`) still lags `.codex/commands/architect-loop.md` in Step 2a/3b/3c (grep-based pending parsing, placeholder task-id assignment, queue-file decomposition flow), while `setup.sh` lines 154-157 force-copy templates into `commands-codex10`, making template parity critical for runtime behavior.
- False Positives: None identified; parser misclassification was validated with executable status-shaped sample repro (`old_count=2 old_oldest=req-old` vs anchored parser `new_count=1 new_oldest=req-new`).

- Loop 17 iteration 2 (2026-03-13): parity-checking `origin/main` before submission avoided stale-branch false positives (local `agent-5-task70` still lacks usage paths that are already landed upstream), and a verb-led WHAT/WHERE/WHY/EVIDENCE packet passed the loop quality gate (`req-756b2e88`).

- Loop 17 iteration 2 (2026-03-13): prior iteration checkpoint suppression confirms a recurring failed pattern — descriptions that do not contain an explicit WHAT verb (`Fix/Add/...`) are rejected by `createLoopRequest` quality gating (`missing concrete change verb (WHAT)`).

- Loop 17 iteration 2 (2026-03-13): `origin/main` still lacks audio-token telemetry persistence despite expanded usage compatibility. `coordinator/bin/mac10` and `coordinator/src/cli-server.js` map cached/reasoning/prediction details but do not map `input_tokens_details.audio_tokens` / `prompt_tokens_details.audio_tokens` / `completion_tokens_details.audio_tokens` / `output_tokens_details.audio_tokens`, and `coordinator/src/schema.sql`/`coordinator/src/db.js` expose no `usage_*audio*` task columns. This leaves multimodal cost/performance measurement incomplete.

- Loop 17 iteration 2 (2026-03-13): external-source triangulation stayed high-signal for optimization telemetry design:
  OpenAI docs include token-detail objects with `audio_tokens` and prediction/reasoning detail counters; Anthropic docs define cache-creation/read usage fields with documented latency/cost impact; Google Vertex AI usageMetadata similarly exposes prompt/candidate/total token accounting. Smaller agent repos (e.g., Cline/Aider issue threads) continue to report operational pain when token/cost accounting is incomplete or opaque.

### Loop 18 Iteration 3 (2026-03-13)
- Successful Patterns: Outcome-first follow-up (`loop-requests`, `status`, `check-completion`) plus checkpoint-directed parity checks narrowed scope quickly and produced a single high-confidence submission (`req-7e7b5fae`) with executable runtime evidence.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `scripts/loop-sentinel.sh` and `.codex/scripts/loop-sentinel.sh` still parse `loop-requests` as JSON without `--json`, so active-request precheck can false-zero and respawn loops while requests remain `integrating`/in-flight.
- False Positives: Potential `.claude` vs `.codex` path mismatch in architect prompts was treated as branch-drift-sensitive after `origin/main` parity checks showed broader `.claude` runtime migration already landed upstream.
### Loop 17 Iteration 4 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests`) confirmed both prior loop-17 submissions completed (`req-a079b39b`, `req-756b2e88`) before new research, preventing overlap churn.
- Successful Patterns: Pairing origin/main function-level contradiction checks with an executable local repro for budget-state parsing and primary external sources (OpenAI prompt-caching/cost docs, Anthropic prompt-caching usage docs, Google Vertex UsageMetadata docs) produced a high-confidence non-overlapping request (`req-767d51e7`).
- Failed Patterns: None observed in this iteration.
- Codebase Gaps: On origin/main, partial `routing_budget_state` objects (for example `{"flagship":{"remaining":35}}`) are treated as authoritative in `coordinator/src/cli-server.js` `fallbackModelRouter.getBudgetState` and `coordinator/src/web-server.js` `buildBudgetSnapshotFromConfig`, so scalar threshold fallback keys are ignored when one field is missing.
- Codebase Gaps: This partial-state behavior can disable budget-constrained downscale/upscale safeguards (`hasBudgetSignal=false`) and leave `/api/status` budget snapshots with null threshold, creating routing-vs-observability cost-control drift.
- False Positives: Local branch code lacks many upstream telemetry changes; findings were anchored to `origin/main` plus executable repro to avoid stale-branch noise.
### Loop 18 Iteration 4 (2026-03-13)
- Successful Patterns: Outcome-first verification (`loop-requests --json` plus `check-completion`) confirmed loop-scoped state and prevented overlap with integrating requests before drafting a new candidate.
- Failed Patterns: `loop-request` was suppressed by the quality gate (`missing concrete change verb (WHAT)`) when WHAT started with "Replace"; next submission should start WHAT with an allowlisted verb such as `Fix` or `Update`.
- Codebase Gaps: `templates/commands/architect-loop.md` and `.codex/commands-codex10/architect-loop.md` still hardcode `.claude` paths for codex10 commands, signals, logs, and state references, while `setup.sh` provisions and refreshes `.codex` runtime paths (`mkdir -p "$CODEX_DIR/..."`, template copy into `.codex/commands-codex10`, `.codex` worktree symlink, legacy `.claude` cleanup).
- False Positives: Suspected template-vs-runtime drift for architect-loop command content was false in this workspace; `templates/commands/architect-loop.md` and `.codex/commands-codex10/architect-loop.md` are currently identical.

### Loop 17 Iteration 5 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests` + `status`) before research showed `req-a079b39b` and `req-756b2e88` completed while `req-767d51e7` remained decomposed, which prevented overlap and kept this iteration scoped to a distinct telemetry-forward-compatibility defect.
- Successful Patterns: High-confidence submission quality improved by combining origin/main code-level contradiction checks (explicit unknown-key throws in both CLI and server usage parsers) with primary provider artifacts (OpenAI/Anthropic/Google usage schema evidence) and niche runtime breakage incidents (strict validator failures in Vercel AI and LangChain).
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `origin/main` still hard-fails complete-task/fail-task when `usage` contains keys outside the canonical allowlist (`coordinator/bin/mac10` and `coordinator/src/cli-server.js`), so provider schema growth can block task completion and drop optimization telemetry.
- Codebase Gaps: Runtime/status still shows long functional-conflict churn tied to `npm run build`; this appeared stale relative to origin/main merger validation logic and warrants post-integration runtime parity verification.
- False Positives: Local `coordinator/src/merger.js` unconditional `npm run build` path looked like a net-new defect, but origin/main already contains script-aware overlap validation helpers, so it was treated as runtime/local drift rather than a new implementation request.
### Loop 18 Iteration 5 (2026-03-13)
- Successful Patterns: Checkpoint-directed follow-up (`loop-requests`, `status`, `check-completion req-7e7b5fae`, `check-completion req-d6cdbbf7`) quickly confirmed completion state and avoided overlap before new submission scope.
- Successful Patterns: File-hash parity plus source-path triangulation (`templates/commands/architect-loop.md` == `.codex/commands-codex10/architect-loop.md`, setup propagation in `setup.sh`, and `.codex`-only sentinel launch paths) produced a high-confidence prompt-contract defect packet accepted as `req-a655c63a`.
- Failed Patterns: None observed in this iteration.
- Codebase Gaps: Codex10 architect-loop command content still hardcodes `.claude` command/signal/state/log paths even though setup refresh and runtime sentinels operate from `.codex` wrappers and worktree runtime links.
- False Positives: Request lifecycle views remain inconsistent for `req-d6cdbbf7` (`status` shows `[failed]` while `check-completion` reports `5/6 completed, 0 failed`), so status labels alone are non-authoritative during remediation churn.

### Loop 17 Iteration 6 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests`, `status`, `check-completion`) confirmed loop-17 request state before new research (`req-767d51e7` completed; `req-163f9405` decomposed with active task), which prevented overlap and kept turnover low.
- Successful Patterns: Triangulating primary provider artifacts (OpenAI SDK `response_usage.py`, Anthropic SDK `usage.py`, Google `python-genai` `UsageMetadata`) with niche issue evidence (OpenAI Agents #2518, Agno #6264, LiteLLM #17713) continues to support forward-compatible usage handling as a material quality/performance/cost requirement.
- Failed Patterns: None observed in loop-17 this iteration.
- Codebase Gaps: Runtime/local merger behavior still shows repeated `functional_conflict: npm run build` churn; local `coordinator/src/merger.js` still hardcodes build validation while `origin/main` uses script-aware validation command selection, indicating local runtime drift remains unresolved while `req-f33aa5e5` is decomposed.
- Codebase Gaps: `origin/main` still rejects unknown usage keys in `coordinator/bin/mac10` and `coordinator/src/cli-server.js`; this remains covered by active loop-17 request `req-163f9405`, so no additional submission this iteration.
- False Positives: Potential new submission on overlap-validation/build failures was treated as duplicate scope because request `req-f33aa5e5` already targets this contradiction.
### Loop 18 Iteration 6 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests` + targeted `status`/`check-completion`/history) clarified that `req-a655c63a` landed while `req-d6cdbbf7` remained active-remediation, preventing duplicate resubmission of the checkpoint-guard scope.
- Successful Patterns: Pairing runtime evidence (`loop-prompt 18` still returning `.claude` instructions) with source anchors (`coordinator/src/db.js` `createLoop` snapshot persistence and `coordinator/src/cli-server.js` `loop-prompt` returning `promptLoop.prompt`) produced a high-confidence non-overlapping request (`req-cfe42e2b`).
- Failed Patterns: None observed in this iteration.
- Codebase Gaps: Active loops persist prompt snapshots indefinitely; prompt/template fixes (including completed `req-a655c63a`) do not propagate to running loops, so stale directives can continue to drive sentinel-spawned iterations.
- False Positives: Earlier `req-d6cdbbf7` status mismatch in `status` vs `check-completion` was transitional lifecycle churn; latest request state is `integrating` with repeated merge-validation retries, so no new request was filed for that symptom.

### Loop 21 Iteration 1 (2026-03-13)
- Successful Patterns: Verifying allocator mailbox behavior with non-consuming `--peek` checks plus code-path tracing (`assign-task` -> `onAssignTask`) quickly produced high-confidence evidence for doc/runtime drift.
- Failed Patterns: `loop-request` quality gate suppressed the submission for `missing concrete file path signal (WHERE)` even though WHERE existed in prose; future submissions should place plain, unformatted file paths at the start of the WHERE line(s) (no markdown wrappers) to satisfy parser heuristics.
- Codebase Gaps: `master-3` codex10 role docs still instruct `inbox master-3` and manual `launch-worker.sh` after `assign-task`, while runtime mail producers target recipient `allocator` and `assign-task` already triggers worker spawn/wake via handler.
- False Positives: None observed in this iteration.
### Loop 17 Iteration 7 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, `check-completion`) again prevented overlap; loop-17 still has one active decomposed request (`req-163f9405`) and no newly failed loop-17 requests.
- Successful Patterns: Primary-source triangulation remains high-signal for telemetry design: OpenAI `response_usage.py` (cached/reasoning token detail objects), Anthropic `usage.py` (cache creation/read token fields + TTL breakdown object), and Google `python-genai` `UsageMetadata` (cached/thought/tool-use token counters).
- Failed Patterns: None observed this iteration.
- Codebase Gaps: Runtime merge throughput is still degraded by repeated `functional_conflict: Command failed: npm run build` failures on active tasks (#180, #186), indicating unresolved validation-path churn while optimization requests are integrating.
- Codebase Gaps: Request `req-f33aa5e5` remains decomposed with `0/0` completion from `check-completion`, so overlap-validation/build-conflict remediation appears stalled rather than closed.
- Codebase Gaps: Niche issue evidence still points to two recurring agent-platform risks relevant to coordinator telemetry ingestion: strict usage allowlists break when providers add/remove fields (OpenAI Agents #2518, LiteLLM #17713), and cumulative streaming usage can be mis-aggregated if treated as deltas (Agno #6264).
- False Positives: No net-new non-overlapping implementation request cleared the confidence gate; strongest external patterns are already covered by active `req-163f9405` and prior overlap-validation requests, so submission was intentionally skipped.
### Loop 18 Iteration 7 (2026-03-13)
- Successful Patterns: Outcome-first review with `loop-requests --json` plus targeted `check-completion` cleanly separated stable completions from in-flight remediation before new research.
- Successful Patterns: Request descriptions with explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE for architect-loop prompt/runtime defects continue to land (`req-a655c63a` completed; `req-cfe42e2b` decomposed quickly).
- Failed Patterns: `req-d6cdbbf7` remains `failed` because remediation/integration keeps hitting `functional_conflict` on `npm run build` in a repo without a build script, causing repeated merge churn.
- Codebase Gaps: Active loop prompt staleness remains open (`req-cfe42e2b` at `0/1 completed`), so running loops can still execute stale prompt snapshots until refresh-path work lands.
- False Positives: None identified this iteration; candidate defects overlapped active requests (`req-cfe42e2b`, `req-d6cdbbf7`, `req-f33aa5e5`) and were intentionally not re-submitted.
### Loop 21 Iteration 2 (2026-03-13)
- Successful Patterns: Reusing prior-iteration evidence and rewriting the request with explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE fields plus plain-text file paths passed quality gate and created req-ccf8e1e3.
- Failed Patterns: `loop-requests` returned no loop-21 request rows at iteration start, so suppression outcomes may only appear in checkpoint text and should be carried forward manually when present.
- Codebase Gaps: Allocator role-doc mirrors are still drifted in this branch: .codex/docs/master-3-role.md, templates/docs/master-3-role.md, and .claude/docs/master-3-role.md instruct inbox master-3 and/or manual launch-worker steps that contradict coordinator runtime assignment and mailbox flow.
- Codebase Gaps: setup.sh copies templates/docs/*.md into .codex/docs on every setup/reset, so stale template guidance can repopulate incorrect allocator instructions after resets.
- False Positives: None observed in this iteration; runtime and docs contradiction is source-verified in coordinator/src/cli-server.js and coordinator/src/index.js.
### Loop 17 Iteration 8 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, targeted `check-completion`) confirmed loop-17 requests are completed (`req-163f9405`, `req-767d51e7`, `req-a079b39b`, `req-756b2e88`) and prevented overlap with active non-loop-17 remediation work.
- Successful Patterns: Validating local findings against `origin/main` before submission filtered stale branch drift (`agent-5-task70` is far behind) and kept evidence anchored to current upstream behavior.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `origin/main` usage normalization now accepts unknown keys, but per-task persistence remains column-mapped only (`mapUsagePayloadToTaskFields`), so non-canonical provider usage metadata is not retained on task rows or surfaced through task status payloads.
- Codebase Gaps: Active remediation request `req-f33aa5e5` remains decomposed (`0/0`) while runtime merge history continues showing repeated `functional_conflict: npm run build`; this scope was treated as overlapping and not re-submitted.
- False Positives: Local workspace appears to lack usage telemetry paths in several files, but this was confirmed as stale-branch noise after `origin/main` parity checks.
### Loop 18 Iteration 8 (2026-03-13)
- Successful Patterns: checkpoint-directed `status` + `check-completion` rechecks, followed by `origin/main` parity validation, prevented a false-positive resubmission when `loop-set-prompt` was missing only on the local worker branch.
- Failed Patterns: repeated merge `functional_conflict` churn persists when task creation guidance hardcodes `validation: "npm run build"` in a repo where `coordinator/package.json` defines only `start` and `test` scripts.
- Codebase Gaps: `origin/main` `templates/commands/architect-loop.md` Tier-2/Tier-3 `create-task` snippets still force `"validation":"npm run build"`, which bypasses script-aware fallback and keeps generating avoidable `Missing script: "build"` retries.
- False Positives: local absence of `loop-set-prompt` is branch drift (`origin/main` already has CLI/server/test support), so it is not a valid net-new submission target.
- Submission: filed `req-f65a4090` to remove hardcoded `validation: "npm run build"` from architect-loop Tier-2/Tier-3 task templates and switch to script-aware validation guidance.
### Loop 21 Iteration 3 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests --json`) showed `req-ccf8e1e3` completed; keeping the request narrowly scoped to explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE fields with concrete runtime anchors led to completion.
- Failed Patterns: None observed in this iteration.
- Codebase Gaps: Local `templates/commands/allocate-loop.md` and `.codex/commands-codex10/allocate-loop.md` still show deprecated signal-wait guidance (`.codex10.task-signal/.fix-signal/.completion-signal`) and `request_ready_to_merge` wording despite current allocator mailbox contracts.
- False Positives: Treated allocator wake-up prompt drift as branch-local/upstream-overlap risk after parity checks showed `origin/main` template already carries mailbox-blocking flow; skipped new submission to avoid duplicate churn.
### Loop 17 Iteration 9 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, `check-completion`, and `request-history`) quickly confirmed overlap boundaries before deeper research, preventing duplicate submissions while active requests (`req-886b4878`, `req-f65a4090`) are still decomposed.
- Successful Patterns: Multi-source primary evidence remains consistent for usage-schema drift risk: OpenAI `completion_usage.py` and `response_usage.py` expose nested/optional usage detail fields, Anthropic SDK `Usage` includes provider-specific non-canonical keys (`service_tier`, `inference_geo`, `server_tool_use`, `cache_creation` object), and Google `python-genai` `UsageMetadata` includes `cached_content_token_count`, `tool_use_prompt_token_count`, and `thoughts_token_count`.
- Failed Patterns: None observed in this iteration.
- Codebase Gaps: `origin/main` still maps usage payloads through `COMPLETE_TASK_USAGE_COLUMN_MAP` only (`coordinator/src/cli-server.js`), with no raw usage JSON column in `coordinator/src/schema.sql`/`coordinator/src/db.js`; this remains actively tracked by `req-886b4878`.
- Codebase Gaps: `origin/main` `templates/commands/architect-loop.md` still contains hardcoded `"validation":"npm run build"` task templates; this remains actively tracked by `req-f65a4090`.
- False Positives: No new non-overlapping implementation candidate cleared the confidence gate; merge-validation default-script handling is already present in `origin/main` `coordinator/src/merger.js`, so repeated legacy `npm run build` conflict churn appears tied to backlog/remediation state rather than a fresh code defect in that file.
### Loop 18 Iteration 9 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests`, `status`, `check-completion`) plus targeted request-history checks prevented duplicate submissions while confirming lifecycle movement (`req-d6cdbbf7` moved from prior failed state to `18/18 completed`).
- Successful Patterns: Re-validating architect-loop mirrors before drafting showed active overlap (`req-f65a4090`) and avoided re-submitting the same validation-guidance defect.
- Failed Patterns: Historical failure mode remains `functional_conflict: Command failed: npm run build` churn when architect/task guidance hardcodes build validation in repos without a build script; this remains actively tracked and should not be duplicated.
- Codebase Gaps: Architect-loop mirror parity is currently mixed in this branch: `.codex/commands-codex10/architect-loop.md` already shows script-aware Tier-2 guidance while `templates/commands/architect-loop.md` still contains hardcoded `"validation":"npm run build"` snippets; active request `req-f65a4090` covers convergence.
- Codebase Gaps: Loop 18 prompt snapshot remains stale (`loop-prompt 18` still emits `.claude` paths and hardcoded build validation text) until active-loop prompt refresh is explicitly applied for this loop.
- False Positives: Suspected net-new architect-loop defects overlapped active requests (`req-f65a4090`, `req-f33aa5e5`) or represented expected snapshot behavior for pre-refresh loops, so no new request was submitted.
### Loop 17 Iteration 10 (2026-03-13) — Phase 2 Outcome Review
- Successful Patterns: High-confidence single-defect telemetry requests with explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE continue to close; loop-17 requests `req-886b4878` and `req-f65a4090` both reached `1/1 completed` via `check-completion`.
- Failed Patterns: None newly failed for loop 17 in this review window.
- Codebase Gaps: `req-f33aa5e5` remains decomposed at `0/0 completed`, indicating unresolved lifecycle/remediation drift for that scope.
- False Positives: `status` still showing `integrating` for requests already at `1/1 completed` appears to be transient lifecycle lag rather than a new implementation defect.

### Loop 21 Iteration 4 (2026-03-13)
- Successful Patterns: outcome review first (`loop-requests`) plus active-request overlap checks (`status`, `check-completion`, `request-history`) prevented duplicate submissions while `req-f33aa5e5`/`req-886b4878` remain decomposed.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: live allocator inbox still shows repeated `functional_conflict` payloads with `npm run build` missing-script errors; this remains active overlap with `req-f33aa5e5` and should be rechecked after that request completes.
- False Positives: local `watchdog.js`/`merger.js` behavior looked actionable, but `origin/main` parity confirms payload/grace and script-aware overlap-validation fixes are already upstream; branch-local drift is not a net-new submission target.
### Loop 18 Iteration 10 (2026-03-13)
- Successful Patterns: Checkpoint-directed outcome review (`loop-requests`, `status`, `check-completion`, `request-history`) before code inspection prevented duplicate submission while active architect-loop fixes are still integrating.
- Successful Patterns: Verifying local-vs-`origin/main` parity on prompt/runtime features (for example `loop-set-prompt` presence) quickly separated branch/runtime drift from net-new defects.
- Failed Patterns: None observed this iteration; no quality-gate suppression occurred because no request was submitted.
- Codebase Gaps: Loop-18 still runs a stale prompt snapshot (`loop-prompt 18` returns `.claude` paths and old guidance) until operators explicitly refresh the active loop prompt; the refresh command exists on `origin/main` but has not reached this runtime branch yet.
- Codebase Gaps: `req-f33aa5e5` remains decomposed (`0/0`), so overlap-validation/build-conflict churn remains unresolved in this runtime despite upstream improvements.
- False Positives: Template drift and missing `loop-set-prompt` in local files were treated as integration lag, not new defects, after `origin/main` parity checks showed these fixes already exist upstream.
### Loop 17 Iteration 10 (2026-03-13) — Final
- Successful Patterns: Pairing origin/main code-path contradiction checks with mandatory multi-source telemetry evidence (OpenAI usage types, Anthropic Usage type, Google UsageMetadata, and niche runtime-usage incidents) produced a distinct high-confidence request (`req-e4949f4d`) after tracked overlap requests completed.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `origin/main` `coordinator/src/db.js` `getUsageCostBurnRate` still aggregates only `status='completed'` tasks even though `coordinator/src/cli-server.js` `fail-task` persists `completed_at` and `usage_cost_usd`, creating failed-task spend undercount in burn-rate/request totals (now tracked by `req-e4949f4d`).
- Codebase Gaps: `req-f33aa5e5` remains decomposed at `0/0`, indicating unresolved lifecycle/remediation drift outside this iteration's non-overlapping submission scope.
- False Positives: `req-886b4878` and `req-f65a4090` showed `integrating` in `status` while `check-completion` reported `1/1 completed`; treated as transient lifecycle lag rather than a net-new duplicate request target.
### Loop 18 Iteration 11 (2026-03-13)
- Successful Patterns: Checkpoint-directed follow-up on remaining items (`req-f33aa5e5` completion + prompt-refresh parity) plus local-vs-`origin/main` function-level diffing produced a concrete non-overlapping regression packet and created `req-85007984`.
- Successful Patterns: Keeping request text strictly WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE with plain file paths and executable runtime evidence (`loop-prompt 18` stale snapshot) passed quality gate on first attempt.
- Failed Patterns: Loop-level historical failures remain non-authoritative without completion context (`loop-requests` still lists `req-d6cdbbf7` as failed while newer checkpoints reported no current failures); continue pairing outcome review with targeted completion checks.
- Codebase Gaps: This runtime branch is missing active-loop prompt refresh support: `coordinator/bin/mac10` lacks `loop-set-prompt` and `coordinator/src/cli-server.js` lacks `case 'loop-set-prompt'`, leaving active loops locked to stale prompt snapshots.
- Codebase Gaps: Loop `18` still returns stale `.claude` architect guidance via `loop-prompt`, so prompt/template fixes do not affect running loops in this branch until refresh support is restored.
- Codebase Gaps: `req-f33aa5e5` remains `decomposed` with `0/0` completion and no merge entries in this runtime view, so overlap-validation remediation is still stalled here.
- False Positives: Although `origin/main` already contains `loop-set-prompt`, this workspace runtime branch does not; the actionable defect is branch integration regression, not an upstream missing-feature bug.

### Loop 17 Iteration 11 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`, `check-completion`) before deep research prevented overlap; `req-e4949f4d` moved to `1/1 completed` during this iteration, so duplicate burn-rate submission was avoided.
- Successful Patterns: Pairing `origin/main` code-path verification (`coordinator/src/db.js`, `coordinator/src/cli-server.js`, `coordinator/src/web-server.js`) with external primary usage-schema sources kept confidence gating strict and turnover intentionally low (no weak submission).
- Failed Patterns: None observed this iteration.
- Codebase Gaps: Runtime still shows sustained merge churn from `functional_conflict: Command failed: npm run build` while `req-f33aa5e5` remains decomposed (`0/0`), so throughput remains constrained until that remediation lands.
- Codebase Gaps: Status lifecycle lag persists (`check-completion req-e4949f4d` reports `ALL DONE` while request status remains `integrating`), suggesting remaining lifecycle/surface inconsistency risk for operator decisions.
- False Positives: Burn-rate undercount was revalidated as active in `origin/main` code but is now covered by completed `req-e4949f4d`; no resubmission.
- False Positives: A potential split-brain hypothesis (multiple coordinator PIDs and one deleted DB handle) lacks a minimal deterministic repro from current sources, so it was held back from submission pending stronger evidence.
### Loop 21 Iteration 5 (2026-03-13)
- Successful Patterns: Outcome-first revalidation (`loop-requests`, `status`, `check-completion`) before deeper research prevented overlap with active merge-churn work (`req-f33aa5e5`) and confirmed prior loop request completion (`req-ccf8e1e3`).
- Successful Patterns: Runtime contract checks against live inbox outputs (`inbox master-3 --peek` vs `inbox allocator --peek`) plus source anchors in `coordinator/src/cli-server.js`, `coordinator/src/index.js`, and `setup.sh` produced a concrete allocator-path regression candidate.
- Failed Patterns: Raw shell quoting for `loop-request` with backticks/single quotes caused command-substitution side effects and partially mangled request text; future submissions should pass description via stdin/file-safe quoting only.
- Codebase Gaps: `templates/docs/master-3-role.md` and `.claude/docs/master-3-role.md` still carry legacy allocator guidance (`inbox master-3`, manual `launch-worker.sh`) while runtime mailbox/spawn behavior is allocator-recipient + assignment-triggered spawn.
- Codebase Gaps: Active overlap-validation remediation (`req-f33aa5e5`) remains decomposed (`0/0`), so allocator inbox still shows repeated `tasks_available` churn around unresolved functional-conflict backlog.
- False Positives: Local role-doc/command drift in this branch can reflect branch lag versus `origin/main`; parity checks are still required before submitting mirror-sync defects as net-new.
### Loop 18 Iteration 12 (2026-03-13)
- Successful Patterns: Phase-2 outcome review first (`loop-requests` + `check-completion`) confirmed `req-85007984` completion before new research, preventing overlap with prompt-refresh scope.
- Successful Patterns: Runtime/process evidence (`ps`, `lsof`, socket/pid pointer files, symlinked `.worktrees/wt-1/.codex`) plus source anchors in `coordinator/src/cli-server.js` produced a high-confidence non-duplicate request packet (`req-3c510899`).
- Failed Patterns: None observed this iteration.
- Codebase Gaps: Active runtime still shows unresolved overlap-validation remediation (`req-f33aa5e5` remains `decomposed` with `0/0`), indicating integration backlog persists.
- Codebase Gaps: Coordinator namespace startup/endpoint identity is path-alias sensitive (`${NAMESPACE}:${projectDir}`), enabling split endpoint state when shared `.codex` symlink aliases are used.
- False Positives: Prior split-brain concern is no longer speculative in this workspace; it now has direct process/socket/db-handle evidence and was submitted as `req-3c510899`.
### Loop 21 Iteration 6 (2026-03-13)
- Successful Patterns: Loop-scoped outcome review first (`loop-requests`) showed recent requests completing cleanly (`req-a4abcc15`, `req-ccf8e1e3`), reinforcing that tightly scoped Master-3 doc-contract corrections with explicit runtime command alignment are accepted quickly.
- Failed Patterns: None observed in this iteration's loop outcome snapshot.
- Codebase Gaps: Checkpoint REMAINING items still point to unresolved runtime merge-churn follow-up (`req-f33aa5e5`) and allocator inbox churn verification after overlap remediation.
- False Positives: None added yet; further runtime verification needed before concluding churn is resolved.
### Loop 21 Iteration 6 (2026-03-13) — Final Update
- Successful Patterns: Using checkpoint-directed follow-up (`status`, `check-completion req-f33aa5e5`, `request-history req-a4abcc15/req-f33aa5e5`) quickly separated completed role-doc sync work from still-active merge-churn remediation.
- Failed Patterns: Candidate allocator starvation hypothesis (same-worker fix routing vs idle-only assignment) lacked direct, non-overlapping runtime proof in this iteration, so no speculative request was submitted.
- Codebase Gaps: `req-f33aa5e5` remains `decomposed` with `0/0 completed`, while live status still reports repeated `functional_conflict: npm run build` merge failures and urgent fix-task accumulation.
- Codebase Gaps: Split coordinator identity/state inconsistency remains an active runtime risk but is already covered by in-flight request `req-3c510899`; avoid duplicate submissions until outcome is known.
- False Positives: Local direct DB inspection at `.codex/state/codex10.db` showed empty task/worker rows despite rich CLI status output, matching existing split-brain symptoms rather than indicating a separate new defect.
### Loop 18 Iteration 13 (2026-03-13)
- Successful Patterns: Outcome-first validation (`loop-requests`, `status`, targeted `check-completion`) before source inspection prevented duplicate submissions while tracked requests changed state during the same iteration.
- Successful Patterns: Re-checking checkpoint REMAINING items directly (`req-3c510899`, `req-d6cdbbf7`, `req-f33aa5e5`) kept research focused on unresolved lifecycle hotspots instead of speculative new scope.
- Failed Patterns: No new failed submission pattern this iteration; confidence gate held because all strong signals overlapped active split-brain/remediation requests.
- Codebase Gaps: `req-3c510899` remains active (`decomposed` with 0/1 completed), and runtime still shows multi-process/state-drift symptoms (request status/completion mismatches and persistent stale prompt snapshots).
- Codebase Gaps: `req-f33aa5e5` remains `decomposed` at `0/0`, while merge queue continues repeated `functional_conflict: npm run build` churn.
- Codebase Gaps: Architect-loop prompt mirrors are still inconsistent in this workspace (`templates/commands/architect-loop.md` retains hardcoded build validation while `.codex/commands-codex10/architect-loop.md` is script-aware), indicating integration drift likely tied to ongoing lifecycle/state issues.
- False Positives: Potential net-new lifecycle defects (for example `req-f65a4090`/`req-85007984` marked completed but local files still stale) were treated as overlap with active split-brain correction rather than independent submission targets.
### Loop 21 Iteration 7 (2026-03-13) — Outcome Review
- Successful Patterns: Recent loop requests that completed (`req-ccf8e1e3`, `req-a4abcc15`) used strict WHAT/WHERE/WHY/EVIDENCE packets anchored to exact allocator docs/template mirror files and live coordinator-runtime contradictions.
- Successful Patterns: Explicitly including setup reintroduction vectors (`setup.sh` template copy path) improved durability by preventing doc drift from returning after reset/bootstrap.
- Failed Patterns: None observed in this loop-scoped outcome snapshot.
- Codebase Gaps: Need fresh runtime verification on unresolved requests `req-f33aa5e5` (merge-conflict churn) and `req-3c510899` (coordinator identity/path consistency) before proposing additional allocator changes.
- False Positives: None added yet.
### Loop 21 Iteration 7 (2026-03-13) — Final Update
- Successful Patterns: Verifying active runtime mirrors directly (`diff -u .codex/docs/master-3-role.md templates/docs/master-3-role.md`) after outcome review exposed a concrete non-overlapping doc-contract defect even after prior mirror-sync completions.
- Successful Patterns: Request packets that anchored line-level drift in the actively read runtime file plus operational impact (wrong mailbox recipient + duplicate worker launch guidance) remained high-confidence and accepted (`req-768fdda8`).
- Failed Patterns: None in this iteration; loop-request submission used file-safe quoting and avoided prior shell-substitution corruption.
- Codebase Gaps: `.codex/docs/master-3-role.md` remained stale against template/.claude allocator behavior until this new request; fresh-start loops relying on `.codex/docs` are at risk until merged.
- Codebase Gaps: `req-f33aa5e5` still shows `decomposed` with `0/0 completed` while merge logs continue `npm run build` functional-conflict churn, so overlap-validation remediation remains unresolved.
- False Positives: Direct local DB probes still returned no rows for active request IDs shown by `codex10 status`; treated as overlap with active split-brain remediation (`req-3c510899`) rather than submitted as a duplicate defect.
### Loop 17 Iteration 13 (2026-03-13)
- Successful Patterns: Checkpoint-directed lifecycle preflight (`loop-requests`, `check-completion req-e4949f4d`, `check-completion req-f33aa5e5`, `check-completion req-3c510899`) before deeper research prevented overlap while request/task states were still moving.
- Successful Patterns: Mandatory multi-source evidence sweep (OpenAI prompt-caching + tracing docs, Anthropic prompt-caching/common-workflows docs, Google Vertex/ADK observability docs, and niche issue trackers) supported a strict no-submit decision when non-overlapping implementation confidence stayed below gate.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: Lifecycle visibility remains inconsistent for operators: task-level completion checks can report `ALL DONE` while request rows remain `integrating`/`decomposed`, so status surfaces still need convergence clarity.
- Codebase Gaps: Cross-ecosystem evidence still shows usage telemetry inconsistency in agent SDK streams/summaries (for example: openai/openai-agents-js#734 closed not planned, vercel/ai#8794 open cache-token accounting concern, langchain-ai/langgraph#5951 open missing usage metadata in message streaming); maintain strict raw usage payload persistence and avoid speculative derived spend math until semantics are explicit per provider.
- False Positives: A potential new burn-rate request was intentionally withheld because recent/active telemetry requests (`req-e4949f4d`, `req-f33aa5e5`, `req-3c510899`) already overlap core lifecycle/cost surfaces and current evidence did not clear non-overlap confidence >=0.85.
### Loop 18 Iteration 14 (2026-03-13)
- Successful Patterns: Outcome-first review (`loop-requests --json`, `status`, `check-completion`) quickly confirmed loop-18 completion streak on tightly scoped architect/runtime requests (`req-85007984`, `req-f65a4090`, `req-cfe42e2b`, `req-a655c63a`, `req-7e7b5fae`, `req-c90d2149`) and prevented duplicate submissions.
- Successful Patterns: Checkpoint-directed revalidation of remaining items (`req-3c510899`, `req-d6cdbbf7`, `req-f33aa5e5`) plus direct process/pointer evidence kept scope anchored to active lifecycle defects instead of speculative new work.
- Failed Patterns: None newly failed for loop 18 in this window; `FAILED` remained `none` in checkpoint context.
- Codebase Gaps: Split-brain symptoms are still live at runtime (two coordinator PIDs for root/worktree alias, shared `.codex` symlink, pointer/process divergence), and `loop-prompt 18` still returns stale `.claude` guidance while local source remains behind `origin/main` for `loop-set-prompt`; this remains overlapping with active request `req-3c510899`.
- Codebase Gaps: Merge/remediation churn tied to `npm run build` missing-script conflicts persists (`req-d6cdbbf7` still integrating at `30/34`, `req-f33aa5e5` still `0/0` decomposed) and remains active overlap.
- False Positives: `check-completion req-3c510899` reporting `ALL DONE` while request status is `integrating` was treated as lifecycle-surface mismatch (tasks vs merge completion semantics), not a new non-overlapping defect submission target during active split-brain remediation.
### Loop 21 Iteration 8 (2026-03-13)
- Successful Patterns: Phase-2 outcome review first (`loop-requests`) showed three completed allocator-doc requests (`req-768fdda8`, `req-a4abcc15`, `req-ccf8e1e3`), which kept this iteration from re-submitting mirror-sync scope.
- Successful Patterns: Checkpoint-directed follow-up (`status`, `check-completion`, `request-history`) plus source parity checks (`db.checkRequestCompletion`) produced a concrete non-overlapping completion-surface request (`req-e229ad57`) with direct runtime contradiction evidence.
- Failed Patterns: Shell-unsafe inline quoting can break `loop-request` submission payloads (`unexpected EOF`); using a temp file and command substitution avoided text corruption.
- Codebase Gaps: `check-completion` cannot mark zero-task terminal requests as done because `coordinator/src/db.js` gates `all_done` on `total > 0`, creating ambiguous `0/0` output for completed Tier-1 requests.
- False Positives: `.claude/docs/master-3-role.md` still differs from codex10 docs/templates, but `.codex/docs/master-3-role.md` and `templates/docs/master-3-role.md` are already aligned; `.claude` drift alone was not treated as a new allocator-runtime defect this iteration.
### Loop 18 Iteration 15 (2026-03-13)
- Successful Patterns: Outcome-first review with `loop-requests --json` cleanly separated completed requests from still-integrating ones, and prevented resubmitting scopes already covered by active requests (`req-3c510899`, `req-d6cdbbf7`) or new pending overlap (`req-e229ad57`).
- Successful Patterns: Checkpoint-directed revalidation (`status`, `check-completion`, `merge-status`, `request-history`) plus direct source anchors (`coordinator/src/db.js` `checkRequestCompletion`, `coordinator/src/cli-server.js` `check-completion`) kept confidence gating strict and avoided speculative submissions.
- Failed Patterns: Direct reads of `.codex/state/codex10.db` can be non-authoritative during split-brain runtime; CLI output and DB-file queries diverged because pointer files route to one coordinator while disk DB belongs to another.
- Codebase Gaps: Split-brain symptoms remain live in runtime (two coordinator PIDs for root/worktree alias, PID/socket pointer divergence, deleted DB handles on one process), overlapping active request `req-3c510899`.
- Codebase Gaps: Lifecycle/remediation backlog remains active (`req-d6cdbbf7` still integrating at `33/34`; `req-f33aa5e5` remains `decomposed` with `0/0`) with sustained merge-queue churn from `functional_conflict: npm run build`.
- Codebase Gaps: `check-completion` task-terminal reporting and request-level status remain easy to misread in automation paths; a related zero-task terminal-state fix is already pending as `req-e229ad57`.
- False Positives: `check-completion req-3c510899` showing `ALL DONE` while request status remains `integrating` was not treated as a new defect submission target this iteration due active overlap and semantics tied to task vs merge completion surfaces.
### Loop 17 Iteration 15 (2026-03-13)
- Successful Patterns: Checkpoint-directed lifecycle preflight (`loop-requests`, `status`, `check-completion` for `req-ed041c12`, `req-e4949f4d`, `req-3c510899`) before new research prevented duplicate submissions while active scopes were still marked `integrating`.
- Successful Patterns: Mandatory external-source refresh across primary docs (OpenAI prompt-caching/pricing, Anthropic prompt-caching + Agent SDK cost tracking, Vertex UsageMetadata) plus niche implementation signals (`openai/openai-agents-js#734`, `openai/openai-agents-python#948`, `vercel/ai#8794`, `vercel/ai#9921` + merged `#10975`) kept confidence gating strict and evidence-driven.
- Failed Patterns: None observed this iteration; quality gate held and no speculative request was submitted.
- Codebase Gaps: Lifecycle visibility remains inconsistent: `check-completion` reports `ALL DONE` for `req-ed041c12`, `req-e4949f4d`, and `req-3c510899` while `status` still shows those request rows as `integrating`, which can mislead overlap triage.
- Codebase Gaps: This runtime branch still shows local-vs-`origin/main` drift in `complete-task`/`fail-task` usage normalization paths, but that drift overlaps active remediation/split-brain scopes and did not clear non-overlap criteria.
- False Positives: A candidate request to re-land usage telemetry parsing in local runtime was withheld because evidence indicates active overlap with in-flight lifecycle/integration remediation (`req-3c510899`, merge-conflict backlog around `req-f33aa5e5`).
### Loop 21 Iteration 9 (2026-03-13)
- Successful Patterns: Outcome-first triage (`loop-requests`, `status`, `check-completion`, and targeted `request-history`) quickly confirmed no new loop-local completions/failures and prevented speculative submissions while active remediations (`req-e229ad57`, `req-f33aa5e5`, `req-3c510899`) remain in-flight.
- Successful Patterns: Cross-checking local allocator/merger code against `origin/main` before drafting avoided duplicate requests on already-landed fixes (for example claim-guard hardening `req-a1856410` and strict integrate gating `req-6a692107`) that are still absent in this local runtime due active split-state drift.
- Failed Patterns: None this iteration.
- Codebase Gaps: Runtime remains in a mixed-state window where local coordinator code paths lag completed upstream fixes while split-brain remediation request `req-3c510899` is still integrating; defer new overlapping allocator/merge lifecycle submissions until this stabilizes.
- False Positives: Rejected a candidate around `assign-task` bypassing `claimed_by` after confirming the issue was already captured and completed as `req-a1856410`.
- False Positives: Rejected integrate-on-failed-task gating as a new request after confirming it was already captured and completed as `req-6a692107` (with follow-on parity evidence in `change-summaries`).
### Loop 18 Iteration 16 (2026-03-13)
- Successful Patterns: Checkpoint-directed preflight (`loop-requests --json`, `status`, `check-completion`, `merge-status`) plus source verification before submission avoided overlap with active split-brain remediation and isolated a non-overlapping lifecycle defect.
- Successful Patterns: Re-landing a previously failed request only after confirming the code remained unfixed in-tree (`coordinator/src/cli-server.js` `loop-checkpoint`/`loop-heartbeat`) produced a high-confidence submission (`req-60b37e04`).
- Failed Patterns: Prior loop request `req-d6cdbbf7` remained failed while the stopped-loop checkpoint bug was still reproducible; failure-driven retries need fresh runtime+source evidence before resubmission.
- Codebase Gaps: `loop-checkpoint` still mutates stopped loops (runtime repro on loop `#22`), and `loop-heartbeat` still updates heartbeat state without active-status gating in source, risking lifecycle telemetry corruption.
- Codebase Gaps: Split-brain runtime remains active (two coordinator PIDs and pointer divergence) and continues to distort direct DB-file inspection versus CLI-reported state while `req-3c510899` is still integrating.
- False Positives: Treating CLI lifecycle repros as fully authoritative without source checks is unsafe under split-brain; code inspection was required to separate real regressions from stale-runtime effects.
### Loop 17 Iteration 16 (2026-03-13)
- Successful Patterns: Reviewing `loop-requests --json` first exposed exact lifecycle truth (5 completed, 2 integrating) and reinforced that tightly scoped WHAT/WHERE/WHY/EVIDENCE telemetry packets continue to complete, while broad speculative optimization ideas should be deferred.
- Successful Patterns: Mandatory evidence sweep stayed high-signal by combining primary docs (OpenAI prompt-caching/usage references, Anthropic prompt-caching + Agent SDK usage guidance, Google UsageMetadata) with niche issue threads (`openai/openai-agents-js#734`, `openai/openai-agents-python#948`, `vercel/ai#8794/#9921/#10975`, `langchain-ai/langgraph#5951`) before considering implementation.
- Failed Patterns: Runtime `mac10 status` and `mac10 check-completion` were unavailable (`Coordinator not running`), so coordinator-dependent validation should not be treated as authoritative when only loop scripts are reachable.
- Codebase Gaps: `origin/main` usage parsing remains partially strict for nested aliases: `coordinator/src/cli-server.js` and `coordinator/bin/mac10` still reject unknown `usage.cache_creation.*` keys and currently do not preserve unknown fields inside detail objects (`input_tokens_details`, `completion_tokens_details`) in `usage_payload_json`.
- Codebase Gaps: This iteration confirmed local branch drift vs `origin/main` on telemetry paths; parity checks must continue before proposing runtime-facing requests.
- False Positives: A follow-up request on nested usage-field forward-compatibility was withheld this cycle because current live evidence is schema-evolution risk (not a demonstrated present-provider break) and confidence did not clear the non-speculative gate.

### Loop 18 Iteration 17 (2026-03-13)
- Successful Patterns: Loop-scoped outcome review first (`loop-requests`/`request-history`) plus a fresh runtime lifecycle repro after seeing a completed status caught an unresolved defect quickly.
- Failed Patterns: Prior request `req-d6cdbbf7` still shows `failed` with `functional_conflict` merge churn, and relying on completed metadata alone (`req-60b37e04`) was insufficient because stopped-loop checkpoint mutation still reproduces.
- Codebase Gaps: Stopped-loop lifecycle integrity remains broken in runtime (`loop 24`: `stop-loop` followed by `loop-checkpoint` still returns `Checkpoint saved (iteration 1)` and mutates `last_checkpoint`/`iteration_count` while status stays `stopped`).
- Codebase Gaps: Coordinator identity/pointer coherence remains unstable during active split-brain remediation (`req-3c510899`), with stale `.claude/state/codex10.pid` and inconsistent completion snapshots observed in the same iteration.
- False Positives: Stale PID pointer and completion-snapshot drift were not submitted this iteration because they overlap active work (`req-3c510899`) and in-flight remediation (`task #272` for `req-d6cdbbf7`).
### Loop 21 Iteration 10 (2026-03-13)
- Successful Patterns: Loop-scoped outcome review stayed reliable; this loop's completed requests (`req-768fdda8`, `req-a4abcc15`, `req-ccf8e1e3`, now `req-e229ad57`) were all tightly scoped WHAT/WHERE packets with explicit file anchors and concrete operational impact.
- Successful Patterns: Re-checking runtime contradictions against `origin/main` before drafting prevented a false-positive re-submission when local `coordinator/src/db.js` still had `all_done` gated by `row.total > 0` but `origin/main` already contains the zero-task terminal-state fix.
- Failed Patterns: None newly observed in this iteration.
- Codebase Gaps: Active overlap-validation remediation remains unresolved in runtime view (`req-f33aa5e5` still `decomposed` with `0/0` from `check-completion`) while merge queue churn continues around `functional_conflict: npm run build` failures.
- Codebase Gaps: Split-brain symptoms are still observable during `req-3c510899` integration (two live coordinator processes for root/worktree alias paths), so lifecycle/state reads can remain inconsistent until that request fully lands.
- False Positives: A potential re-land request for zero-task completion reporting was withheld after confirming the fix already exists on `origin/main`; local stale behavior was treated as overlap/runtime drift rather than a new code defect.
### Loop 23 Iteration 1 (2026-03-13)
- Successful Patterns: Prompt-aligned lifecycle focus with direct runtime repro (`loop` -> `stop-loop` -> `loop-checkpoint` -> `loop-prompt`) quickly reconfirmed a concrete stopped-loop integrity defect without speculative scope.
- Failed Patterns: Loop liveness changed mid-iteration; `loop-prompt 23` returned `status: "stopped"` after research, so request submission was intentionally skipped to avoid a guaranteed `Loop is stopped, not active` failure.
- Codebase Gaps: `coordinator/src/cli-server.js` still allows `loop-checkpoint` writes without active-status gating. Fresh repro on loop `#25` in this iteration: `stop-loop 25` followed by `loop-checkpoint 25` returned `Checkpoint saved (iteration 1)` and `loop-prompt 25` showed `status: "stopped"` with mutated `last_checkpoint` and `iteration_count`.
- False Positives: `check-completion` metadata (`req-2a6156eb` and `req-60b37e04` completed) did not guarantee current runtime/source parity for stopped-loop guards; current code and repro were treated as authoritative.

### Loop 17 Iteration 17 (2026-03-13)
- Successful Patterns: Primary-source triangulation (OpenAI Responses usage docs, Anthropic usage docs, niche telemetry issues/PRs) plus an executable `origin/main` snapshot harness produced non-speculative evidence for a concrete telemetry-forward-compat gap before submission.
- Failed Patterns: `loop-request` quality gate suppressed a candidate despite high evidence because the packet formatting did not satisfy its strict WHAT/WHERE detector (`missing concrete file path signal`, `missing concrete change verb`); avoid markup-heavy field labels in submission text.
- Codebase Gaps: `origin/main` preserves unknown top-level usage keys but drops unknown nested keys inside `input_tokens_details`/`output_tokens_details` during normalization (`coordinator/src/cli-server.js` + `coordinator/bin/mac10`), so `usage_payload_json` loses provider-extension detail counters.
- False Positives: None newly identified after the `origin/main` harness repro; the nested-detail loss is current behavior, not a speculative future-only risk.
### Loop 26 Iteration 1 (2026-03-13)
- Successful Patterns: Prompt-scoped source checks (`.codex/commands-codex10/architect-loop.md`, role-doc mirrors, `setup.sh`) plus an executable command repro isolated a concrete Master-2 staleness-flow reliability defect and cleared quality-gate requirements in one submission.
- Failed Patterns: Avoided stale-runtime drift traps by rejecting previously completed overlap scopes (for example hardcoded build validation and split-brain parity drift) unless net-new evidence existed.
- Codebase Gaps: Architect incremental-rescan guidance writes `.codex/state/reports/master2-incremental-scan-files.txt` without ensuring the `reports/` directory exists; in this workspace the documented command fails with `No such file or directory` and `exit=1`.
- False Positives: Branch/runtime drift signals around completed requests remained out of scope for new submissions this iteration because they overlap active split-brain remediation (`req-3c510899`).
### Loop 17 Iteration 21 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `status`) plus `origin/main` parity checks and plain-text file-anchored WHAT/WHERE wording cleared the quality gate and produced accepted request `req-30d01bf7`.
- Successful Patterns: Multi-source evidence triangulation stayed high-confidence this cycle by combining OpenAI (`openai-python` `response_usage.py`), Anthropic (`anthropic-sdk-python` `usage.py`), and Google (`python-genai` `GenerateContentResponseUsageMetadata`) primary artifacts with niche implementation issue signals (vercel/ai `#8794`, `#9921`, `#10975`).
- Failed Patterns: None in this iteration; no suppression or dedup occurred.
- Codebase Gaps: `origin/main` usage normalization still preserves unknown top-level usage fields but drops unknown nested detail keys in `coordinator/src/cli-server.js` `normalizeCompleteTaskUsageAliasEntries` and `coordinator/bin/mac10` `normalizeCompleteTaskUsageEntries`, so `usage_payload_json` can lose provider-extension counters.
- False Positives: Local branch `master2-req-768fdda8` lacks newer usage parser paths, but parity checks confirmed this is branch drift; request scope was anchored to `origin/main` behavior only.

## Loop 21 Iteration 12 (2026-03-13)

### Successful Patterns
- Loop 21 iteration 12 (2026-03-13): Re-validating runtime on the active coordinator worktree (`.worktrees/wt-1`) before drafting avoided branch-drift false positives and produced a non-overlapping reliability submission (`req-21ffe146`).
- Loop 21 iteration 12 (2026-03-13): Using plain, unformatted WHERE file paths and explicit production-risk wording cleared prior quality-gate suppression and accepted the stale-decomposed watchdog recovery request.
- Loop 21 iteration 12 (2026-03-13): Phase-2 outcome refresh still showed all prior loop-21 requests completed with no failures (`req-e229ad57`, `req-768fdda8`, `req-a4abcc15`, `req-ccf8e1e3`), confirming narrow file-anchored packets remain effective.

### Failed Patterns
- None observed this iteration.

### Codebase Gaps
- Runtime still has a long-lived decomposed zero-task request (`req-f33aa5e5` at `0/0`), and watchdog currently recovers only failed/integrating states; submitted `req-21ffe146` to add stale-decomposed recovery.
- Coordinator split-brain risk remains operationally visible while `req-3c510899` is still integrating (state pointer mismatch observed between pid file and active socket process).

### False Positives
- Root worktree source reads alone can mislead when the active coordinator is running from `.worktrees/wt-1`; validate the live worktree before claiming source/runtime contradictions.
### Loop 26 Iteration 2 (2026-03-13)
- Successful Patterns: Phase-2 follow-up (`loop-requests` + `check-completion req-fb70e13c`) confirmed prior request completion before new research, which avoided re-submitting an already-resolved reports-dir fix.
- Successful Patterns: Prompt-scoped mirror-parity checks (`diff` between `.codex/commands-codex10/architect-loop.md` and `templates/commands/architect-loop.md`) plus setup propagation verification (`setup.sh` force-copy path) produced a concrete, non-speculative regression packet accepted as `req-e90756f5`.
- Failed Patterns: None newly observed in this iteration.
- Codebase Gaps: `templates/commands/architect-loop.md` is currently stale versus `.codex/commands-codex10/architect-loop.md` in Tier-2/Tier-3 orchestration (placeholder `assign-task <task_id>`, deprecated task-queue/handoff-file flow), and `setup.sh` re-seeds codex10 commands from templates each run.
- False Positives: Did not submit on active/integrating overlap areas (`req-3c510899`, `req-d6cdbbf7`, `req-a0b3fcce`, `req-f33aa5e5`) to avoid duplicate lifecycle/split-brain/worker-instruction scopes.

### Loop 17 Iteration 22 (2026-03-13)
- Successful Patterns: Outcome-first preflight (`loop-requests`, `check-completion`, `request-history`) kept scope non-overlapping while prior telemetry-focused, file-anchored requests remained completed and stable.
- Successful Patterns: Re-validating `origin/main` usage normalization behavior before drafting avoided speculative follow-up work during active decomposition of `req-30d01bf7`.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: `req-30d01bf7` remains `decomposed` (`0/1`), so nested usage-detail forward compatibility (including cache-creation nested key handling) is still unresolved in active runtime behavior.
- Codebase Gaps: No additional non-overlapping high-confidence quality/performance/cost gap cleared the submission gate after this cycle's primary-source refresh.
- False Positives: A potential follow-up to add more canonicalized extended-detail columns was withheld as overlap-risky and low-confidence until `req-30d01bf7` lands and post-landing behavior is re-measured.
### Loop 21 Iteration 13 (2026-03-13)
- Successful Patterns: Phase-2 outcome review (`loop-requests`) again showed completed loop-21 work concentrated in narrow, file-anchored allocator reliability fixes (`req-e229ad57`, `req-768fdda8`, `req-a4abcc15`, `req-ccf8e1e3`) with no loop-local failed requests.
- Successful Patterns: Checkpoint-directed revalidation (`status`, `check-completion`, `request-history`) prevented speculative submissions while active overlap-remediation requests were still integrating.
- Failed Patterns: None newly observed this iteration.
- Codebase Gaps: `req-f33aa5e5` remains `decomposed` with `0/0` completion (`check-completion req-f33aa5e5`), so overlap-validation false-conflict remediation is still not landed.
- Codebase Gaps: `req-21ffe146` shows `1/1 completed` but request status remains `integrating`, so stale-decomposed recovery is not yet fully merged into runtime behavior.
- Codebase Gaps: Split-brain symptoms remain live: two active `coordinator/src/index.js` processes (root and `.worktrees/wt-1`) while shared pointer files still show mixed identity state.
- False Positives: Potential follow-up submissions on decomposed `0/0` deadlock and split-brain persistence were withheld because both scopes are already covered by active requests (`req-21ffe146`, `req-3c510899`) and did not clear non-overlap requirements.
### Loop 26 Iteration 3 (2026-03-13)
- Successful Patterns: Checkpoint-directed follow-up (`loop-requests`, `check-completion req-e90756f5`, `request-history`) confirmed current loop state before new research and avoided duplicating already-active command-template parity work.
- Successful Patterns: Line-anchored parity diffs across `.codex` vs `templates` plus setup propagation checks (`setup.sh` copy paths) quickly isolated a concrete fresh-setup regression candidate in role-doc mirrors.
- Failed Patterns: `loop-request` submission was rate-limited (`suppressed: cooldown retry_after=69s`); do not retry within the same iteration when cooldown suppression is returned.
- Codebase Gaps: `templates/docs/master-2-role.md` still contains deprecated Tier-3 signal/handoff guidance (`touch .codex/signals/.codex10.task-signal`, signal-files section) and misses the Tier-2 post-assign triage step present in `.codex/docs/master-2-role.md`, while `setup.sh` line 174 force-copies templates docs into `.codex/docs` on setup.
- Codebase Gaps: Loop-26 active requests remain non-terminal (`req-e90756f5` integrating 0/1; `req-fb70e13c` integrating), so command/doc parity remediation is still in flight.
- False Positives: `.claude` architect mirror drift remains broad but was not submitted here because codex10 runtime prompt paths read `.codex` docs/commands; treated as lower-priority until active codex10 parity requests land.

## Iteration Updates (Loop 17, 2026-03-13, Iteration 23)

### Successful Patterns
- Loop 17 iteration 23: Starting with `loop-requests` + `check-completion` kept overlap control tight (all prior loop submissions stayed completed except active `req-30d01bf7`), and a single provider-specific alias gap with explicit WHERE/EVIDENCE produced a high-confidence non-overlapping submission (`req-6b6f0cab`).

### Failed Patterns
- None observed in this iteration for loop 17; no newly failed requests were reported by `loop-requests`.

### Codebase Gaps
- Google/Vertex-style usage fields (`prompt_token_count`, `candidates_token_count`/`response_token_count`, `total_token_count`) still do not map to canonical task usage columns or dashboard token views on `origin/main`; this causes telemetry blind spots even when raw usage payload JSON is preserved.

### False Positives
- Local branch `master2-req-768fdda8` lacks the newer usage parser surface present on `origin/main`; parity checks confirmed this is branch drift, not a new coordinator defect.
### Loop 1 Iteration 1 (2026-03-16)
- Successful Patterns: Cross-checking live queue state (`codex10 status` + `request-history`) before submission prevented overlap; pending request `req-cc09f6be` is already scoped to the active Master-2 architect prompt surface.
- Successful Patterns: Verifying runtime behavior against source (`coordinator/src/cli-server.js` + `coordinator/src/db.js`) confirmed that `create-task` does not transition request state, so missing `codex10 triage` in prompt instructions has concrete operational impact.
- Failed Patterns: None this iteration.
- Codebase Gaps: `.codex/commands-codex10/architect-loop.md` and `templates/commands/architect-loop.md` still instruct deprecated Tier-3 file handoff (`codex10.task-queue.json` / `codex10.handoff.json`) and omit the coordinator-native `create-task` + `triage` decomposition flow documented in `.codex/docs/master-2-role.md`.
- False Positives: Withheld submission of this architect-loop drift because queue already has active pending request `req-cc09f6be` with overlapping scope; resubmit only if that request fails or completes without fixing Step 3b/3c prompt parity.
### Loop 2 Iteration 1 (2026-03-16)
- Successful Patterns: Prompt-scoped allocator/watchdog source tracing plus an isolated temp-DB runtime repro produced a single high-confidence, file-anchored request (`req-6a20de1d`) without overlap.
- Successful Patterns: Verifying command-surface state first (`status`, `worker-status`, `loop-requests`) before drafting avoided speculative fixes and kept scope on Tier-2/Tier-3 worker-claim correctness.
- Failed Patterns: None this iteration.
- Codebase Gaps: `watchdog.releaseStaleClaimsCheck` uses `last_heartbeat || created_at` as claim age proxy while `claimWorker` persists only `claimed_by`; fresh claims on long-idle workers can be released immediately, undermining Master-2 worker reservations.
- False Positives: Withheld a decomposed `0/0` lifecycle candidate (`req-5cf58afb`) this iteration because evidence did not yet prove whether it is an intentional hold state vs a net-new allocator defect.
### Loop 3 Iteration 1 (2026-03-16)
- Successful Patterns: Prompt-surface validation using `scripts/launch-agent.sh` (`resolve_prompt_file`), `codex10 loop-prompt`, and runtime source cross-checks (`coordinator/src/cli-server.js`, `coordinator/src/schema.sql`) quickly identified a concrete Architect Tier-3 instruction/runtime contradiction.
- Failed Patterns: `loop-request` was suppressed by quality gate when WHAT/WHERE/WHY/EVIDENCE were present but phrasing did not satisfy parser heuristics (`missing concrete file path signal`, `missing production impact/risk signal`).
- Codebase Gaps: `.codex/commands-codex10/architect-loop.md` and `templates/commands/architect-loop.md` still instruct Tier-3 writes to `codex10.task-queue.json`/`codex10.handoff.json` even though runtime has no consumers and decomposition is DB-native via `create-task` + `triage`.
- Codebase Gaps: Decomposed request `req-5cf58afb` remains at `0/0 completed`, consistent with decomposition flows that can mark requests decomposed without creating tasks.
- False Positives: None this iteration.
### Loop 2 Iteration 2 (2026-03-16)
- Successful Patterns: Outcome preflight (`loop-requests` + `status`) confirmed loop-local request `req-6a20de1d` is still `decomposed`, preventing premature overlap assumptions.
- Successful Patterns: Direct source tracing (`coordinator/src/cli-server.js` assign-task) plus isolated temp-runtime repro produced a high-confidence allocator ownership defect candidate with concrete before/after state.
- Failed Patterns: Submission was blocked by loop cooldown (`loop-request` suppressed with `retry_after=67s`); do not retry in the same iteration.
- Codebase Gaps: `assign-task` currently accepts idle workers even when `claimed_by` is set and then clears the claim (`coordinator/src/cli-server.js` lines ~1385, ~1392), allowing Tier-3 allocation to steal Tier-2 reserved workers.
- Codebase Gaps: Current regression coverage does not include claimed-worker assignment rejection in `coordinator/tests/security.test.js`.
- False Positives: Prior historical note indicated this gap had been fixed in an earlier request (`req-a1856410`), but this runtime branch still reproduces the issue; treat as regression/re-land candidate rather than new behavior class.

### Loop 3 Iteration 2 (2026-03-16)

- Successful Patterns:
  - Verifying decomposed-zero-task lifecycle issues with both coordinator CLI output and direct DB evidence (`requests`, `tasks`, `activity_log`) produced high-confidence, non-speculative root-cause confirmation before submission attempts.
- Failed Patterns:
  - A single-line `loop-request` packet with mixed prose and inline file references failed quality-gate path detection (`suppressed: quality_gate`, detail: `missing concrete file path signal (WHERE)`); future submissions should use explicit `WHERE:` lines with standalone concrete paths.
- Codebase Gaps:
  - `coordinator/src/cli-server.js` triage currently sets tier>1 requests directly to `decomposed` even when architect immediately asks clarification and no task exists; runtime example `req-5cf58afb` remains `decomposed` with `check-completion` `0/0`, and `activity_log` shows `clarification_ask` without any `task_created` event.
- False Positives:
  - None added this iteration.

### Loop 3 Iteration 3 (2026-03-16)

- Successful Patterns:
  - Outcome-first overlap gating (`loop-requests`, `status`, `check-completion`) prevented duplicate submission on the active decomposed-zero-task scope (`req-315afdcf`) and kept focus on a distinct clarification-wait reliability gap.
  - A strict multiline WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE packet with plain path tokens passed quality gate and created `req-bc91cd31`.
- Failed Patterns:
  - Prior checkpoint suppression remained relevant this iteration: submissions that embed WHERE paths in mixed prose/formatting are likely to fail parser heuristics; keep standalone path tokens in explicit WHERE clauses.
- Codebase Gaps:
  - Clarification waits are not type-filtered: `.codex/docs/master-2-role.md` tells Architect to `ask-clarification` then `inbox architect --block`, but `coordinator/src/cli-server.js` delivers mixed mail types (`clarification_reply`, `task_completed`, `task_failed`) to the same recipient and `coordinator/src/db.js` `checkMail` consumes all unread messages for that recipient without filtering.
  - Runtime mailbox history confirms mixed architect traffic (`task_completed=19`, `new_request=14`, `request_queued=12`), so blocking waits can wake on unrelated events.
- False Positives:
  - Did not resubmit decomposed `0/0` request lifecycle remediation because it is already active (`req-315afdcf`).

### Loop 3 Iteration 4 (2026-03-16)
- Successful Patterns: Checkpoint-directed follow-up (`status`, `check-completion`, `request-history`) quickly confirmed tracked request states (`req-bc91cd31` and `req-315afdcf` still decomposed/in-flight) and prevented overlap assumptions.
- Successful Patterns: Using checkpoint `EXPLORED` history as the memory anchor for the every-3rd-iteration drift check kept research focused on uncovered prompt-surface parity rather than re-reading already validated inbox DB internals.
- Failed Patterns: Submission attempt was suppressed by loop cooldown (`loop-request` returned `suppressed: cooldown retry_after=55s`); do not retry within the same iteration.
- Codebase Gaps: `.codex/commands-codex10/architect-loop.md` and `templates/commands/architect-loop.md` still contain deprecated Tier-3 decomposition instructions (`clarification-queue.json`, `codex10.task-queue.json`, `codex10.handoff.json`) while canonical `.codex/commands/architect-loop.md` already documents coordinator-native `ask-clarification` + `triage` + `create-task` flow.
- Codebase Gaps: `setup.sh` launches Architect from `.codex/commands-codex10/architect-loop.md`, so fresh sessions continue inheriting the stale codex10 prompt path unless these mirrors are corrected.
- False Positives: Did not submit additional clarification-filter follow-up because active request `req-bc91cd31` already covers inbox type/request filtering and docs updates.

### Loop 2 Iteration 5 (2026-03-16)
- Successful Patterns: Outcome preflight (`loop-requests`) showed no newly completed/failed loop-2 requests (`req-315afdcf` remains `decomposed`, `req-6a20de1d` remains `integrating`), preventing speculative completion assumptions.
- Successful Patterns: Isolated temp-DB repro confirmed claimed-worker bypass with concrete before/after state (`claimed_by: "master-2"` -> successful assign -> `claimed_by: null`), keeping allocator-scope evidence high-confidence.
- Failed Patterns: `loop-request` payload wrapped in double quotes with backticks triggered shell command substitution, corrupting WHERE/WHAT text and causing `suppressed: quality_gate (missing concrete file path signal)`; future submissions must use single-quoted or heredoc-safe payloads.
- Codebase Gaps: `coordinator/src/cli-server.js` `assign-task` still ignores `claimed_by` and clears it on assignment while `coordinator/src/db.js` `claimWorker` reserves idle workers for Tier-2/Tier-3 coordination.
- False Positives: None this iteration.

### Loop 2 Iteration 6 (2026-03-16)
- Successful Patterns: Outcome preflight (`loop-requests`, `status`, and `request-history`) confirmed no newly completed/failed loop-2 requests and exposed active overlap boundaries before drafting (`req-315afdcf` decomposed, `req-6a20de1d` integrating).
- Successful Patterns: Combining direct source evidence (`coordinator/src/cli-server.js` assign-task guard/update path) with an isolated CLI-server runtime repro produced a high-confidence, non-speculative ownership-isolation request (`req-a179239f`).
- Failed Patterns: None observed in this iteration for loop 2.
- Codebase Gaps: `assign-task` still permits assignment when `workers.claimed_by` is set and clears the claim during assignment, so Tier-3 allocation can bypass Tier-2 worker reservations unless CLI-level claimed-worker rejection is enforced.
- False Positives: Did not treat `req-6a20de1d` as covering this gap completely; that request targets stale-claim timeout basis (`claimed_at`) and claim lifecycle consistency, not explicit assign-task rejection for active claims.

## Iteration Updates (2026-03-16, loop 3, iter 5)

### Successful Patterns
- Re-checking active loop-owned requests before new research prevented overlap: `req-bc91cd31` advanced to `2/3 completed` while `req-315afdcf` remained active with a queued recovery task, so no duplicate lifecycle request was submitted.

### Failed Patterns
- Attempting a placeholder `loop-request` as a readiness probe was suppressed by `quality_gate` (description too short/missing WHAT-WHERE-WHY), which consumed this iteration's submission slot under the "no retry after suppressed" rule.

### Codebase Gaps
- Active Architect launch path still prioritizes `.codex/commands-codex10/architect-loop.md` (`scripts/launch-agent.sh` lines 60-67), but that prompt remains stale versus `.codex/commands/architect-loop.md`: it still instructs writing `.codex/state/codex10.task-queue.json`/`codex10.handoff.json` and signaling `.codex10.task-signal` directly (commands-codex10 lines 205-228) even though coordinator DB task tables replaced queue files (`coordinator/src/schema.sql` line 22) and newer command guidance uses `create-task`/captured `task_id`/`triage` instead.

### False Positives
- Potential parity issue between `.codex/commands-codex10/architect-loop.md` and `templates/commands/architect-loop.md` was ruled out; they currently match, so drift is specifically against `.codex/commands/architect-loop.md` (runtime-safe variant), not template copy drift.

### Loop 3 Iteration 6 (2026-03-16)
- Successful Patterns: Phase-2 outcome review (`loop-requests`) showed `req-bc91cd31` completed, confirming that explicit WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE packets continue to land when scoped to one concrete architect-flow defect.
- Successful Patterns: Cross-checking runtime launch order (`scripts/launch-agent.sh`), setup propagation (`setup.sh`), and prompt parity diffs isolated a concrete residual codex10 architect-loop drift without overlapping active allocator/watchdog requests.
- Failed Patterns: `loop-request` submission was suppressed by `quality_gate` (`missing concrete change verb (WHAT)` and `missing production impact/risk signal (WHY)`); future submissions should start WHAT with a strict imperative verb (for example `Update`, `Replace`, `Remove`) and include explicit production-risk wording in WHY.
- Codebase Gaps: `.codex/commands-codex10/architect-loop.md` and `templates/commands/architect-loop.md` still contain deprecated Tier-3 file-handoff instructions (`clarification-queue.json`, `codex10.task-queue.json`, `codex10.handoff.json`, `.codex10.task-signal`) and Tier-2 `assign-task <task_id>` placeholder flow, while canonical `.codex/commands/architect-loop.md` documents DB-native `create-task` + `triage` flow.
- False Positives: None identified this iteration.

### Loop 2 Iteration 7 (2026-03-16)
- Successful Patterns: Phase-2 outcome review first (`loop-requests`) confirmed `req-a179239f` reached `completed`, reinforcing that allocator-scope requests with direct source contradiction plus reproducible runtime evidence continue to land.
- Successful Patterns: Combining source inspection (`coordinator/src/merger.js` completion gate) with live DB-state verification (completed requests still carrying `pending`/`in_progress` tasks) produced a single high-confidence lifecycle-integrity submission (`req-06a7ffa0`).
- Failed Patterns: None observed this iteration; no suppression or deduplication occurred.
- Codebase Gaps: `coordinator/src/merger.js` `checkRequestCompletion` marks requests `completed` based solely on merge_queue rows, without confirming all tasks are terminal, enabling false completion notifications while work is still active.
- False Positives: Initial suspicion focused on `merger.onTaskCompleted` failed-task handling; deeper runtime evidence showed the dominant completion-integrity fault is the merge-queue-only completion gate.

### Loop 3 Iteration 7 (2026-03-16)
- Successful Patterns: Re-validating prompt parity with direct file diffs (`.codex/commands/architect-loop.md` vs `.codex/commands-codex10/architect-loop.md`) plus runtime command-surface checks (`coordinator/bin/mac10`, `coordinator/src/cli-server.js`) produced a high-confidence, non-speculative architect-flow request (`req-a47dcccf`).
- Successful Patterns: Using strict imperative WHAT/WHERE/WHY/EVIDENCE/CONFIDENCE wording with explicit production-risk language cleared the prior quality-gate suppression pattern.
- Failed Patterns: None observed this iteration.
- Codebase Gaps: Active codex10 architect prompt mirrors still include Tier-2 `assign-task <task_id>` placeholder text and deprecated Tier-3 file-handoff instructions (`clarification-queue.json`, `codex10.task-queue.json`, `codex10.handoff.json`, `.codex10.task-signal`) while canonical `.codex/commands/architect-loop.md` documents DB-native `create-task` + `triage` flow.
- False Positives: `coordinator/src/cli-server.js` still writes request intake bridge data to `handoff.json`, but this does not serve as decomposition task ingestion; avoid treating that legacy bridge as evidence that Tier-3 task-queue file handoff is still the correct runtime path.

### Loop 2 Iteration 8 (2026-03-16)
- Successful Patterns: Phase-2 outcome review stayed useful; `loop-requests` showed `req-a179239f` completed with no loop-local failed requests, reinforcing that allocator requests with direct runtime/source contradiction continue to land when scoped tightly.
- Failed Patterns: Submission was suppressed by `quality_gate` (`missing concrete file path signal (WHERE)`) even with a structured WHAT/WHERE/WHY/EVIDENCE packet; keep WHERE as explicit standalone plain-path tokens and avoid punctuation-heavy markdown formatting in the same clause.
- Codebase Gaps: Master-3 runtime prompt source remains stale in `.codex/commands-codex10/allocate-loop.md` and `templates/commands/allocate-loop.md` (still references `request_ready_to_merge` and deprecated signal files) while runtime producers use allocator mailbox events; launch/setup paths prioritize and re-seed these stale mirrors.
- False Positives: Did not re-submit the claimed-worker assignment guard despite local reproduction because `origin/main` already contains the `claimed_by` rejection in `coordinator/src/cli-server.js`, indicating branch drift rather than a net-new upstream defect.

### Loop 3 Iteration 8 (2026-03-16)
- Successful Patterns: Phase-2 outcome review (`loop-requests`) confirmed both loop-owned requests reached `completed` (`req-a47dcccf`, `req-bc91cd31`), validating that prompt-parity submissions with explicit WHAT/WHERE/WHY/EVIDENCE continue to land when scoped to one concrete runtime contradiction.
- Successful Patterns: Checkpoint-guided follow-up (`check-completion req-a47dcccf`, prompt diffs, runtime event-producer scan) quickly isolated a non-overlapping residual gap in allocator prompt mirrors without re-opening already-fixed architect prompt drift.
- Failed Patterns: Submission was suppressed by loop cooldown (`loop-request` returned `suppressed: cooldown retry_after=79s`); per loop rules, do not retry within the same iteration.
- Codebase Gaps: `.codex/commands-codex10/allocate-loop.md` and `templates/commands/allocate-loop.md` still diverge from canonical `.codex/commands/allocate-loop.md`: they reference `request_ready_to_merge` and signal-file waits on `.codex10.task-signal`/`.codex10.fix-signal`/`.codex10.completion-signal` instead of mailbox-blocking `codex10 inbox allocator --block` plus runtime mailbox events (`tasks_ready`, `tasks_available`, `task_completed`, `task_failed`, `functional_conflict`, `merge_failed`).
- Codebase Gaps: `setup.sh` launches Master-3 from `.codex/commands-codex10/allocate-loop.md`, so stale allocator guidance is operational for fresh sessions.
- False Positives: None identified this iteration.

### Loop 2 Iteration 9 (2026-03-16)
- Successful Patterns: Phase-2 outcome review (`loop-requests`) confirmed stable completion behavior for loop-owned allocator fixes (`req-06a7ffa0`, `req-a179239f`) before new research, which kept overlap control strict while `req-315afdcf` remained decomposed and `req-6a20de1d` remained integrating.
- Successful Patterns: File-anchored parity checks across allocator prompt mirrors plus launch-path evidence (`scripts/launch-agent.sh` and `setup.sh`) produced a concrete, runtime-relevant contradiction packet without speculative source assumptions.
- Failed Patterns: `loop-request` was suppressed by quality gate (`missing production impact/risk signal (WHY)`) even with explicit WHAT/WHERE/EVIDENCE and standalone path tokens; future submissions must include unmistakable production-risk language in WHY (for example delayed assignment/integration, stale-ready backlog growth, or missed urgent fix handling).
- Codebase Gaps: `.codex/commands-codex10/allocate-loop.md` and `templates/commands/allocate-loop.md` still diverge from canonical `.codex/commands/allocate-loop.md` by using `request_ready_to_merge` and signal-file waits (`.codex10.task-signal`, `.codex10.fix-signal`, `.codex10.completion-signal`) instead of mailbox-blocking allocator flow.
- Codebase Gaps: Launch/setup paths still prioritize and re-seed the stale allocator mirror (`scripts/launch-agent.sh` prompt precedence and `setup.sh` allocator launch command text), so drift remains operationally active on fresh sessions.
- False Positives: None identified this iteration.

### Loop 3 Iteration 9 (2026-03-16)
- Successful Patterns: Phase-2 outcome review showed both loop-owned requests from prior iterations are completed (`req-a47dcccf`, `req-bc91cd31`), reinforcing that single-defect prompt/runtime parity requests with explicit WHAT/WHERE/EVIDENCE remain effective.
- Successful Patterns: Cross-validating canonical-vs-mirror allocator prompt lines with launch-path/runtime-producer anchors (`setup.sh`, `scripts/launch-agent.sh`, `coordinator/src/cli-server.js`, `coordinator/src/allocator.js`, `coordinator/src/watchdog.js`) kept the candidate non-speculative and non-overlapping.
- Failed Patterns: `loop-request` was suppressed by `quality_gate` (`missing production impact/risk signal (WHY)`) despite a detailed packet; next submission must phrase WHY as explicit production risk outcomes (for example delayed remediation/assignment/integration under live backlog) using direct runtime terms.
- Codebase Gaps: `.codex/commands-codex10/allocate-loop.md` and `templates/commands/allocate-loop.md` still instruct deprecated `request_ready_to_merge` and `.codex10.*` signal waits, while canonical `.codex/commands/allocate-loop.md` and runtime mail producers use mailbox-blocking allocator events.
- False Positives: None identified this iteration.

### Loop 2 Iteration 10 (2026-03-16)
- Successful Patterns: Phase-2 outcome review showed allocator-focused loop-2 requests `req-06a7ffa0` and `req-a179239f` are `completed` while active work (`req-315afdcf` decomposed, `req-6a20de1d` integrating) remained distinct, which kept overlap control tight before drafting.
- Successful Patterns: Re-submitting allocator prompt-mirror drift with strict imperative WHAT/WHERE and explicit production-risk WHY language passed quality gate and created `req-1c0d8c67`.
- Failed Patterns: Prior checkpoint suppression pattern (`missing production impact/risk signal (WHY)`) is confirmed; this iteration cleared it only after adding explicit liveness/failure/integrity impact terms tied to assignment and urgent-fix flow.
- Codebase Gaps: `.codex/commands-codex10/allocate-loop.md` and `templates/commands/allocate-loop.md` still direct Master-3 to `request_ready_to_merge` + `.codex10.*` signal waits, while canonical `.codex/commands/allocate-loop.md` and runtime emitters (`coordinator/src/allocator.js`, `coordinator/src/cli-server.js`, `coordinator/src/merger.js`, `coordinator/src/watchdog.js`) are mailbox-event driven.
- Codebase Gaps: `scripts/launch-agent.sh` prompt resolution prefers `.codex/commands-codex10/*` and `setup.sh` refresh-copies templates into `.codex/commands-codex10` while launching `/allocate-loop` from that path, so stale allocator mirror drift is operational on fresh starts.
- False Positives: None identified this iteration.

### Loop 3 Iteration 10 (2026-03-16)
- Successful Patterns: Phase-2 outcome review showed both prior loop-owned submissions completed (`req-a47dcccf`, `req-bc91cd31`), reinforcing that single-defect, file-anchored WHAT/WHERE/WHY/EVIDENCE packets continue to execute reliably.
- Successful Patterns: Re-validating active overlap before submission (`status`, `request-history`, `check-completion`) prevented duplicate allocator mirror requests once `req-1c0d8c67` was confirmed active (`decomposed`, `0/1`).
- Failed Patterns: None in this iteration (no new suppressed submission attempted).
- Codebase Gaps: Allocator prompt mirror drift remains operationally relevant but already in-flight via `req-1c0d8c67`; `.codex/commands-codex10/allocate-loop.md` and `templates/commands/allocate-loop.md` still reference `request_ready_to_merge` and `.codex10.*` signal waits while runtime producers emit mailbox events (`tasks_ready`, `tasks_available`, `task_completed`, `task_failed`, `functional_conflict`, `merge_failed`).
- False Positives: Avoided re-submitting allocator parity remediation because active request `req-1c0d8c67` already covers the validated gap.

### Loop 2 Iteration 11 (2026-03-16)
- Successful Patterns: Phase-2 outcome review first (`loop-requests`) kept overlap boundaries clear: loop-owned allocator requests `req-06a7ffa0` and `req-a179239f` remain completed, `req-1c0d8c67` advanced to `1/1 completed` and `integrating`, and active integration work (`req-315afdcf`, `req-6a20de1d`) stayed in-scope without duplicate submission.
- Successful Patterns: Checkpoint-guided lifecycle checks (`status`, `check-completion`, `request-history`, `merge-status`) plus direct source inspection in `coordinator/src/merger.js` produced concrete evidence quickly before drafting any request.
- Failed Patterns: None this iteration (no `loop-request` submission attempted).
- Codebase Gaps: Integration backlog remains active (`req-1c0d8c67`, `req-315afdcf`, `req-6a20de1d` all `integrating`) with multiple urgent ready fix tasks (`#43-#46`) still awaiting assignment while merge queue rows continue accumulating.
- False Positives: Local runtime still emits `functional_conflict` from `npm run build` missing script, but this branch-local contradiction was not submitted because `origin/main` already contains script-aware overlap-validation selection/parsing in `coordinator/src/merger.js`; treated as parity drift, not a new net request this iteration.

### Loop 3 Iteration 11 (2026-03-16)
- Successful Patterns: Phase-2 outcome review (`loop-requests`) confirmed this loop’s last two submissions (`req-a47dcccf`, `req-bc91cd31`) are completed, reinforcing that single-defect Architect-flow packets with explicit WHAT/WHERE/WHY/EVIDENCE remain high-yield.
- Successful Patterns: Pairing role-doc mirror inspection with runtime command-path checks (`coordinator/src/cli-server.js` `assign-task` vs `triage`) produced a concrete, file-anchored Master-2 backlog-lifecycle contradiction without speculative assumptions.
- Failed Patterns: `loop-request` submission was suppressed by `quality_gate` after shell interpolation corrupted the description (unescaped backticks/angle-bracket tokens in a quoted one-liner); use a single-quoted heredoc payload for request text to avoid command-substitution side effects.
- Codebase Gaps: `.codex/docs/master-2-role.md` and `templates/docs/master-2-role.md` Tier-2 protocol still omits explicit `codex10 triage <request_id> 2 ...` after `assign-task`, while runtime `coordinator/src/cli-server.js` updates request lifecycle to `decomposed` only in the `triage` handler. Both role-doc mirrors also still instruct touching `.codex/signals/.codex10.task-signal` for Tier-3 despite codex10 architect-loop guidance using DB-native `create-task`/`triage` flow and deprecating signal-file handoff.
- False Positives: The inbox type-filter contradiction remains reproducible in the local workspace, but request `req-bc91cd31` already tracks that scope and is completed; treated as already-covered work rather than a new submission target.

## Iteration Updates (Loop 2, Iteration 12 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 12: status/check-completion/merge-status preflight plus source+runtime contradiction proof (merger code + package scripts + live merge failures) yielded a concrete allocator/merger liveness request (req-64dd6533) with clear WHAT/WHERE/WHY/EVIDENCE.
- Loop 2 iteration 12: completed outcomes continued to cluster around narrow, file-anchored allocator lifecycle fixes (`req-06a7ffa0`, `req-a179239f`).

### Failed Patterns
- None observed in this iteration's completed/failed review (`loop-requests` showed no failed requests for loop 2).

### Codebase Gaps
- `coordinator/src/merger.js` `runOverlapValidation` still executes `npm run build` unconditionally when overlap validation is enabled, while `coordinator/package.json` has no `build` script. Runtime on 2026-03-16 shows repeated `overlap_validation_failed` and `functional_conflict` entries (`Missing script: "build"`) for merge ids #20, #23, #25, #26, creating urgent fix churn (#45/#46) and delaying integration.

### False Positives
- `req-315afdcf` looked still integrating early in this iteration, but later completed (`request_completed` logged at 2026-03-16 14:15:15); avoid resubmitting stale decomposed-zero-task recovery unless status regresses.

### Loop 4 Iteration 1 (2026-03-16)
- Successful Patterns: Pairing role-doc inspection (`.codex/docs/master-2-role.md`, `templates/docs/master-2-role.md`) with coordinator command handlers (`coordinator/src/cli-server.js` `triage` vs `assign-task`) produced a concrete lifecycle contradiction tied to Architect Tier-2/Tier-3 execution, not a cosmetic wording-only issue.
- Successful Patterns: Adding setup/runtime path checks (`.codex/commands-codex10/architect-loop.md` startup context load and `setup.sh` docs copy at line 174) strengthened operational impact evidence for docs drift.
- Failed Patterns: `loop-request` submission was suppressed by `quality_gate` (`missing concrete file path signal (WHERE)`) because the WHERE section used punctuation/backtick-heavy formatting; future submissions should keep WHERE as plain standalone path tokens.
- Codebase Gaps: `.codex/docs/master-2-role.md` and `templates/docs/master-2-role.md` Tier-2 protocol still omits explicit `codex10 triage <request_id> 2 ...` after `assign-task`, while runtime only transitions request lifecycle in `triage` (`coordinator/src/cli-server.js` lines 1084-1090); this can leave assigned requests appearing pending.
- Codebase Gaps: Both role-doc mirrors still instruct touching `.codex/signals/.codex10.task-signal` after Tier-3 decomposition (docs lines 132/138 and template lines 131/137), contradicting canonical Architect loop guidance that decomposition is DB-native and should not use signal-file handoff (`.codex/commands/architect-loop.md` line 252).
- False Positives: None identified this iteration.

## Iteration Updates (Loop 2, Iteration 13 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 13: checkpoint-guided preflight (`loop-requests`, `status`, `check-completion`, `merge-status`) avoided overlap with active requests (`req-64dd6533`, `req-1c0d8c67`, `req-6a20de1d`) before drafting any new allocator/merger candidate.
- Loop 2 iteration 13: combining source proof (`coordinator/src/merger.js` `processQueue` unconditional `readyTaskCount > 0` deferral) with runtime sequencing (`merge_deferred_assignment_priority` bursts between worker death and next assignable worker) produced a concrete, non-speculative liveness gap candidate.

### Failed Patterns
- Loop 2 iteration 13: `loop-request` submission was suppressed by `quality_gate` (`missing concrete change verb (WHAT)` and `missing production impact/risk signal (WHY)`) when the request text used descriptive language but not an explicit imperative change verb and risk framing; next submission should start WHAT with direct verbs (`Change`, `Gate`, `Require`) and include explicit operator impact (integration stall/backlog growth/fix latency).

### Codebase Gaps
- `coordinator/src/merger.js` `processQueue` currently defers merge processing on any `getReadyTasks().length > 0` when `prioritize_assignment_over_merge` is enabled, without checking idle unclaimed worker availability. Runtime on 2026-03-16 showed repeated `merge_deferred_assignment_priority` while no assignment could proceed after worker-4 heartbeat death/task requeue, delaying merge attempts until a worker became assignable.

### False Positives
- None identified this iteration.
- Loop 2 iteration 13 outcome update: `req-1c0d8c67` moved to `failed`; request result reports unresolved merge conflict (`gh pr merge .../pull/54 --merge` not mergeable, merge_queue #24 status `conflict`). Keep allocator/merger follow-ups conflict-aware when evaluating prompt-mirror remediation impact.

### Loop 4 Iteration 3 (2026-03-16)
- Successful Patterns: Phase-2 review first (`loop-requests`) confirmed loop-owned request `req-9a2e8f54` reached `completed`, then targeted parity checks (`diff`, `rg`) against `.codex/docs/master-2-role.md`, `templates/docs/master-2-role.md`, and architect-loop mirrors avoided duplicate Tier-2/Tier-3 drift submissions.
- Successful Patterns: Pairing prompt-contract evidence (`loop-prompt 4` task templates), runtime status failures (`codex10 status` merge queue), and source truth (`coordinator/package.json` scripts) produced a concrete architect-flow defect candidate tied to active integration liveness impact.
- Failed Patterns: `loop-request` submission was suppressed by `quality_gate` (`missing production impact/risk signal (WHY)`) even with liveness wording; future WHY blocks should start with explicit operator-impact phrasing (for example "causes live integration stalls and backlog growth") before technical details.
- Codebase Gaps: Master-2 instruction mirrors still hardcode `"validation":"npm run build"` in Tier-2/Tier-3 `create-task` examples (`.codex/commands-codex10/architect-loop.md`, `.codex/commands/architect-loop.md`, `templates/commands/architect-loop.md`, role-doc task template snippets), while this repo has no build script and merge status shows repeated `functional_conflict: Command failed: npm run build` failures.
- False Positives: The only remaining diff between `.codex/docs/master-2-role.md` and `templates/docs/master-2-role.md` in this pass was a duplicate clarification-wait command-table row; treated as low-impact wording/parity noise rather than a standalone high-confidence runtime request.

## Iteration Updates (Loop 2, Iteration 15 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 15: combining source proof (`coordinator/src/merger.js` unconditional `readyTaskCount > 0` deferral) with live runtime telemetry (`merge_deferred_assignment_priority` plus `loop_heartbeat_stale`) produced a concrete, non-overlapping liveness packet that passed submission (`req-49605905`).
- Phase-2 outcome review continues to reward narrow, imperative WHAT/WHERE requests tied to concrete runtime contradictions (recent completed set remains `req-06a7ffa0`, `req-a179239f`, `req-315afdcf`).

### Failed Patterns
- Loop 2 phase-2 review still shows request `req-1c0d8c67` in `failed` status due unresolved PR merge conflict; avoid proposing prompt-mirror-only follow-ups without confirming mergeability path.

### Codebase Gaps
- `coordinator/src/merger.js` assignment-priority gate can starve merge processing indefinitely when ready tasks persist and allocator loops are stale; runtime logs on 2026-03-16 show repeated deferrals while pending merge rows age.

### False Positives
- `check-completion req-1c0d8c67` reports `ALL DONE` while request status is `failed`; treated this iteration as observability confusion only (not submitted) because starvation defect had stronger direct production impact and evidence.

## Iteration Updates (Loop 4, Iteration 4 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 4: phase-2 review confirmed loop-owned completion (`req-9a2e8f54`) and showed no new loop-owned failures, reinforcing that file-anchored Architect instruction drift fixes are completing when scoped to mirror parity.
- Loop 4 iteration 4: pairing live runtime evidence (`codex10 status` merge backlog failing on `npm run build`) with direct source contradictions (`coordinator/package.json` has no `build`, and loop prompt/docs still hardcode build validation) produced an accepted, high-specificity request (`req-3e4154f2`).

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- Master-2 Architect prompt/docs/templates still default Tier-1/Tier-2/Tier-3 validation examples to `npm run build`, despite repository scripts exposing `npm test` only; this continues to seed failing validation commands into decomposition/task flows and merge integration.

### False Positives
- `req-64dd6533` (merger runtime validation gating) is related but non-overlapping with instruction-layer prompt/doc defaults; scope separation remained valid for this iteration.

## Iteration Updates (Loop 4, Iteration 5 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 5: phase-2 outcome review first (`loop-requests` + `request-history`) confirmed `req-9a2e8f54` completed while `req-3e4154f2` remained active, which prevented duplicate submission and kept scope on net-new contradictions only.
- Loop 4 iteration 5: high-signal evidence still comes from pairing runtime prompt payloads (`loop-prompt`) with exact source-path anchors (`.codex/commands-codex10/architect-loop.md`, `coordinator/src/db.js`, `coordinator/src/cli-server.js`).

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- Active loop directives remain snapshot-persisted in `loops.prompt`: `loop-prompt 4` still returns hardcoded `npm run build` blocks (lines 142/190/239 in payload) even though `.codex/commands-codex10/architect-loop.md` now contains script-aware validation guidance. `coordinator/src/db.js` `createLoop` persists prompt text at creation and `coordinator/src/cli-server.js` `loop-prompt` returns the stored prompt directly.
- Runtime CLI still lacks a loop prompt refresh/update command (`coordinator/bin/mac10` LOOPS help exposes `loop-prompt`/`loop-request`/`loop-requests` only), so active loops cannot adopt instruction-file updates without lifecycle intervention.

### False Positives
- Remaining `npm run build` literals in `templates/docs/master-2-role.md` and `templates/commands/architect-loop.md` were treated as active-work overlap with `req-3e4154f2` (`task #59 in_progress`), so no duplicate request was submitted.

## Iteration Updates (Loop 2, Iteration 16 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 16: checkpoint-directed runtime revalidation (`status`, `merge-status`, `check-completion`, `request-history`, coordinator log) quickly confirmed live allocator/merger pressure and prevented speculative scope drift.
- Loop 2 iteration 16: origin/main parity checks before submission filtered a high-confidence-looking local contradiction (`check-completion`/`ALL DONE` labeling on failed request) that is already fixed upstream.

### Failed Patterns
- Loop 2 iteration 16: no new `loop-request` was submitted; existing failed request `req-1c0d8c67` remains unresolved due merge conflict (`gh pr merge .../pull/54` not mergeable).

### Codebase Gaps
- Merge queue liveness remains degraded in runtime (`merge_deferred_assignment_priority` repeats while pending merge rows #31/#32/#33 age); remediation is already in-flight via `req-49605905`.
- Overlap validation still hard-fails on missing `npm run build` in this runtime view, continuing failed merge churn; remediation is already in-flight via `req-64dd6533`.
- Duplicate pending merge rows for the same PR identity remain visible in runtime state; remediation is already in-flight via `req-e252166f`.

### False Positives
- Local branch still reports `check-completion req-1c0d8c67` as `ALL DONE` while request status is `failed`, but `origin/main` already contains failed-aware completion semantics/labels and merger gating; treated as branch drift, not a net-new request.

### Loop 4 Iteration 6 (2026-03-16)
- Successful Patterns: Phase-2 outcome review first (`loop-requests`, `status`, `check-completion`) confirmed prior loop-owned completion (`req-9a2e8f54`) and isolated active overlap (`req-3e4154f2`) before drafting any new request.
- Successful Patterns: High-confidence submission quality remained strongest when combining live runtime contradiction checks (`loop-prompt 4` output) with direct coordinator source anchors (`coordinator/src/db.js` `createLoop`, `coordinator/src/cli-server.js` `loop-prompt`, `coordinator/bin/mac10` LOOPS surface); this produced accepted request `req-ed004636`.
- Failed Patterns: None observed in this iteration.
- Codebase Gaps: Active loops persist prompt snapshots in `loops.prompt` without a prompt refresh command, so instruction fixes in `.codex/commands*/architect-loop.md` do not apply to running loops unless operators stop/recreate them.
- False Positives: None identified this iteration.

## Iteration Updates (Loop 2, Iteration 17 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 17: phase-2 `loop-requests` review continued to show allocator-focused completed work clustered around precise imperative packets (`req-06a7ffa0`, `req-a179239f`, `req-315afdcf`) while active in-flight requests stayed distinct (`req-49605905`, `req-64dd6533`, `req-e252166f`).
- Loop 2 iteration 17: checkpoint-directed runtime checks (`status`, `merge-status`, `check-completion`, `request-history`, `ready-tasks`, `worker-status`) plus origin/main parity prevented speculative submission while integration/decomposition work is still active.

### Failed Patterns
- Loop 2 iteration 17: request `req-1c0d8c67` remains `failed` due unresolved merge conflict (`PR #54 not mergeable`); avoid drafting follow-up mirror/doc requests until mergeability state converges.

### Codebase Gaps
- Runtime still shows merge backlog pressure and historical overlap-validation churn (`functional_conflict: npm run build`) while remediation requests remain in-flight (`req-64dd6533`, `req-49605905`) and dedupe work (`req-e252166f`) is not yet completed.
- Ready task `#57` (deduplicate merge queue rows by request + PR identity) remains unassigned in this snapshot, so queue dedupe effects cannot be assessed yet.

### False Positives
- `check-completion req-1c0d8c67` reports `ALL DONE` in this branch despite request status `failed`, but origin/main already carries failed-aware completion semantics (`request_status`, `all_completed`) and integrate gating; treated as branch drift, not a new request.
- Local `complete-task` path allows duplicate completion side effects for the same task id in this branch, but origin/main already routes through worker-task ownership validation before completion; treated as branch drift for this iteration.

## Iteration Updates (Loop 2, Iteration 18 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 18: phase-2 `loop-requests` review plus live runtime checks (`status`, `merge-status`, `check-completion`) quickly confirmed that active allocator/merger defects are already covered by in-flight requests (`req-49605905`, `req-64dd6533`, `req-e252166f`) and avoided duplicate submissions.
- Loop 2 iteration 18: direct state verification via codex10 DB queries (`requests`/`tasks`/`merge_queue` for req-1c0d8c67, req-e252166f, req-64dd6533, req-49605905) strengthened confidence in no-submit decisions by replacing assumption with runtime evidence.

### Failed Patterns
- Loop 2 iteration 18: no new loop-request submitted; unresolved failed request remains `req-1c0d8c67` (merge conflict: PR #54 not mergeable).

### Codebase Gaps
- `req-e252166f` task `#57` (merge queue dedupe by request+PR identity) remains `ready`/unassigned while workers are idle in this snapshot, so duplicate-merge churn mitigation cannot be evaluated yet.
- Runtime still shows pending merge backlog rows (`#31`-`#36`) with historical failed/conflict rows tied to missing-build validation churn; this remains aligned to already-open remediation requests.

### False Positives
- `check-completion req-1c0d8c67` still reports `ALL DONE` while request status is `failed`, but merge queue evidence shows terminal conflict state without fresh completion progress; treated as known semantics/drift risk, not a new high-confidence allocator request this iteration.

## Iteration Updates (Loop 4, Iteration 7 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 7: checkpoint-directed outcome review (`loop-requests`, `status`, `check-completion`) confirmed no newly completed/failed loop-4 requests before deeper research, preventing overlap with active integrating work (`req-ed004636`, `req-3e4154f2`).
- Loop 4 iteration 7: pairing direct source inspection of sentinel precheck logic (`scripts/loop-sentinel.sh` and `.codex/scripts/loop-sentinel.sh`) with an executable runtime repro (sentinel grep expression vs `loop-requests --json`) produced high-confidence evidence of a live active-request counting defect.

### Failed Patterns
- Loop 4 iteration 7: `loop-request` submission for the sentinel precheck bug was suppressed by per-loop cooldown (`reason=cooldown`, `retry_after=54s`), so no request was created this iteration; do not retry in the same iteration.

### Codebase Gaps
- Loop sentinel active-request precheck is currently ineffective in both sentinel script copies: it runs `loop-requests` without `--json` but greps for JSON status keys, yielding `ACTIVE_COUNT=0` even when loop requests are still `integrating`.

### False Positives
- None identified this iteration.

## Iteration Updates (Loop 4, Iteration 8 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 8: phase-2 review (`loop-requests`) plus checkpoint-directed runtime checks (`status`, `check-completion`, `request-history`) avoided overlap with active integrating requests (`req-ed004636`, `req-3e4154f2`) while preserving a net-new sentinel defect scope.
- Loop 4 iteration 8: strongest submission packet remained file-anchored WHAT/WHERE/WHY/EVIDENCE with executable repro data (plain `loop-requests` output, script-equivalent grep count, and `--json` active-status count), producing accepted request `req-f345a353`.

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- Sentinel active-request precheck is still incorrect in both script copies (`scripts/loop-sentinel.sh` and `.codex/scripts/loop-sentinel.sh`): it greps for JSON status keys against plain-text `loop-requests` output, yielding `ACTIVE_COUNT=0` while active integrating loop requests exist.

### False Positives
- No additional loop-4 overlap candidates were identified beyond active integrating requests already tracked by this loop (`req-ed004636`, `req-3e4154f2`).

## Iteration Updates (Loop 2, Iteration 19 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 19: phase-2 outcome review (`loop-requests` + `request-history`) again showed completed allocator requests clustered around precise WHAT/WHERE/WHY/EVIDENCE packets (`req-06a7ffa0`, `req-a179239f`, `req-315afdcf`), so the same narrow structure remained reliable for new submissions.
- Loop 2 iteration 19: combining runtime state contradiction (`requests.status='completed'` with lingering `ready` tasks), direct source proof (`coordinator/src/db.js` `getReadyTasks` and `checkAndPromoteTasks` lack request-status guards), and live deferral telemetry (`merge_deferred_assignment_priority`) produced accepted request `req-8bb682bc`.

### Failed Patterns
- Loop 2 iteration 19: prior failed request `req-1c0d8c67` remains unresolved (merge conflict: PR #54 not mergeable); avoid prompt-mirror-only follow-ups without validating mergeability path first.

### Codebase Gaps
- Terminal request task leakage: tasks from completed requests can still be promoted/listed as ready, inflating allocator pressure and contributing to merge deferral churn.

### False Positives
- `worker-1` showing `busy` with `current_task_id` null looked suspicious initially, but without a reproducible ownership break or task-loss path this iteration treated it as insufficient-evidence noise.

## Iteration Updates (Loop 4, Iteration 9 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 9: phase-2 outcome review first (`loop-requests`) surfaced one loop-owned completion (`req-9a2e8f54`) and isolated active overlap (`req-f345a353`, `req-ed004636`, `req-3e4154f2`) before new research, preventing duplicate submission.
- Loop 4 iteration 9: checkpoint-directed verification with `status`, `check-completion`, `request-history`, and direct sentinel file inspection confirmed remediation progress without speculative follow-on requests.

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- Sentinel precheck fix is in a transient split state: `.codex/scripts/loop-sentinel.sh` now uses JSON-aware active counting with fallback, while `scripts/loop-sentinel.sh` still has the old plain-text grep block. This remains covered by active request `req-f345a353` (`task #61` in progress), so no new request was submitted.
- Loop prompt payload for loop 4 still contains `npm run build` template defaults because active prompt-refresh/validation remediation is still integrating (`req-ed004636`, `req-3e4154f2`).

### False Positives
- Apparent missing `loop-refresh-prompt` command in local source search was treated as in-flight integration overlap with `req-ed004636`, not a new defect.

## Iteration Updates (Loop 2, Iteration 20 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 20: checkpoint-directed runtime verification (`status`, `merge-status`, `ready-tasks`, `worker-status`, `check-completion`) quickly confirmed stale terminal-request ready tasks remain present but are already covered by active request `req-8bb682bc`, preventing duplicate submission.
- Loop 2 iteration 20: validating a suspected claimed-worker assignment regression against `origin/main` before drafting avoided a branch-drift false positive; local `coordinator/src/cli-server.js` lacks the guard, but `origin/main` already includes `worker_claimed` rejection in `assign-task`.

### Failed Patterns
- Loop 2 iteration 20: no new submission; prior failed request remains `req-1c0d8c67` (`PR #54 not mergeable`).

### Codebase Gaps
- Active request `req-8bb682bc` is still executing (`task #62` in progress), and runtime still shows stale `ready` tasks `#2`/`#3` tied to terminal request `req-387d807e` until that fix lands.
- Ready backlog still includes allocator-routing work (`task #57`, request `req-e252166f`) while merge queue retains pending rows, so assignment-vs-merge pressure remains unresolved pending in-flight remediations.

### False Positives
- Local branch evidence suggested `assign-task` claim bypass in `coordinator/src/cli-server.js`, but upstream parity check showed this is already fixed on `origin/main`; treated as branch drift, not a new loop request.

## Iteration Updates (Loop 4, Iteration 10 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 10: phase-2 review first (`loop-requests`) plus checkpoint-directed checks (`status`, `check-completion`, `request-history`) confirmed one loop-owned completion (`req-9a2e8f54`) and kept this pass focused on active-overlap monitoring instead of duplicate submission.
- Loop 4 iteration 10: direct parity checks across runtime surface and source (`loop-prompt`, `coordinator/bin/mac10` LOOPS help, `scripts/loop-sentinel.sh`, `.codex/scripts/loop-sentinel.sh`) gave high-confidence evidence that tracked defects are still in-flight, supporting a no-submit decision.

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- Runtime still serves stale loop prompt payload text containing `npm run build`/`validation:"npm run build"`, and current CLI help still lacks a prompt-refresh command; this remains covered by active integrating request `req-ed004636` and validation-default request `req-3e4154f2`.
- Sentinel precheck parity remains split between script copies (`scripts/loop-sentinel.sh` old grep logic vs `.codex/scripts/loop-sentinel.sh` JSON-aware logic); this remains covered by active integrating request `req-f345a353`.

### False Positives
- `check-completion` reporting `ALL DONE` while request status is still `integrating` was treated as expected integration/merge-queue lag for this pass, not a net-new request defect.

## Iteration Updates (Loop 2, Iteration 21 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 21: phase-2 outcome review still showed allocator-focused completed requests (`req-06a7ffa0`, `req-a179239f`, `req-315afdcf`) using tight WHAT/WHERE/WHY/EVIDENCE packets, while non-overlap checks against active in-flight work (`req-8bb682bc`, `req-e252166f`, `req-49605905`, `req-64dd6533`, `req-6a20de1d`) kept scope distinct.
- Loop 2 iteration 21: pairing source-level contradiction in `coordinator/src/watchdog.js` (`loop_heartbeat_stale` log-only branch) with runtime `activity_log` evidence (repeated stale-heartbeat events plus persistent `tasks_available`/ready backlog) produced accepted request `req-0eb53b12`.

### Failed Patterns
- Loop 2 iteration 21: prior failed request `req-1c0d8c67` remains unresolved due merge conflict (`PR #54 not mergeable`); avoid allocator prompt-mirror follow-ups without mergeability remediation.

### Codebase Gaps
- `coordinator/src/watchdog.js` `monitorLoops()` has no stale-heartbeat recovery path when loop tmux panes stay alive: stale loops are logged indefinitely (`loop_heartbeat_stale`) but not restarted, allowing allocator-ready backlog to persist despite idle workers.

### False Positives
- Runtime ready-task leakage for completed request `req-387d807e` and duplicate merge ownership remain valid issues, but both are already covered by active requests (`req-8bb682bc`, `req-e252166f`), so they were not re-submitted.

## Iteration Updates (Loop 4, Iteration 11 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 11: running phase-2 outcome checks first (`loop-requests` + `request-history`) surfaced one completed request (`req-9a2e8f54`) and three active integrating overlaps, which prevented duplicate submission and kept scope aligned.
- Loop 4 iteration 11: high-signal packets still correlate with completion when they include exact WHAT/WHERE/WHY/EVIDENCE and explicit command-surface contradictions (confirmed by completed `req-9a2e8f54`).

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- Active overlap remains on loop sentinel parity: `scripts/loop-sentinel.sh` still uses plain-text grep for JSON status fields in `ACTIVE_COUNT`, while `.codex/scripts/loop-sentinel.sh` already uses JSON-aware counting; this is covered by integrating request `req-f345a353`.
- Active overlap remains on loop prompt/runtime refresh + validation-default remediation: `coordinator/bin/mac10` still lacks a prompt-refresh command and templates still contain `npm run build` literals; both are covered by integrating requests `req-ed004636` and `req-3e4154f2`.

### False Positives
- No net-new defects were submitted because all observed contradictions map directly to active integrating loop-owned requests.

## Iteration Updates (Loop 2, Iteration 22 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 22: phase-2 review showed previously completed loop-owned requests (`req-06a7ffa0`, `req-a179239f`, `req-315afdcf`) all used explicit WHAT/WHERE/WHY/EVIDENCE framing, reinforcing that tightly scoped lifecycle contradictions continue to land.
- Loop 2 iteration 22: pairing runtime contradiction checks (`loop-requests --json` plus `check-completion`) with exact source call sites (`coordinator/src/merger.js`, `coordinator/src/cli-server.js`) produced a non-overlapping high-confidence submission (`req-0b10b9da`).

### Failed Patterns
- Loop 2 iteration 22: previously failed request `req-1c0d8c67` remains unresolved (`PR #54 not mergeable`), so prompt-mirror-only follow-ons remain risky until mergeability is repaired.

### Codebase Gaps
- Request lifecycle transitions back to active states can retain stale completion metadata (`completed_at`/`result`), yielding `integrating` requests that still read as previously completed.

### False Positives
- Merge backlog/assignment-pressure signals remain real but are still covered by active requests (`req-8bb682bc`, `req-e252166f`, `req-49605905`, `req-0eb53b12`), so no duplicate submission was made for those areas.

## Iteration Updates (Loop 4, Iteration 12 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 12: phase-2 outcome review with `loop-requests`, `status`, `request-history`, and `check-completion` confirmed the same high-signal request packet shape that completed `req-9a2e8f54` (explicit WHAT/WHERE/WHY/EVIDENCE anchored to concrete command-surface contradictions).
- Loop 4 iteration 12: using overlap-first parity checks across live prompt output (`loop-prompt 4`) and source mirrors (`.codex/commands-codex10/architect-loop.md`, `templates/commands/architect-loop.md`, sentinel script copies) prevented a duplicate submission while tracked loop-owned requests remain in integration.

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- `coordinator/src/watchdog.js` `monitorLoops()` skips active loops that do not have `tmux_window` (`if (!loop.tmux_window) continue`), while non-tmux loop launch path in `coordinator/src/index.js` creates sentinels without setting `tmux_window`; this leaves non-tmux stale/dead loop recovery unmonitored and should be revisited after current stale-loop request `req-0eb53b12` resolves to avoid overlap.
- Runtime still reports `req-f345a353`, `req-ed004636`, and `req-3e4154f2` as integrating even though `check-completion` reports `1/1 completed — ALL DONE`; this remains an integration-lifecycle observability gap but no non-overlapping fix candidate was isolated this pass.

### False Positives
- `check-completion` "ALL DONE" for integrating requests looked like a new defect candidate, but evidence in this iteration was insufficient to separate command semantics from known merge/integration lag, so no request was submitted.

## Iteration Updates (Loop 2, Iteration 22B - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 22B: phase-2 review again showed completed allocator-scope requests (`req-06a7ffa0`, `req-a179239f`, `req-315afdcf`) share the same narrow WHAT/WHERE/WHY/EVIDENCE packet structure, so keeping requests tightly file/function anchored remains the highest-confidence style.
- Loop 2 iteration 22B: combining live runtime telemetry (`status`, `ready-tasks`, `worker-status`, `merge-status`) with DB activity evidence (`tasks_available`/`merge_deferred_assignment_priority` loops) allowed a high-confidence no-submit decision when observed failures were already covered by active urgent requests.

### Failed Patterns
- Loop 2 iteration 22B: failed request `req-1c0d8c67` remains unresolved (`PR #54 not mergeable conflict`), so doc/prompt mirror follow-ups continue to be low-yield until mergeability is remediated.

### Codebase Gaps
- Control-plane stall remains live after watchdog respawn: activity_log shows `loop_sentinel_dead` + `loop_sentinel_respawned` for loops 2/4 at `2026-03-16 18:49:58-18:49:59`, but subsequent cycles continue logging `allocator tasks_available` (`ready_count` climbing 6->8, `idle_count` 4) and `merge_deferred_assignment_priority` with no corresponding allocator-loop assignment activity.
- Urgent unblock requests (`req-8a810649`, `req-9c1897eb`) and ready fix tasks (`#64`, `#65`) are now present specifically to address this stall; defer duplicate submissions while those remain active.

### False Positives
- `check-completion` returning `ALL DONE` for integrating requests (`req-49605905`, `req-64dd6533`) looked suspicious, but this iteration lacked proof of a new correctness defect beyond known integration lag/merge queue backlog; treated as insufficient evidence for a net-new allocator request.

## Iteration Updates (Loop 2, Iteration 23 - 2026-03-16)

### Successful Patterns
- Loop 2 iteration 23: replaying checkpoint-directed runtime checks (`status`, `ready-tasks`, `worker-status`, `request-history`, `check-completion`) before drafting prevented duplicate submissions and confirmed that urgent unblock work is already in-flight.
- Loop 2 iteration 23: pairing CLI state with DB telemetry (`activity_log`, `loops`, `tasks`) provided high-confidence evidence for a no-submit decision when contradictions map directly to active remediation requests.

### Failed Patterns
- Loop 2 iteration 23: previously failed request `req-1c0d8c67` remains unresolved (`PR #54 not mergeable conflict`), so allocator prompt-mirror-only follow-ups remain low-yield until mergeability is repaired.

### Codebase Gaps
- Control-plane stall remains live: `activity_log` repeatedly records `loop_heartbeat_stale` for loops 2 and 4 (stale_sec ~349-441) while allocator logs continue `tasks_available` (`ready_count:8`, `idle_count:4`) and urgent tasks `#64`/`#65` remain `ready` and unassigned.
- Loop runtime state shows loops 2 and 4 as `status=active` with `pid=null`, indicating stale-loop recovery is still not restoring assignment throughput.

### False Positives
- The priority override not starting (`req-b78f6d2b` still `pending 0/0`) appeared like a new submission candidate, but it is directly covered by active urgent requests `req-9c1897eb` (task #64) and `req-8a810649` (task #65), so no duplicate request was submitted.

## Iteration Updates (Loop 4, Iteration 13 - 2026-03-16)

### Successful Patterns
- Loop 4 iteration 13: checkpoint-directed overlap gating (`loop-requests --json`, `status`, `check-completion`, `request-history`) prevented duplicate submissions against active loop-lifecycle requests and kept scope to a distinct handler-level contradiction.
- Loop 4 iteration 13: combining source inspection (`coordinator/src/cli-server.js` + `coordinator/bin/mac10`) with a live DB-backed repro (before/after `last_heartbeat`) produced a high-confidence lifecycle defect candidate.

### Failed Patterns
- Loop 4 iteration 13: high-confidence request submission for the loop-heartbeat mutation defect was suppressed by loop-request cooldown (`retry_after=52s`); do not retry in the same iteration.

### Codebase Gaps
- `coordinator/src/cli-server.js` `loop-heartbeat` mutates `loops.last_heartbeat` for stopped loops before returning status. Runtime repro on 2026-03-16: loop 10 had `status=stopped,last_heartbeat=null` before heartbeat; `./.codex/scripts/codex10 loop-heartbeat 10` returned `Loop stopped` (exit 2), but DB row after call showed `last_heartbeat=2026-03-16T19:00:58.328Z`.
- `coordinator/tests/cli.test.js` currently covers create/stop loop flows but has no regression test asserting `loop-heartbeat` must not mutate stopped/paused loops.

### False Positives
- The existing stopped-loop checkpoint mutation defect remains valid but is already covered by pending request `req-29cca40f`; no duplicate submission was made.

## Iteration Updates (Loop 11, Iteration 1 - 2026-03-16)

### Successful Patterns
- Loop 11 iteration 1: pairing role-doc command-block inspection with runtime formatter code (`coordinator/bin/mac10` `printStatus`) plus a minimal shell repro produced a high-confidence, non-speculative backlog-drain correctness request (`req-f00e258e`).
- Loop 11 iteration 1: focusing on one concrete WHAT/WHERE/WHY/EVIDENCE contradiction in active Master-2 startup guidance avoided broad parity churn and yielded a targeted submission.

### Failed Patterns
- Loop 11 iteration 1: request text that includes shell substitution tokens like `$(...)` can be mangled during `loop-request` invocation if not fully escaped; keep evidence commands described as plain text to avoid interpolation artifacts.

### Codebase Gaps
- `.codex/docs/master-2-role.md` Backlog Drain Control still uses grep-based `[pending]` parsing for `pending_count` and `oldest_pending_id`, which can miscount and misorder backlog draining when request descriptions contain the same token.
- `coordinator/bin/mac10` `printStatus` renders request descriptions on the same line as status (`${r.description.slice(0, 60)}`), so token-based grep parsing in docs is structurally unsafe compared with anchored status-column parsing.

### False Positives
- Existing stale-signal and prompt-refresh defects were not resubmitted because active requests (`req-f345a353`, `req-ed004636`, `req-3e4154f2`) already cover those areas.

## Iteration Updates (Loop 12, Iteration 1 - 2026-03-16)

### Successful Patterns
- Loop 12 iteration 1: combining active-request overlap checks (`status`, `request-history`) with direct command-handler inspection (`coordinator/src/cli-server.js` + `coordinator/bin/mac10`) and an executable DB-backed repro produced an accepted non-overlapping lifecycle request (`req-ff5ba957`).
- Loop 12 iteration 1: request packet quality stayed high by anchoring WHAT/WHERE to one handler (`loop-heartbeat`) and including concrete before/after loop-row telemetry evidence.

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- `coordinator/src/cli-server.js` `loop-heartbeat` writes `loops.last_heartbeat` even when loop status is `stopped`/`paused`; CLI correctly exits 2 for stopped loops, but DB telemetry is still mutated.
- `coordinator/tests/cli.test.js` currently has loop create/stop coverage but no loop-heartbeat regression asserting stopped-loop immutability for `last_heartbeat`.

### False Positives
- Existing pending request `req-29cca40f` only covers `loop-checkpoint` gating; it does not address `loop-heartbeat` mutation, so this iteration's submission was not a duplicate.

## Iteration Updates (Loop 13, Iteration 1 - 2026-03-16)

### Successful Patterns
- Loop 13 iteration 1: combining direct source inspection (`coordinator/src/cli-server.js`, `coordinator/bin/mac10`) with a DB-backed stopped-loop heartbeat repro quickly revalidated the lifecycle contradiction with concrete before/after telemetry.
- Loop 13 iteration 1: pre-submit overlap gating (`status` + `request-history`) prevented duplicate submission by confirming active pending coverage in `req-ff5ba957`.

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- `coordinator/src/cli-server.js` `loop-heartbeat` still updates `last_heartbeat` for stopped loops before returning status; local repro on 2026-03-16 showed loop 19 moving from `last_heartbeat:null` to a fresh timestamp after `loop-heartbeat` exited with code 2 (`Loop stopped`).
- Regression coverage remains absent in `coordinator/tests/cli.test.js` for stopped/paused loop heartbeat immutability, increasing risk of lifecycle telemetry regressions.

### False Positives
- No request was submitted because this exact defect is already captured by pending request `req-ff5ba957`; re-submission would be duplicate overlap.

## Iteration Updates (Loop 18, Iteration 1 - 2026-03-16)

### Successful Patterns
- Loop 18 iteration 1: checking loop-scoped overlap first (`loop-requests --json`) and then global queue state (`status`) prevented duplicate submissions when heartbeat/checkpoint lifecycle defects were already pending (`req-ff5ba957`, `req-29cca40f`).
- Loop 18 iteration 1: pairing direct handler inspection (`coordinator/src/cli-server.js`, `coordinator/bin/mac10`) with a live stopped-loop repro (`loop-heartbeat` exit 2 plus before/after DB heartbeat timestamps) provided high-confidence evidence for a no-submit decision.

### Failed Patterns
- None observed in this iteration.

### Codebase Gaps
- `coordinator/src/cli-server.js` still updates `loops.last_heartbeat` in `loop-heartbeat` before callers enforce stopped/paused exit behavior; repro on 2026-03-16 for loop 10 showed timestamp change `2026-03-16T19:00:58.328Z -> 2026-03-16T19:10:44.211Z` while command returned `Loop stopped` (exit 2).
- `coordinator/tests/cli.test.js` still lacks a regression asserting stopped/paused loop heartbeat immutability, so this lifecycle contradiction can regress silently.

### False Positives
- No new request was submitted because the reproduced defect is already covered by pending `req-ff5ba957`, and stopped-loop checkpoint gating remains covered by pending `req-29cca40f`.
