---
kind: research_note
scope: project
id: R-dd038c
title: "sqlite-wal — ChatGPT regular research"
created: 2026-03-17
updated: 2026-03-17
topics:
  - sqlite-wal
sources:
  - chatgpt-regular
confidence: medium
status: draft
---

# Question
Best practices for WAL mode?

# Findings
SQLite WAL mode allows concurrent reads during writes. Key findings:

1. **PRAGMA journal_mode=WAL** must be set at connection time, not per-transaction
2. **busy_timeout** of 5000ms is standard; increase for high-contention workloads
3. **WAL checkpointing** — automatic by default at 1000 pages; explicit PRAGMA wal_checkpoint(TRUNCATE) reclaims disk
4. **Shared cache mode** should be avoided with WAL — causes lock escalation
5. **Network filesystems** (NFS, SMB) do NOT support WAL mode safely

Transferable patterns:
- WAL is the correct default for any multi-reader SQLite deployment
- busy_timeout prevents SQLITE_BUSY errors without retry logic

Project-specific:
- Your coordinator uses WAL with better-sqlite3 which handles checkpointing automatically
- The 5000ms busy_timeout matches the recommended range

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/sqlite-wal/_rollup.md
