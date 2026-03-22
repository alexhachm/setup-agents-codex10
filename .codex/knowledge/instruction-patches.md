# Instruction Patches

Runtime corrections discovered during work. Applied by agents on startup, then cleared.

## Pending Patches

### Patch: loop-agent (loop-31)
**Pattern observed:** COMMAND_SCHEMAS research-queue fix submitted 3 times (req-d2cddb2d, req-5b094253, req-c3c94f69) despite being completed on first submission (PR #268). Observed 3 times.
**Suggested change:** In loop-agent preflight, check `codex10 loop-requests --json` AND `codex10 status` output for completed requests matching the same file+description pattern before submitting. The quality gate should reject submissions that duplicate completed work, not just pending work.
**Rationale:** Each duplicate wastes architect triage time and pollutes the request queue. The loop-findings.md already notes this gap was fixed but the loop agent keeps resubmitting.
