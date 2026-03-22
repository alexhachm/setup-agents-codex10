---
doc_kind: reference
scope: project
owner: domains/coordinator-telemetry
last_verified: 2026-03-16
rot_risk: low
related_paths:
  - coordinator/src/web-server.js
  - coordinator/src/cli-server.js
  - coordinator/src/db.js
  - coordinator/src/schema.sql
---

# Coordinator Telemetry

## Executive Summary
- Handles routing telemetry hydration for status and task display surfaces.
- `model_source` is hydrated from task rows first, then from `activity_log` `task_assigned` details as fallback.
- Raw usage payloads survive via `tasks.usage_payload_json`; mapped `usage_*` columns serve aggregate queries.
- Audio token aliases map to canonical `usage_input_audio_tokens` / `usage_output_audio_tokens`.

## Invariants and Contracts
- `model_source` hydration: task-row value preferred, fallback to latest allocator `task_assigned` log by `task_id`.
- Budget snapshot in `/api/status` reuses `buildStatePayload`.
- `usage_payload_json` persisted at same write point as mapped `usage_*` columns.
- Column additions require the three-surface rule: `schema.sql`, migration in `db.js`, `VALID_COLUMNS` allowlist.

## Key Patterns
- Shared `buildStatePayload` keeps `/api/status` and websocket `init/state` in sync.
- Parsed payload fallbacks exposed in API: `usage`, `usage_payload`, `usagePayload` for dashboard consumers.

## Pitfalls
- When task-row routing fields are null, do NOT add schema changes; fall back to `activity_log` telemetry.
- Audio token migration columns must match both CLI parser and server normalizer canonical names.

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
