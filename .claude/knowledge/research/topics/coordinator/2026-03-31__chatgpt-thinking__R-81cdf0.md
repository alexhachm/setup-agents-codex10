---
kind: research_note
scope: project
id: R-81cdf0
title: "coordinator — ChatGPT thinking research"
created: 2026-03-31
updated: 2026-03-31
topics:
  - coordinator
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What is the architecture, key files, and patterns of the coordinator domain?

# Findings
I’m treating the coordinator domain as the runtime orchestration path from CLI/bootstrap through agent lifecycle, worktree/session management, shell control loops, and state transitions. I’ll first map the repo structure and coordinator entry points, then tie key files to responsibilities and extract the main architecture patterns, trade-offs, risks, and implementation guidance.

---

The hot path looks state-centric: SQLite/WAL and a local CLI socket drive allocation, health/recovery, and merge loops through pluggable isolation backends. Early read: src/db.js and src/cli-server.js carry most policy, while index.js mainly wires subsystems together.

---

Two important nuances emerged: the allocator is thin—mainly promotion/recovery plus nudging the allocator agent—so assignment largely happens through CLI commands and agent decisions. Also, the README’s dashboard/diagnostics path is outdated; current architecture is headless-first, with GUI pieces effectively legacy.

---

The main remaining architectural tension is boundary erosion: the control-plane model itself is coherent, but persistence, command routing, recovery, and newer features have accumulated into a few oversized modules.

---

Based on the current main branch, I’d describe the coordinator domain as a headless local control plane for agent execution, not as the UI/Electron layer. coordinator/package.json points to src/index.js; that bootstrap acquires a namespaced PID lock, initializes SQLite, starts the CLI server plus allocator/watchdog/merger loops, checks tmux/Docker/msb availability, and installs callbacks that spawn both worker-sentinel.sh and loop-sentinel.sh. The bin/mac10 binary is a thin local client that discovers a Unix socket, TCP bridge, or Windows named pipe and sends JSON commands to the daemon.
GitHub
+2
GitHub
+2

One subtle but important point: the README still talks about a dashboard and diagnostics API, but the current coordinator bootstrap comments the GUI path as “disabled — outdated,” and src/hub.js exits immediately with the dashboard disabled. So for architecture analysis, I would treat the headless coordinator path as authoritative and the dashboard/UI path as legacy or paused work.
GitHub
+3
GitHub
+3
GitHub
+3

1. Breakdown of the problem and key considerations

The right way to analyze this coordinator is to separate five concerns: authoritative state, command ingress, runtime reconciliation, worker isolation, and agent context shaping. In this repo, the coordinator’s real contract is the SQLite schema: requests, tasks, workers, mail, merge_queue, loops, config, and activity_log, plus browser-research, project-memory, and insight tables. The schema comments explicitly say that requests replaces handoff.json, tasks replace task-queue/worker JSON state, workers replace worker-status.json, and mail replaces signal files + IPC. WAL mode, busy timeout, and foreign keys are enabled.
GitHub
+3
GitHub
+3
GitHub
+3

If I compress the architecture into one sentence, it is this: the coordinator domain is a SQLite-backed state machine, exposed through a command server, with timer-driven reconcilers around unreliable external agents and shells. The README says “LLMs do coding work; Node.js does coordination,” and the current code matches that: the Node process owns state and lifecycle, while architect/allocator/workers act through CLI commands, mailbox rows, tmux windows, and sentinels rather than living inside the coordinator process.
GitHub
+4
GitHub
+4
GitHub
+4

A useful mental model is the request flow. mac10 sends a JSON command to the local coordinator; cli-server.js validates and handles the command; the coordinator persists lifecycle changes; agents are nudged through the mail table and, in one legacy path, through handoff.json plus a touched signal file; allocator/watchdog/merger loops then keep the system moving and repair drift; when a task is assigned, index.js writes an overlay into the worker worktree and spawns a worker sentinel using the strongest available isolation backend.
GitHub
+5
GitHub
+5
GitHub
+5

Key files I would treat as the coordinator core

coordinator/src/index.js is the runtime bootstrap and composition root. It initializes the DB, starts the CLI server, allocator, watchdog, and merger, sets the tmux session, chooses worker isolation in the order msb → Docker → tmux, spawns worker and loop sentinels, and auto-launches Master-1 when tmux is available.
GitHub

coordinator/src/schema.sql is the canonical protocol surface. It defines request/task/worker/mail/merge/loop state, plus indexes and default config. Architecturally, this file tells you more than any README because it encodes the lifecycle vocabulary and the persistence boundaries.
GitHub
+2
GitHub
+2

