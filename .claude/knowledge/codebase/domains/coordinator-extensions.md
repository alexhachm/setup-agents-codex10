# coordinator-extensions Domain

## Overview
Extension modules that augment the coordinator core with worker isolation backends, knowledge tracking, event ingestion, and worker instruction generation.

---

## Modules

### overlay.js
**Purpose:** Generates per-task CLAUDE.md/AGENTS.md overlays written to each worker's worktree.

**Key functions:**
- `generateOverlay(task, worker, projectDir)` — composes base role doc + task-specific sections
- `buildTaskOverlay(task, worker, projectDir)` — assembles markdown: task metadata, files, validation, domain knowledge, research excerpts, knowledge gaps, pitfalls, protocol
- `writeOverlay(...)` — writes to both CLAUDE.md and AGENTS.md in the worker worktree
- `isSafeDomainSlug(domain)` — path-traversal guard for domain slugs

**Coupling:** reads knowledge-metadata.js (gap detection), .claude/knowledge/ files, .claude/knowledge/research/topics/ rollups.

---

### knowledge-metadata.js
**Purpose:** Tracks domain coverage staleness via .claude/knowledge/codebase/.metadata.json.

**Key functions:**
- `incrementChanges(projectDir, domain)` — bumps changes_since_research (called by mac10 CLI)
- `incrementWorkerPatches(projectDir, domain)` — tracks worker patches per domain
- `getDomainCoverage(projectDir)` — scans codebase/domains/ for markdown files
- `getResearchCoverage(projectDir)` — scans .claude/knowledge/research/topics/ for rollups
- `getKnowledgeStatus(projectDir)` — aggregated status for dashboard + overlay

**Coupling:** feeds overlay.js Knowledge Gaps section; called by mac10 CLI.

---

### insight-ingestion.js
**Purpose:** Captures coordinator lifecycle events as project memory (SQLite insight_artifacts). Never throws.

**Key functions:**
- `ingestInsight({project_context_key, event_type, payload, semantic_key})` — SHA-256 dedup fingerprint + write to db
- `ingestMergeEvent(eventType, data)` — merger lifecycle (success/fail/conflict)
- `ingestWatchdogEvent(eventType, data)` — worker_death, loop_respawn, stale_integration_recovered
- `ingestAllocatorEvent(eventType, data)` — research_batch_available etc.

**Relevance scores:** functional_conflict=850, worker_death=800, merge_failed=750, request_completed=700.

**Coupling:** imports db.js; called by merger.js, watchdog.js, allocator.js.

---

### sandbox-agent-bridge.js
**Purpose:** HTTP/SSE client for sandbox-agent API running in worker containers/microVMs (default port 2468).

**Key functions:**
- `connectToWorker(workerId, host, port)` — returns connection object
- `startTask(conn, taskId, prompt, agent)` — POST /sessions to create agent session
- `streamTaskEvents(conn, sessionId, callback)` — SSE stream of task events
- `resolvePermission(conn, sessionId, questionId, answer)` — answers sandbox permission prompts
- `postMessage(conn, sessionId, message)` — sends follow-up prompts to running session

**Coupling:** db.js for session logging; no SDK dependency (sandbox-agent lives in worker image).

---

### worker-backend.js
**Purpose:** Strategy pattern — abstracts tmux, Docker, and microsandbox (msb) backends behind a uniform interface.

**Backends:** tmux (default), docker (Phase 3), sandbox (Phase 5, microVMs).

**Common interface:** isAvailable(), createWorker(name, cmd, cwd, envVars), isWorkerAlive(name), killWorker(name), listWorkers(), captureOutput(name, lines).

**Multi-project isolation:** setProjectContext(namespace, projectDir) → MD5(projectDir) prefix for container names prevents collisions across concurrent mac10 instances.

**Selection:** MAC10_WORKER_BACKEND env var (default: tmux).

**Coupling:** tmux.js (default), sandbox-manager.js, microvm-manager.js.

---

### sandbox-manager.js
**Purpose:** Docker image lifecycle and container health for the Docker worker backend.

**Key functions:**
- `buildImage(projectDir)` — builds mac10-worker:latest from sandbox/Dockerfile.worker (5 min timeout)
- `ensureReady(projectDir)` — Docker check + build image if missing
- `getStatus(projectDir)` — docker_available, image_built, containers, mode (docker-first vs tmux-fallback)
- `startContainer` — delegates to worker-backend.dockerBackend

**Coupling:** db.js (logging/config); startContainer re-enters worker-backend.js.

---

### microvm-manager.js
**Purpose:** Microsandbox (msb) server lifecycle. Parallel to sandbox-manager.js for hardware-isolated microVMs.

**Key functions:**
- `startServer()` — launches msb server start --dev --detach
- `ensureReady()` — install check + server start + 2s settle
- `listSandboxes()` — parses msb status table output
- `getStatus()` — msb_installed, server_running, sandboxes, default_image

**Coupling:** db.js for logging; structurally mirrors sandbox-manager.js.

---

## Coupling Hotspots

| Source | Target | Why |
|--------|--------|-----|
| overlay.js | knowledge-metadata.js | Gap detection in overlay |
| insight-ingestion.js | db.js | All lifecycle events to SQLite |
| sandbox-manager.js | worker-backend.js | startContainer delegates to dockerBackend |
| worker-backend.js | tmux.js | Default path for all worker ops |
| sandbox-agent-bridge.js | db.js | Session/permission logging |

## Key Patterns
- overlay.js is the orchestration hub — pulls from all knowledge subsystems to build the worker prompt.
- insight-ingestion.js is partial-failure safe — callers never need try/catch.
- worker-backend Phase 5 (sandbox) requires msb CLI — not default.
- Docker and sandbox backends both namespace by MD5(projectDir) for concurrent mac10 safety.
