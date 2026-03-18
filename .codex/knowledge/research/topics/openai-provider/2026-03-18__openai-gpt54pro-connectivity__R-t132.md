---
task: T-132
date: 2026-03-18
source: openai-api-direct
topic: openai-provider
---

# OpenAI gpt-5.4-pro Connectivity Investigation

## Summary

Investigated OpenAI provider integration in mac10 and attempted to send a test message to `gpt-5.4-pro`.

## Findings

### 1. Provider Integration Status

- **`scripts/provider-utils.sh`** exists — handles codex/claude providers only
- **`.codex/scripts/provider-utils.sh`** does NOT exist
- No direct OpenAI API key client wrapper — system uses `codex` CLI with ChatGPT OAuth login
- `OPENAI_API_KEY` is NOT set in environment

### 2. codex CLI Login Status

```
codex login status → "Logged in using ChatGPT"
```

The codex CLI (v0.111.0) uses ChatGPT session authentication, not a raw API key.

### 3. gpt-5.4-pro API Call Result

```
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error",
"message":"The 'gpt-5.4-pro' model is not supported when using Codex with a ChatGPT account."}}
```

**Result: 400 error — gpt-5.4-pro is not supported with ChatGPT auth**

### 4. Fallback to gpt-5.3-codex (System Default)

```
ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits
or try again at Mar 23rd, 2026 2:52 AM.
```

**Result: Account usage limit exhausted — resets March 23, 2026**

### 5. Direct REST API

OpenAI API endpoint `https://api.openai.com/v1/chat/completions` is reachable (returns 401 for invalid/missing key). No `OPENAI_API_KEY` is set so direct calls fail with 401.

### 6. Extended Thinking

Not tested — no successful model calls completed. OpenAI extended thinking would require a successful API call with a reasoning-capable model (e.g., `o3`, `o4-mini`).

## Conclusion

- **gpt-5.4-pro**: Not supported with ChatGPT login credentials
- **gpt-5.3-codex**: Supported by CLI auth but account usage limit exceeded
- **Direct API**: No `OPENAI_API_KEY` available
- **Extended thinking status**: Unknown — could not complete a call
- **Model ID actually used**: None (all attempts failed)

## What Would Be Needed

1. Either replenish Codex credits on the ChatGPT account (resets Mar 23, 2026)
2. Or set `OPENAI_API_KEY` in environment for direct REST API calls
3. gpt-5.4-pro specifically requires API key auth (not ChatGPT session)
