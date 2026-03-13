## Summary
- synced `templates/commands/architect-loop.md` to the codex10 canonical loop semantics (path-prefix mirror only)
- restored mandatory counter semantics (`last_activity_epoch`, `curation_due` toggle on even decomposition counts)
- restored executable adaptive signal-timeout logic and instruction patch target wording in template role doc

## Validation
- `rg -n "master-2|Tier 1|Tier 2|Tier 3|backlog" .codex/commands-codex10/architect-loop.md .codex/commands/architect-loop.md templates/commands/architect-loop.md .codex/docs/master-2-role.md templates/docs/master-2-role.md`
- `git diff --name-only`