coordinator/src/db.js is, in practice, the de facto domain kernel. That is an inference, but a grounded one: startup calls db.init(), allocator/watchdog/merger all delegate lifecycle work to db.* helpers, and db.js also owns migrations for liveness recovery, usage telemetry, browser offload, research batching, and project-memory indexing.
GitHub
+4
GitHub
+4
GitHub
+4

coordinator/src/cli-server.js is not a thin socket wrapper; it is a large application-service layer. It contains command schemas for user, architect, worker, and browser flows, and it still has a compatibility bridge that writes handoff.json and touches a signal file to wake the architect. coordinator/bin/mac10 is the matching client transport.
GitHub
+2
GitHub
+2

coordinator/src/allocator.js is a notifier/recovery loop, not a full scheduler. It promotes dependency-ready tasks, recovers stalled assignments, signals research-batch availability, and sends tasks_available mail to the allocator role when ready tasks and idle workers coexist.
GitHub

coordinator/src/watchdog.js is a reconciliation engine more than a monitor. It does backend-specific death detection, heartbeat escalation, auto-reset of completed workers, stale-claim cleanup, orphan-task recovery, request lifecycle reconciliation, stale integration recovery, loop monitoring/respawn, merge-queue self-healing, and periodic purge work.
GitHub
+4
GitHub
+4
GitHub
+4

coordinator/src/merger.js is a merge pipeline with explicit conflict strategy. It periodically processes the merge queue, can defer merging to preserve assignment throughput, retries recoverable conflicts, validates overlaps, tries clean merge via gh, then rebase-and-retry, then escalates unresolved cases back to the allocator.
GitHub
+3
GitHub
+3
GitHub
+3

coordinator/src/worker-backend.js, tmux.js, sandbox-manager.js, and microvm-manager.js form the runtime adapter layer. They unify tmux windows, Docker containers, and microsandbox microVMs behind one worker-lifecycle interface.
GitHub
+3
GitHub
+3
GitHub
+3

coordinator/src/overlay.js, knowledge-metadata.js, and insight-ingestion.js show a second important side of the coordinator: it shapes agent behavior by writing AGENTS.md/CLAUDE.md overlays, tracks knowledge staleness/coverage, and turns lifecycle events into deduplicated insight artifacts.
GitHub
+2
GitHub
+2

coordinator/src/hub.js is currently a legacy path. It explicitly says the hub/dashboard is disabled and exits immediately.
GitHub

Patterns that define the coordinator domain

The strongest pattern is “database as protocol.” The coordinator does not just store state in SQLite; it uses SQLite as the coordination medium itself. The mail table, merge_queue, loops, and the status columns across requests/tasks/workers encode the live protocol between Node and the agents.
GitHub
+2
GitHub
+2

The second pattern is “reconciler loops over unreliable actors.” Instead of assuming agents and shells behave correctly, the system runs periodic loops that promote work, recover stale assignments, detect dead workers, respawn loops, and self-heal merge/worktree inconsistencies. That is a very strong fit for shell-sentinel and worktree-based systems, where external processes are failure-prone.
GitHub
+2
GitHub
+2

The third pattern is “adapter-based isolation.” The coordinator treats execution isolation as a pluggable concern: tmux for the lightest path, Docker for container isolation, and msb for stronger microVM isolation, with a runtime fallback chain managed centrally in index.js.
GitHub
+4
GitHub
+4
GitHub
+4

The fourth pattern is “prompting via filesystem overlays.” Rather than only passing arguments to agents, the coordinator materializes task context, knowledge, validation instructions, UI-verification hints, and protocol rules into AGENTS.md/CLAUDE.md inside each worktree. That is a coordinator-domain pattern, not just a prompting trick, because it makes the coordinator responsible for agent cognition boundaries.
GitHub
+1

The fifth pattern is “best-effort observability and learning.” insight-ingestion.js deliberately never throws, deduplicates semantic events, and stores merge/watchdog/allocator insights as artifacts. That means learning/analytics is treated as side-band and failure-tolerant, not as part of the transactional hot path.
GitHub

The sixth pattern is “compatibility layers survive migrations.” The schema says mail and DB rows replace old file-based coordination, but cli-server.js still contains bridgeToHandoff() for handoff.json plus a signal touch. That is a strong sign the coordinator is mid-migration rather than fully normalized around one protocol.
GitHub
+2
GitHub
+2

2. Trade-offs between different approaches

