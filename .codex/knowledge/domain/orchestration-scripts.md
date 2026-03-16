# orchestration-scripts

- 2026-03-12: Keep  and  semantically mirrored to the codex equivalents (path-prefix differences only), and prefer executable snippets that capture  from  output.

## 2026-03-12 — Master-2 mirror sync notes
- In this repo, tracked runtime mirrors are under `.claude/`; `.codex/` is local/untracked runtime state in this worktree.
- Keep `.claude/commands/architect-loop.md` exactly mirrored with `templates/commands/architect-loop.md`.
- Keep `.claude/docs/master-2-role.md` exactly mirrored with `templates/docs/master-2-role.md` and preserve decomposition counter semantics (`Tier2 += 0.5`, `Tier3 += 1`) plus adaptive signal wait guidance.

- 2026-03-12: Keep loop-sentinel ACTIVE_COUNT precheck parser logic mirrored between tracked scripts and runtime .codex script copies; if setup detects drift, preserve the .codex parser copy to avoid silent regression.

## 2026-03-13 — loop-requests JSON parity in sentinel prechecks
- `coordinator/bin/mac10` should canonicalize loop-request arrays from both `requests` and nested fallback shapes (`data.requests`, `data.rows`, `rows`, array payloads) so default and `--json` modes render the same request set.
- Sentinel ACTIVE_COUNT parsers should prefer the first non-empty array candidate when consuming `loop-requests --json`; this avoids false zero counts when a normalized empty `requests` field coexists with populated nested rows.

- 2026-03-16: For allocator mirror sync requests, confirm parity against `.codex/commands/allocate-loop.md` first; current canonical guidance intentionally references deprecated signal files only as negative instructions ("Do not wait"), while mailbox wake flow remains `inbox allocator --block` + assignment-first completion handling.

- 2026-03-16: Architect instruction mirrors should avoid hardcoded validation defaults; use script-aware task payload generation (`validation_field`) with test-first selection and omit `validation` when target scripts are absent.

## 2026-03-16 — loop-sentinel ACTIVE_COUNT JSON precheck hardening
- Use `loop-requests <loop_id> --json` plus JSON parsing for ACTIVE_COUNT in both tracked and runtime sentinel scripts; do not grep human-readable output.
- Keep active status coverage aligned with existing intent while including `assigned`.
- For normalized payloads where `requests` can be empty but nested rows are populated, select the first non-empty array candidate (`requests`, `data.requests`, `data.rows`, `rows`, etc.) before counting.
- If command execution or JSON parse fails, treat ACTIVE_COUNT as unknown and back off explicitly; never default parser failures to zero active requests.
