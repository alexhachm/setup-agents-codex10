---
name: knowledge-management
description: Manage mac10 knowledge and project memory. Use when inspecting learned state, checking domain coverage, managing snapshots/artifacts, or understanding insight lineage.
---

# Knowledge Management

Manage the mac10 knowledge system and project memory.

## Knowledge Layers

### 1. File-Based (`.claude/knowledge/`)
`mistakes.md`, `patterns.md`, `worker-lessons.md`, `change-summaries.md`, `instruction-patches.md`, `codebase-insights.md`

### 2. Research (`.codex/knowledge/research/topics/`)
Organized by topic with `_rollup.md` summaries.

### 3. Codebase (`.claude/knowledge/codebase/domains/`)
Per-domain deep-dive research from `scan-codebase` commands.

### 4. Project Memory (SQLite)
Snapshots, insight artifacts, lineage links, snapshot index.

## Commands

```bash
mac10 project-memory list-snapshots         # List snapshots
mac10 project-memory get-snapshot <key>      # View snapshot
mac10 project-memory list-artifacts          # List insight artifacts
mac10 project-memory lineage <artifact_id>   # View provenance
```

## Staleness Detection

`knowledge-metadata.js` flags:
- Uncovered domains (no research for assigned task domain)
- Stale domains (>10 changes since last scan)
- Over-patched domains (>3 worker corrections)

## Instruction-Refinement Pipeline

- Domain patches: min 1 observation
- Role patches: min 3 observations
- Human approval required before application

## Research Source
Ref: coordinator-extensions rollup (knowledge ingestion), overlay.js (domain injection), knowledge-metadata.js (coverage)
