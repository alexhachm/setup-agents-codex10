
## 2026-03-12 — Task telemetry rendering notes
- In the dashboard task panel, parse telemetry fields with tolerant aliases (`routing_*`, `budget_*`, and optional nested `routing`) so UI remains stable across mixed payload versions.
- Preserve prior budget snapshot keys when later websocket payloads omit them to avoid indicator flicker/disappearance.
- Keep chip rendering conditional per field and always pass dynamic values through `escapeHtml`.

## 2026-03-12 — Task/status telemetry rendering notes
- Dashboard task cards can safely read routing telemetry from multiple key shapes (`snake_case`, `camelCase`, nested `routing`) and should ignore null/empty values.
- Preserve budget snapshot context across websocket/status refreshes by merging previous and next state budget keys (`routing_budget_*`, `budget_*`, camelCase variants).
- Keep chip text XSS-safe by escaping both labels and values before rendering HTML.

## 2026-03-12 — Usage telemetry chip rendering notes
- Dashboard and popout task telemetry can reuse the existing chip helpers while adding usage aliases from `usage_*`, camelCase, and optional nested `usage` payload fields.
- Keep usage chip output conditional per field (`model`, `input/output/cached/total tokens`, `cost_usd`) so null/absent values cleanly omit chips and avoid empty rows.
- Dashboard render regression coverage can validate both surfaces by adding a popout render harness in `coordinator/tests/dashboard-render.test.js` alongside the existing dashboard harness.

## 2026-03-12 — Worker 4 follow-up check
- No new task assignment received after startup/follow-up polling; no code changes made this session.
## 2026-03-13 — Usage reasoning/prediction telemetry chips
- Dashboard and popout usage telemetry renderers should treat `usage_reasoning_tokens`, `usage_accepted_prediction_tokens`, and `usage_rejected_prediction_tokens` like existing usage fields: accept snake_case, camelCase, and nested `usage` aliases.
- Keep each chip conditional through `pickTelemetryValue` so null/absent telemetry cleanly omits chips.
- Render harness regressions can prove alias parity by mixing snake_case, camelCase, and nested usage values in populated fixtures.

## 2026-03-13 — Telemetry chips parity (dashboard/popout)
- Dashboard and popout task telemetry readers should accept usage values from snake_case task fields, camelCase task aliases, and nested `usage` object keys.
- New usage chip fields (`usage_reasoning_tokens`, `usage_accepted_prediction_tokens`, `usage_rejected_prediction_tokens`) stay null-safe by reusing `pickTelemetryValue`/normalization so missing/null values suppress chip rendering.
- Render harness regression tests in `coordinator/tests/dashboard-render.test.js` can cover both dashboard and popout surfaces by extracting renderer snippets and asserting populated vs null omission behavior.

## 2026-03-13 — Cache-creation usage telemetry chip aliases
- Dashboard and popout `readTaskTelemetry` should treat cache-creation tokens like other usage fields: accept top-level `usage_cache_creation_tokens`, top-level `usage_cache_creation_input_tokens`, nested `usage.cache_creation_tokens`, nested `usage.cache_creation_input_tokens`, and camelCase equivalents.
- Render a dedicated `cache-create` chip only when normalized telemetry value is non-empty; null/undefined values should omit the chip.
- Regression harness assertions in `coordinator/tests/dashboard-render.test.js` can validate both dashboard and popout populated/null paths with alias-shaped fixtures.

## 2026-03-12 — Cache-creation telemetry chip alias regressions
- Dashboard and popout telemetry readers already support cache-creation values from top-level usage fields and nested usage aliases (`cache_creation_tokens` and `cache_creation_input_tokens`) including camelCase compatibility.
- Render regressions should assert alias parity by mixing top-level and nested usage payload shapes and verifying the `cache-create` chip appears for populated values in both surfaces.
- Keep omission coverage explicit: null cache-creation values (top-level and nested) should not render a `cache-create` chip row.