SQLite-centric control plane vs. direct in-memory/event-bus coordination: the current approach wins on restartability, auditability, and crash recovery because all important lifecycle state is durable and queryable. The downside is that logic can sprawl into status fields, SQL updates, and JSON blobs, which is exactly why db.js has become such a large, multipurpose file. For this style of autonomous local system, I think the durability benefits are worth it.
GitHub
+3
GitHub
+3
GitHub
+3

Periodic reconcilers vs. purely event-driven orchestration: allocator/watchdog/merger running on 2s/10s/5s cadences makes the system tolerant of missed events, dead shells, and external drift. The cost is lag, repeated DB work, and more subtle eventual-consistency behavior. In a worktree + shell-sentinel environment, I would still favor the reconciler model over a fragile “every transition must be synchronous and perfect” model.
GitHub
+2
GitHub
+2

LLM-mediated allocator/architect roles vs. deterministic scheduler/decomposer: the current coordinator explicitly signals an allocator role through mail instead of doing all placement itself, and the architect path is external enough that cli-server.js still maintains a handoff bridge. That buys flexibility for high-context routing and decomposition, but it creates a dependency on those agent roles being alive and current. The Node coordinator is therefore robust at state management but not fully sovereign at decision-making.
GitHub
+2
GitHub
+2

One unified schema for orchestration + browser research + project memory vs. smaller bounded contexts: the unified DB gives you provenance across everything, which is valuable. The cost is domain bloat: the coordinator now owns request/task/worker/merge state, browser sessions/jobs, research batches/intents, project-memory snapshots, and insight artifacts. That is powerful, but it makes the coordinator harder to reason about as a pure orchestration core.
GitHub
+2
GitHub
+2

Prompt overlays vs. minimal runtime contracts: overlays let the coordinator hand workers rich, debuggable context in their worktrees. The risk is prompt sprawl, stale knowledge, and subtle divergence between what the DB says and what the overlay says. This is a good pattern, but it needs strict budgeting and freshness rules.
GitHub
+1

3. Reasoned recommendation

My recommendation is to keep the current architectural shape—a headless Node coordinator with SQLite as source of truth, a local command boundary, periodic reconcilers, and pluggable isolation backends—but to refactor the coordinator domain into explicit bounded modules rather than continuing to let db.js and cli-server.js absorb everything. The current shape is right for autonomous coding; the current packaging of that shape is what needs improvement.
GitHub
+4
GitHub
+4
GitHub
+4

I would also keep the coordinator strictly outside Electron/UI ownership. The repo already trends that way: the authoritative runtime is headless, while the dashboard path is disabled/outdated. For a multi-agent coding system, that separation is desirable. Let Electron or any future UI be a client of the coordinator’s protocol, not the keeper of request/task/worker truth.
GitHub
+2
GitHub
+2

The most valuable design correction would be to draw a hard line between transport, domain services, repositories/migrations, and legacy compatibility. Right now cli-server.js is both the socket/API boundary and a big application layer, while db.js is both persistence and lifecycle logic. That works, but it is the main reason the coordinator domain is harder to extend safely than it needs to be.
GitHub
+3
GitHub
+3
GitHub
+3

I would also add a minimal deterministic fallback scheduler inside Node. Today the allocator loop mostly wakes the allocator agent when there are ready tasks and idle workers. That is elegant, but it means throughput depends on that role being healthy. A simple fallback policy—priority first, dependencies satisfied, optional domain affinity—would make the coordinator sovereign in failure cases without taking rich routing away from the allocator role in normal cases.
GitHub
+1

Finally, I would either fully retire the handoff.json/signal bridge or quarantine it under an explicit legacy/ boundary. Running both the DB/mail protocol and the handoff-file protocol at once is survivable, but it is exactly the kind of thing that creates ghost bugs in multi-agent systems.
GitHub
+2
GitHub
+2

4. Risks, edge cases, and pitfalls

The biggest structural risk is dual-protocol drift. The schema says DB + mail are the new source of truth, but cli-server.js still writes handoff.json and touches a signal file for the architect. If those paths ever disagree about request state or wake-up semantics, debugging gets ugly fast.
GitHub
+2
GitHub
+2

A second risk is doc/runtime mismatch. The README still advertises a dashboard and diagnostics API, while index.js and hub.js mark the GUI/dashboard path as disabled. Operators can lose time debugging “architecture” that is no longer actually running.
GitHub
+3
GitHub
+3
GitHub
+3

A third risk is recovery overlap and race conditions. Both allocator and watchdog recover stalled/orphaned assignments, watchdog also reconciles active requests and merge queue state, and merger itself performs recovery sweeps on stale conflict rows. That is survivable only if transitions are idempotent and transactionally guarded.
GitHub
+2
GitHub
+2

