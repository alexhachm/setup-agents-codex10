# Topic
OAuth/connector framework patterns (Nango incremental syncing + schema generation changes)

## Sources (URLs)
- https://nango.dev/docs/updates/dev

## Relevance to 10.2
10.2’s connector framework needs resilient incremental sync semantics, predictable schema/type generation, and well-defined data retention behavior for cached connector data.

## Findings
- Nango introduced “checkpoints” for incremental syncing (2026-02-05), where sync functions declare a checkpoint schema and explicitly call `getCheckpoint()` and `saveCheckpoint()` to persist progress mid-execution, replacing the older `syncType: 'incremental'` + `nango.lastSyncDate` approach ([Nango dev updates](https://nango.dev/docs/updates/dev)).
- Nango added cache retention policies starting 2026-01-08: payload pruning after 30 days without updates (metadata retained) and hard deletion if a sync hasn’t executed for 60 days ([Nango dev updates](https://nango.dev/docs/updates/dev)).
- Nango is deprecating generation of `.nango/schema.ts` and `.nango/schema.json` on 2026-04-16; guidance is to export types directly from sync/action files (via `z.infer`) and to use per-sync `json_schema` embedded in `.nango/nango.json` or generate JSON Schema via Zod v4’s `z.toJSONSchema()` ([Nango dev updates](https://nango.dev/docs/updates/dev)).

## Recommended Action
- For 10.2 connectors, adopt checkpoint-based progress as the primary incremental sync contract (explicit “save progress” calls), because it supports mid-run recovery and avoids “all-or-nothing” delta state ([Nango dev updates](https://nango.dev/docs/updates/dev)).
- Define connector cache retention as an explicit product behavior (prune payload vs. delete metadata), and document the timeline so users understand why old data may not be retrievable while still allowing change detection ([Nango dev updates](https://nango.dev/docs/updates/dev)).
- Avoid relying on generated global schema artifacts; instead, treat schemas as code-owned exports (typed models + JSON schema derivation) to prevent naming conflicts and reduce build-time magic ([Nango dev updates](https://nango.dev/docs/updates/dev)).

## Priority
High
