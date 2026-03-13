# Decomposition Patterns

Learnings from past task decompositions. Updated by the Architect after completing triage cycles.

## Good Patterns
- For sustained queue intake with clear single-domain fixes, pre-triage quickly to Tier 2 and immediately assign explicit file-scoped tasks with concrete validation commands.
- When all workers are occupied, block on architect inbox for the next completion event, then claim the first idle worker atomically before task creation/assignment.

## Anti-Patterns
- (none yet)
