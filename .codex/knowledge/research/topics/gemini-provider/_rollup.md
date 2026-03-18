# Gemini Provider — Research Rollup

Last updated: 2026-03-18

## Status

**No Gemini/Google provider integration exists in mac10.** The system supports only `codex` and `claude` providers.

## Key Findings

### Provider Utils (scripts/provider-utils.sh)
- Validates only `codex|claude` providers; rejects others with hard error
- No Gemini model defaults, no GOOGLE_API_KEY references
- `.codex/scripts/provider-utils.sh` does not exist (only `scripts/provider-utils.sh`)

### Gemini 2.5 Pro API
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent`
- Authentication: requires `?key=GOOGLE_API_KEY` query param (or OAuth)
- Extended thinking: supported via `generationConfig.thinkingConfig.thinkingBudget`
- Extended thinking response: thinking parts have `parts[].thought = true`

### Environment
- No `GOOGLE_API_KEY` or `GEMINI_API_KEY` found in environment
- Unauthenticated API call returns 403 PERMISSION_DENIED

## What Would Be Needed to Add Gemini Support

1. Add `gemini` case to `mac10_load_provider_config` validation in `scripts/provider-utils.sh`
2. Add default model functions for Gemini (fast/deep/economy tiers)
3. Add new CLI invocation path — Gemini uses REST API, not a CLI binary like `claude` or `codex`
4. Provide `GOOGLE_API_KEY` in the environment or `agent-launcher.env`

## Research Notes

- [2026-03-18 — Gemini 2.5 Pro Connectivity Investigation](./2026-03-18__gemini-2.5-pro-connectivity__R-t131.md)
