# Topic
Skill/plugin system patterns (Cursor rules, Claude memory files, Windsurf rules)

## Sources (URLs)
- https://windsurf.com/university/general-education/creating-modifying-rules
- https://nango.dev/docs/updates/dev
- https://dev.to/deadbyapril/the-best-cursor-rules-for-every-framework-in-2026-20-examples-29ag
- https://localskills.sh/blog/cursor-rules-guide
- https://www.builder.io/blog/claude-md-guide

## Relevance to 10.2
10.2 needs a predictable, user-editable “skill/config” layer comparable to how modern AI coding tools persist behavior (rules/memory files) and selectively activate guidance.

## Findings
- Windsurf’s Cascade “Rules” are first-class, stored as plain markdown files with explicit activation modes: Manual (@rule-name), Always On, Model Decision, and Glob/regex triggers, plus hard character limits (6,000 per rule file; 12,000 total with global prioritized) ([Windsurf docs](https://windsurf.com/university/general-education/creating-modifying-rules)).
- Cursor community guidance in 2026 treats `.cursorrules` (single root file) as legacy and suggests modular rules in a `.cursor/rules/*.mdc` folder, plus optional global rules for personal preferences ([localskills.sh](https://localskills.sh/blog/cursor-rules-guide)).
- Cursor rules are framed as an always-loaded “persistent system prompt” that applies across different interaction modes (chat/inline/composer), implying a key parity expectation: one place to set behavior and have it reliably apply everywhere ([DEV Community](https://dev.to/deadbyapril/the-best-cursor-rules-for-every-framework-in-2026-20-examples-29ag)).
- Claude Code’s equivalent pattern is a single project memory file `CLAUDE.md` that is automatically loaded at session start; `/init` generates a starter file, and users may keep personal overrides in `CLAUDE.local.md` (often gitignored) ([Builder.io](https://www.builder.io/blog/claude-md-guide)).

## Recommended Action
- Implement 10.2 “skills/config” as:
  1) markdown-based rule files, and 2) a small manifest describing activation mode (always/manual/model-decision/glob), mirroring Windsurf’s modes for user mental-model parity ([Windsurf docs](https://windsurf.com/university/general-education/creating-modifying-rules)).
- Add hard, documented size limits and deterministic precedence rules (global > workspace/project > task-local) to avoid runaway context and to match Windsurf’s explicit constraint-driven UX ([Windsurf docs](https://windsurf.com/university/general-education/creating-modifying-rules)).
- Provide a one-command “initialize rules” flow (similar to Claude Code `/init`) to scaffold a starter file from repo/project structure ([Builder.io](https://www.builder.io/blog/claude-md-guide)).

## Priority
High
