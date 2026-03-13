# orchestration-scripts

- 2026-03-12: Keep  and  semantically mirrored to the codex equivalents (path-prefix differences only), and prefer executable snippets that capture  from  output.

## 2026-03-12 — Master-2 mirror sync notes
- In this repo, tracked runtime mirrors are under `.claude/`; `.codex/` is local/untracked runtime state in this worktree.
- Keep `.claude/commands/architect-loop.md` exactly mirrored with `templates/commands/architect-loop.md`.
- Keep `.claude/docs/master-2-role.md` exactly mirrored with `templates/docs/master-2-role.md` and preserve decomposition counter semantics (`Tier2 += 0.5`, `Tier3 += 1`) plus adaptive signal wait guidance.

- 2026-03-12: Keep loop-sentinel ACTIVE_COUNT precheck parser logic mirrored between tracked scripts and runtime .codex script copies; if setup detects drift, preserve the .codex parser copy to avoid silent regression.
