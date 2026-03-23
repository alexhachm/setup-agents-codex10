# Research Note & Living Doc Templates

## Research Note Template

File location: `research/topics/<topic>/YYYY-MM-DD__<source-slug>__R-<shortid>.md`

Source slug conventions:
- `repo-<name>` — external repository
- `doc-<name>` — documentation site or RFC
- `paper-<name>` — paper or blog post
- `internal-<name>` — internal investigation

```markdown
---
kind: research_note
scope: global|project
id: R-<shortid>
title: <descriptive title>
created: YYYY-MM-DD
updated: YYYY-MM-DD
topics:
  - <topic-1>
  - <topic-2>
sources:
  - <url-or-description>
relevance:
  related_domains:
    - domains/<domain-name>
  related_paths:
    - <source-file-paths>
confidence: low|medium|high
status: draft|useful|superseded|wrong
---

# Question
<What were you investigating?>

# Findings
- Finding 1: ...
- Finding 2: ...

# What Seems Transferable vs Project-Specific
Transferable:
- ...
Project-specific:
- ...

# Implications for Our Codebase
- ...

# Related Notes
- topics/<topic>/_rollup.md
```

## Topic Rollup Template

File location: `research/topics/<topic>/_rollup.md`

```markdown
---
kind: topic_rollup
scope: global|project
topic: <topic-name>
updated: YYYY-MM-DD
top_notes:
  - R-<id1>
  - R-<id2>
---

# <Topic Name>

## Current Recommended Approach
(5-15 lines. The "answer" agents want.)

## Decision Hooks
- If you see X -> do Y
- If you see A -> do B

## Known Pitfalls
- ...

## Evidence
- R-<id1> (<source>): <key finding>
- R-<id2> (<source>): <key finding>

## What We Tried That Did NOT Work
- ...
```

## Living Doc Template (handbook/ and domains/)

```markdown
---
doc_kind: reference
scope: project
owner: <handbook|domains/name>
last_verified: YYYY-MM-DD
rot_risk: low|medium|high
related_paths:
  - <source-file-paths>
---

# <Title>

## Executive Summary
(3-5 bullets)

## Invariants and Contracts
(Stable rules)

## Key Patterns
(How things work)

## Pitfalls
(Mistakes to avoid)

## Changelog (last 5)
- YYYY-MM-DD: <what changed>
```

## Quality Signal Format

File location: `signals/uses/YYYY-MM.md`

```
YYYY-MM-DD T-<task_id> used: <file1>, <file2>
YYYY-MM-DD T-<task_id> vote: <file> +1 "<reason it helped>"
YYYY-MM-DD T-<task_id> vote: <file> -1 "<reason it didn't help>"
```
