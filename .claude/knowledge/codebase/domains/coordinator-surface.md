# coordinator-surface Domain Knowledge

## Key Files
- `coordinator/src/cli-server.js` — Unix socket server. All commands go through a big switch. Schema in `COMMAND_SCHEMAS` object at top validates required fields and types.
- `coordinator/bin/mac10` — CLI binary. Add `case 'cmd':` blocks before `default:`, update `printUsage()` text.
- `coordinator/src/db.js` — Database layer. Key functions: `listProjectMemorySnapshots`, `listInsightArtifacts`, `listProjectMemoryLineageLinks`, `getProjectMemorySnapshot`, `getInsightArtifact`.

## Patterns
- CLI command schema: add entry to `COMMAND_SCHEMAS` object with `required: []` and `types: {}` field type definitions
- CLI handler: add `case 'cmd-name': { ... respond(conn, { ok: true, ... }); break; }` before `default:`
- `gh pr create` must be run from repo root (`/mnt/c/Users/Owner/Desktop/setup-agents-codex10`), NOT from worktree path

## Memory Retrieval APIs (added T-12)
- CLI: `memory-snapshots [filters]`, `memory-snapshot <id> [--lineage]`, `memory-insights [filters]`, `memory-insight <id> [--lineage]`, `memory-lineage [filters]`
- Filter params: `--context`/`project_context_key`, `--request-id`, `--task-id`, `--validation`, `--min-relevance`, `--lineage-type`, `--limit`, `--offset`
- Responses include `validation_status`, `relevance_score`, `governance_metadata`, `lineage` (when `--lineage`/`include_lineage=true`)

## DB Schema for Memory
- `project_memory_snapshots` — versioned snapshots keyed by `project_context_key`
- `insight_artifacts` — insights with `artifact_type`, `relevance_score`, `validation_status`
- `project_memory_lineage_links` — connects snapshots/artifacts to requests/tasks/runs with `lineage_type` (origin, derived_from, supports, supersedes, validated_by, consumed_by)
- `project_memory_snapshot_index` — fast lookup of latest snapshot per context key

## Gotchas
- `gh pr create` must be run from repo root, not worktree — worktrees cause "not a git repository" error
- `node --check` only validates JS syntax; index.html/SQL must be verified manually or via tests
- Edit tool requires reading file first in same session — always Read before Edit
- Rebase can fail with "local changes would be overwritten" spuriously — retry and it works
