# Allocation Learnings
<!-- Updated 2026-03-13T02:49:30Z by Master-3 -->

## Worker Performance
- worker-2 remained the most effective owner for recurring coordinator-routing functional-conflict fixes; same-worker reassignment preserved context across task chain #94/#96/#101/#104/#108.
- worker-1 handled orchestration-docs merge-fix cycles consistently, but repeated validator failures (npm run build missing script) produced recurring fix churn.
- worker-4 was effective for coordinator-routing overlap fixes when immediately reassigned after idle transitions.

## Task Duration Actuals
- Idle-gated same-worker fixes were usually assigned within a single polling window once target worker transitioned idle.
- Merge conflict remediation for req-a0b3fcce/req-592efca7 repeatedly re-entered queue due validator-path failures, increasing end-to-end integration latency.

## Allocation Decisions
- Enforcing assignment-first throughput and immediate idle-transition assignment cleared urgent ready backlogs quickly (#94/#95/#96, then #101/#104/#108).
- Deduplicating by current task state before creating new fixes reduced redundant task creation for already-active remediation chains.
- Deferring integration whenever ready tasks were present prevented merge throughput from starving assignment throughput.

## Fix Cycle Patterns
- Dominant recurrence source: merge validator invoking npm run build in a repo without a build script; this repeatedly emits functional_conflict and merge_failed across multiple historical tasks.
- Requests req-a0b3fcce and req-592efca7 repeatedly spawn follow-on fixes against the same file set (coordinator/src/overlay.js and worker-loop docs for a0; coordinator/src/cli-server.js + coordinator/tests/cli.test.js for 592efca7).
