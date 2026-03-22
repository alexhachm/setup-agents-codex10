
## 2026-03-13 — Audio usage alias parity
- For OpenAI usage payload parity, map `input_tokens_details.audio_tokens` and `prompt_tokens_details.audio_tokens` to canonical `input_audio_tokens`.
- Map `completion_tokens_details.audio_tokens` and `output_tokens_details.audio_tokens` to canonical `output_audio_tokens`.
- Keep canonical acceptance in both CLI parser and server normalizer aligned with DB column map + migrations (`usage_input_audio_tokens`, `usage_output_audio_tokens`) to avoid silent drops.

## 2026-03-13 — Raw usage payload persistence parity
- Persist normalized usage payloads on task rows via `usage_payload_json` at the same point mapped `usage_*` columns are written (`complete-task`/`fail-task`) so unknown provider keys survive while aggregate metrics remain queryable.
- Keep migration safety by adding the column in both schema and init-time `ALTER TABLE` guards, and include it in `updateTask` allowlists.
- For non-breaking API/UI support, keep raw `usage_payload_json` in task responses and optionally hydrate parsed objects (`usage`, `usage_payload`) for dashboard consumers.

## 2026-03-13 — Usage payload raw JSON persistence parity
- Keep `tasks.usage_payload_json` persisted from normalized complete/fail usage payloads so unknown provider keys survive, while still mapping canonical numeric fields into `usage_*` columns for aggregation queries.
- Expose parsed payload fallbacks in web/API/UI (`usage`, `usage_payload`, `usagePayload`) without breaking existing consumers that still read mapped columns.
