---
kind: rollup
topic: hello-test
updated: 2026-03-18
notes:
  - 2026-03-18__chatgpt-standard__R-t133.md
---

# hello-test — Browser Driver Verification

## Summary
The chatgpt-driver.py browser route works end-to-end. A "hello" research item queued via
`codex10 queue-research` is picked up, dispatched to a new ChatGPT browser tab, and the
message is sent with response streaming confirmed.

## Key Facts
- **Default model**: standard (ChatGPT default, labeled "ChatGPT" in model switcher)
- **Login**: Persistent Chrome profile at `~/.chatgpt-codex-profile` maintains session
- **Tab behavior**: New tab opened per research item; tab pool manages lifecycle
- **Routing**: Standard mode = no model switch; routing labeled "Focused knowledge query"
- **Response**: Streaming begins within ~35s of dispatch; full collection needs ~60-120s

## Status
Verified 2026-03-18 by T-133.