## 2026-03-13 — Usage reasoning/prediction telemetry chips
- Dashboard and popout task telemetry readers should normalize `usage_reasoning_tokens`, `usage_accepted_prediction_tokens`, and `usage_rejected_prediction_tokens` from top-level snake_case, top-level camelCase, and nested `usage` aliases.
- Render `reasoning`, `pred-hit`, and `pred-miss` chips only when values normalize to non-empty strings via telemetry helpers.
- Regression harness coverage in `coordinator/tests/dashboard-render.test.js` should assert both populated mixed-alias fixtures and null omission behavior for dashboard and popout surfaces.

## 2026-03-12 — Wrapped routing_budget_state summary handling
- Dashboard budget helpers should detect wrapped `routing_budget_state` objects (`source`, `parsed`, `remaining`, `threshold`) and summarize from `parsed.flagship` so constrained/healthy status stays actionable.
- Preserve legacy behavior for direct budget-state payloads and keep unknown-shape fallback text (`keys: ...`) stable for genuinely unrecognized objects.
- Regression harness coverage in `coordinator/tests/dashboard-render.test.js` can assert wrapper-source fallback plus constrained and healthy summary rendering.

## 2026-03-13 — Popout routing-budget indicator parity
- Popout `renderTasks(data)` should prepend `renderBudgetIndicator(data)` so task panel output mirrors dashboard budget visibility even when task list is empty.
- Reuse dashboard budget helpers in popout (`parseBudgetState`, `unwrapBudgetState`, `describeBudgetState`) to support wrapped forms like `{source, parsed, remaining, threshold}` and preserve constrained/healthy summaries.
- Popout render regressions in `coordinator/tests/dashboard-render.test.js` should assert both wrapper-source fallback and top-level `routing_budget_source` override behavior.

## 2026-03-13 — TTL cache-creation telemetry chips (dashboard/popout)
- Keep aggregate `cache-create` rendering for backward compatibility while adding distinct TTL chips (`cache-create-5m`, `cache-create-1h`).
- Normalize TTL cache-creation values from top-level task keys (`usage_cache_creation_ephemeral_5m_input_tokens`, `usage_cache_creation_ephemeral_1h_input_tokens`), camelCase task aliases, and nested usage cache-creation objects (`usage.cache_creation` / `usage.cacheCreation`).
- Dashboard/popout render regressions should assert both populated TTL chip rendering and omission when TTL fields are null/absent so existing chip rows remain stable.
## 2026-03-13 — TTL cache-create telemetry validation-only checkpoint
- On synced `origin/main`, dashboard (`gui/public/app.js`) and popout (`gui/public/popout.js`) already render aggregate `cache-create` plus TTL chips (`cache-create-5m`, `cache-create-1h`) with alias-safe top-level/camelCase/nested usage reads.
- Existing `coordinator/tests/dashboard-render.test.js` coverage already asserts populated TTL chip rendering and null/absent omission behavior for both dashboard and popout harnesses.
- For validation-only dashboard-ui tasks, confirm scoped diff vs `origin/main` first and provide explicit regression evidence (`node --test tests/dashboard-render.test.js` and/or `npm test`) before completion.

## 2026-03-13 — Cache-hit denominator safety for Anthropic-style usage payloads
- Dashboard and popout `readTaskTelemetry` should compute cache-hit as `cached/input` for normal payloads, but switch to `cached/(input+cached)` when `cached_tokens > input_tokens` to align with providers that report uncached input separately.
- Clamp computed cache-hit ratios to `0..1` before percent formatting so chips cannot exceed `100.0%` or drop below `0.0%` when telemetry has unexpected values.
- Regression harness tests in `coordinator/tests/dashboard-render.test.js` should include one dashboard and one popout Anthropi-style case plus normal baseline assertions to prevent future parser drift.

## 2026-03-16 — Browser offload workflow UX
- Dashboard can integrate browser offload by listening for websocket `browser_offload_event` messages while also hydrating from `/api/status` `browser_offload_sessions` snapshots, preventing timeline gaps when one source is delayed.
- For user controls, map workflow buttons to `/api/browser/launch`, `/api/browser/attach`, and `/api/browser/status`; treat cancel as callback-based only when callback credentials are available, otherwise provide explicit local-monitor cancellation messaging.
- Popout parity can be added safely by introducing `panel=browser` without changing existing tasks/requests/workers/log renderers; keep existing render harness markers intact so dashboard telemetry regression tests continue to pass.
