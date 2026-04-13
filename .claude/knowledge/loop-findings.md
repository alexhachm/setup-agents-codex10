# Loop Findings

## Successful Patterns
- (none yet — first iteration)
- For explicit no-op audit directives (for example, "do nothing, verify lifecycle"), skip research submissions and checkpoint `DONE` after prompt/checkpoint/heartbeat validation.
- If `loop-requests` returns no entries under a no-op audit prompt, keep `SUBMITTED: none` and only advance lifecycle markers (heartbeat and checkpoint).
- Loop 8 no-op audit: validating `loop-prompt`, `loop-requests`, and loop CLI lifecycle handlers before heartbeat/checkpoint is sufficient; submitting new requests would violate prompt scope.
- Repeated no-op audit iterations should avoid opening unrelated source files; verify lifecycle via `loop-prompt`, `loop-requests`, `loop-heartbeat`, and `loop-checkpoint` only.
- Loop 8 iteration 714: when checkpoint REMAINING is `none (no-op audit directive)` and request history is empty, preserve no-op behavior and advance only heartbeat + checkpoint.

## Failed Patterns
- Quality gate rejects requests missing file path signals (need `path/file.ext` format) and production impact keywords (production, risk, failure, regression, etc.)
- First 3 attempts rejected for missing WHERE (file path) and WHY (impact) signals

## Codebase Gaps
- watchdog.js: inconsistent timestamp parsing — parseTimestampMs() exists but tick() uses raw `new Date()` in 3 places (lines 176, 183, 205)
- merger.js: SQL string interpolation in onTaskCompleted() lines 229-237 — constants embedded in SQL instead of parameterized
- watchdog.js: parseInt without radix in getThresholds() lines 38-41

## False Positives
- (none identified yet)