A fourth risk is backend divergence. Worker liveness means different things in tmux, Docker, and msb; output capture differs; microVMs do not expose host PIDs; and fallback behavior changes by platform. The code handles this, but every additional backend increases test-matrix complexity.
GitHub
+4
GitHub
+4
GitHub
+4

A fifth risk is worktree/branch/remote drift during integration. The watchdog already has self-healing logic for missing worktrees, branch mismatches, and missing remote branches, and merger handles retryable conflicts and worktree-aware rebases. That tells you this class of failure is expected, not hypothetical.
GitHub
+3
GitHub
+3
GitHub
+3

A sixth risk is prompt/context bloat. The overlay can inject task details, validation commands, UI testing hints, domain knowledge, codebase context, research rollups, owner intent, knowledge gaps, and known mistakes into every worker worktree. That is powerful, but it can become stale or simply too large.
GitHub
+1

A seventh risk is scope creep inside the coordinator core. Browser offload, research batching, project-memory snapshots, insight artifacts, and orchestration all share one schema and, in practice, one domain package. The upside is provenance; the downside is that changing “the coordinator” now means touching a much wider conceptual surface.
GitHub
+3
GitHub
+3
GitHub
+3

5. Concrete implementation guidance

If I were hardening this coordinator domain, I would refactor toward this shape:

coordinator/src/
  bootstrap/
    index.js
  transport/
    cli-server.js
    command-schemas/
    command-handlers/
  domain/
    requests.js
    tasks.js
    workers.js
    mailbox.js
    merges.js
    loops.js
  runtime/
    allocator-loop.js
    watchdog-loop.js
    merger-loop.js
  infra/
    db/
      connection.js
      migrations/
      repositories/
  backends/
    tmux.js
    docker.js
    sandbox.js
  prompting/
    overlay.js
  features/
    knowledge/
    research/
    project-memory/
  legacy/
    handoff-bridge.js
    hub.js

That structure matches what the code is already trying to do implicitly: index.js composes services, cli-server.js is transport, allocator/watchdog/merger are runtime loops, backend files are adapters, and overlay/knowledge/research are feature modules. The gain is not “prettier folders”; the gain is that each state transition gets one obvious home.
GitHub
+5
GitHub
+5
GitHub
+5

Concretely, I would extract service-layer APIs from db.js first. For example: requestService.createRequest(), taskService.assignReadyTask(), workerService.heartbeat(), mergeService.transitionToMerging(), loopService.recordHeartbeat(). Under those, repositories should do CRUD/queries only, and migrations should live separately. That would preserve the SQLite-first architecture while making invariants explicit instead of scattered through command handlers and loops.
GitHub
+4
GitHub
+4
GitHub
+4

Next, I would make cli-server.js a true boundary layer: parse command, validate schema, call one domain service, return a result. The current command richness is fine; the issue is that ingress, validation, compatibility bridges, and business logic are too entangled. Separate command handlers by actor role if that helps.
GitHub
+2
GitHub
+2

Then I would define central transition maps for request/task/worker/merge/loop statuses, similar to the allowed-transition style already used for browser offload and research stages. That would make watchdog, merger, and CLI commands converge on one lifecycle truth instead of repeating status strings and edge-case fixes.
GitHub
+3
GitHub
+3
GitHub
+3

I would also add two operational safeguards. First, a deterministic fallback assigner after allocator inactivity, so ready work does not stall forever waiting for an allocator agent. Second, a strict legacy toggle for the handoff bridge, so you can run in either “DB/mail only” mode or “compatibility bridge” mode, but not silently both. Those two changes would reduce the coordinator’s most obvious failure modes without changing its overall philosophy.
GitHub
+2
GitHub
+2

Lastly, I would reconcile the docs and package surface with the actual runtime. If the dashboard stays disabled, remove or clearly label those README paths and consider dropping stale web dependencies. If it is coming back, make index.js/hub.js honest about that. In coordinator systems, architectural ambiguity is itself a bug.
GitHub
+4
GitHub
+4
GitHub
+4

My bottom line: keep the coordinator as a SQLite-backed, headless, self-healing control plane; do not collapse it into the UI; but aggressively split transport, lifecycle services, persistence, and legacy compatibility into clearer boundaries. That preserves the repo’s strongest architectural choice while reducing the main source of future fragility.
GitHub
+3
GitHub
+3
GitHub
+3

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/coordinator/_rollup.md
