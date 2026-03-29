# Loop Findings

## Successful Patterns
- (none yet — first iteration)

## Failed Patterns
- Quality gate rejects requests missing file path signals (need `path/file.ext` format) and production impact keywords (production, risk, failure, regression, etc.)
- First 3 attempts rejected for missing WHERE (file path) and WHY (impact) signals

## Codebase Gaps
- watchdog.js: inconsistent timestamp parsing — parseTimestampMs() exists but tick() uses raw `new Date()` in 3 places (lines 176, 183, 205)
- merger.js: SQL string interpolation in onTaskCompleted() lines 229-237 — constants embedded in SQL instead of parameterized
- watchdog.js: parseInt without radix in getThresholds() lines 38-41

## False Positives
- (none identified yet)
