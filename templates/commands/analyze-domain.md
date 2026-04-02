---
description: Deep domain knowledge driver. Analyzes one domain from codebase-map.json and produces a review sheet for human approval.
---

# Analyze Domain — Deep Knowledge Driver

Perform deep analysis of a single domain. Produce a structured domain doc and human review sheet. This is NOT a structural scan (that's /scan-codebase) — this captures *how* files interact, *why* they're structured that way, and *what breaks if you change things*.

## Setup

```bash
export PATH="$(pwd)/.claude/scripts:$PATH"
DOMAIN="${1:-$ANALYZE_DOMAIN}"
```

If no domain provided, exit with error.

## Step 1: Create Analysis Record

```bash
ANALYSIS_OUTPUT=$(./.claude/scripts/codex10 analyze-domain "$DOMAIN")
ANALYSIS_ID=$(printf '%s' "$ANALYSIS_OUTPUT" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
```

## Step 2: Load Context

### Read codebase-map.json for domain files:
```bash
cat .claude/state/codebase-map.json
```

Extract the files array for `$DOMAIN`. If domain not found in map, fail the analysis.

### Read prior authoritative feedback (human ground truth):
```bash
./.claude/scripts/codex10 domain-analyses --domain "$DOMAIN" --status approved
```

If approved analyses exist with `human_feedback`, treat their feedback as **confirmed facts**. Your analysis must not contradict these. Include them as context: "Human-confirmed facts about this domain: ..."

### Read existing domain knowledge:
```bash
cat ".claude/knowledge/codebase/domains/$DOMAIN.md" 2>/dev/null
```

## Step 3: Phase 1 — File Inventory (zero deep reads)

For each file in the domain:
```bash
wc -l "$file"
head -5 "$file"   # shebang/imports only
grep -c 'module\.exports\|export ' "$file"
grep -c 'require(\|import ' "$file"
```

Build a table of: file, line count, exports count, imports count, likely role (from naming).

## Step 4: Phase 2 — Interaction Mapping (MAX 15 signature reads)

Read ONLY function signatures, class declarations, and export blocks. **Never read full function implementations.** Focus on:

1. **Public API surface** — what does this domain expose to consumers?
2. **Dependencies** — what does it import from other domains?
3. **Data flow** — what data structures flow in and out?
4. **State mutations** — what state does it modify? (DB writes, file writes, globals)
5. **Error boundaries** — where does it catch vs propagate errors?

**HARD LIMIT: 15 file reads total.** For large files, read only the first 50 lines (signatures) and last 30 lines (exports).

## Step 5: Phase 3 — Coupling Analysis

Cross-reference with `coupling_hotspots` from codebase-map.json:
- Which files in this domain frequently change together?
- Which files in OTHER domains change when this domain changes?
- What are the implicit contracts between coupled files?

## Step 6: Phase 4 — Risk Assessment

Identify:
- **Brittle points**: functions called from many places (high fan-in)
- **Cascade risks**: changes that would ripple to other domains
- **Race conditions**: concurrent access patterns (SQLite transactions, file locks, async)
- **Non-obvious coupling**: shared constants, naming conventions, implicit protocol agreements
- **"If you change X, Y breaks because Z"** — this is the most valuable output

## Step 7: Write Draft Domain Doc

Compose the domain doc with this structure:

```markdown
# <Domain> Domain Knowledge

## Purpose
[1-2 sentences: what this domain does and why it exists]

## Architecture
[Key architectural decisions and their rationale]

## Key Files & Interactions
| File | Role | Interacts With |
|------|------|---------------|
| file.js | Description | other-file.js (how) |

## Public API Surface
[Exported functions/classes with brief signatures]

## Data Flow
[How data enters, transforms, and exits this domain]

## Coupling & Dependencies
- **Depends on**: [other domains/modules consumed]
- **Depended on by**: [who consumes this domain]
- **Implicit contracts**: [non-obvious agreements]

## Risk Map
- **If you change X**: Y breaks because Z
- **Race conditions**: [concurrent access patterns]
- **Brittle points**: [high fan-in functions]

## Human-Confirmed Context
[Preserved from prior approved analyses — DO NOT overwrite]

## Testing
[How to test changes in this domain]

Last analyzed: YYYY-MM-DD
Confidence: [low|medium|high]
```

## Step 8: Write Review Sheet

Compose a review sheet for the human:

```markdown
## Domain Analysis Review: <domain>

### What the computer thinks this domain does:
[Plain-language summary — no jargon]

### Key claims to verify:
1. [ ] [specific claim about architecture or interactions]
2. [ ] [specific claim about data flow]
3. [ ] [specific claim about risks/coupling]

### Questions for human:
- Was [X] designed to prioritize A over B? Why?
- Is the coupling between [Y] and [Z] intentional or accidental?
- Are there historical reasons for [pattern]?
- What breaks that I might not see from code alone?

### Confidence: [low|medium|high]
### Files analyzed: [count]/[total in domain]
```

## Step 9: Submit for Review

```bash
./.claude/scripts/codex10 submit-domain-draft "$ANALYSIS_ID" "$REVIEW_SHEET" "$DRAFT_DOC" "$ANALYZED_FILES_JSON"
```

This transitions the analysis to `review_pending` and notifies Master-1 via inbox.

Say: "Domain analysis for '$DOMAIN' submitted for human review."
