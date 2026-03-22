---
doc_kind: reference
scope: project
owner: domains/dashboard-ui
last_verified: 2026-03-16
rot_risk: medium
related_paths:
  - gui/public/app.js
  - gui/public/popout.js
  - coordinator/tests/dashboard-render.test.js
---

# Dashboard UI

## Executive Summary
- Renders task telemetry chips (routing, usage, budget) in both dashboard and popout surfaces
- Accepts telemetry from three shapes: snake_case fields, camelCase aliases, and nested objects (`routing`, `usage`)
- Biggest foot-gun: failing to normalize all alias shapes causes silent chip omission or indicator flicker
- Budget and cache-hit computations have edge cases requiring clamping and denominator-switching logic

## Invariants and Contracts
- All chip text must pass through `escapeHtml` before rendering (XSS prevention)
- Each chip is conditional per field: null/absent values must cleanly omit the chip, never render empty
- Budget snapshot keys must be preserved across websocket refreshes by merging previous and next state
- Cache-hit ratio clamped to `0..1` before percent formatting

## Key Patterns
- **Telemetry alias resolution**: `readTaskTelemetry` accepts top-level snake_case, camelCase, and nested object keys; use `pickTelemetryValue` for null-safe reads
- **Cache-creation chips**: aggregate `cache-create` plus TTL variants (`cache-create-5m`, `cache-create-1h`) from `usage_cache_creation_*` fields
- **Budget indicator**: detect wrapped `routing_budget_state` objects; summarize from `parsed.flagship` for constrained/healthy status
- **Popout parity**: prepend `renderBudgetIndicator(data)` in popout `renderTasks`; reuse dashboard helpers
- **Cache-hit denominator**: use `cached/input` normally; switch to `cached/(input+cached)` when `cached_tokens > input_tokens` (Anthropic-style payloads)

## Pitfalls
- **Indicator flicker**: omitting budget key merge across refreshes causes indicators to disappear momentarily
- **Alias drift**: adding a new telemetry field without all three shapes (snake, camel, nested) breaks one surface
- **Cache-hit > 100%**: Anthropic-style payloads report uncached input separately; without denominator switch the ratio overflows

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
