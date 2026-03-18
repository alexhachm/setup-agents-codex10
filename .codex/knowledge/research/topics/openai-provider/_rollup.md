# OpenAI Provider — Research Rollup

Last updated: 2026-03-18

## Status

**No direct OpenAI API key integration exists in mac10.** The system supports `codex` and `claude` providers. The `codex` provider uses the `codex` CLI with ChatGPT OAuth login (not an `OPENAI_API_KEY`).

## Key Findings

### Provider Utils (`scripts/provider-utils.sh`)
- Validates only `codex|claude` providers; rejects others with hard error
- Default models for codex: `gpt-5.3-codex` (fast/deep), `gpt-5.1-codex-mini` (economy)
- No `OPENAI_API_KEY` references — relies on `codex` CLI ChatGPT login

### Codex CLI Auth
- `codex login status` → "Logged in using ChatGPT"
- Uses ChatGPT session credentials, not a raw API key

### gpt-5.4-pro
- **Not supported with ChatGPT auth** — returns 400 "model not supported when using Codex with a ChatGPT account"
- Would require direct API key (`OPENAI_API_KEY`) to access

### gpt-5.3-codex (System Default)
- Supported by ChatGPT auth
- **Account usage limit exhausted** — resets March 23, 2026

### Extended Thinking
- Could not be tested — no successful API calls completed
- OpenAI extended thinking (o-series reasoning) would require direct API key access

### Environment
- No `OPENAI_API_KEY` in environment
- Direct REST API to `api.openai.com` is reachable (returns 401 for missing key)

## What Would Be Needed for gpt-5.4-pro

1. Set `OPENAI_API_KEY` in environment or `agent-launcher.env`
2. Add curl-based REST client path for direct API models not available via ChatGPT auth
3. Extend `scripts/provider-utils.sh` with direct OpenAI REST support

## Research Notes

- [2026-03-18 — OpenAI gpt-5.4-pro Connectivity Investigation](./2026-03-18__openai-gpt54pro-connectivity__R-t132.md)
