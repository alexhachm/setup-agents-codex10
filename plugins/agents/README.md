# Agent Provider Plugins

Agent providers live under `plugins/agents/<provider>/plugin.json`.

The first active provider is `claude`. Codex, DeepSeek, Gemini, and other runtimes return through this same manifest path instead of adding provider-specific root scripts or namespaces. Codex, DeepSeek, and Gemini currently have disabled scaffold manifests so they are visible in the provider catalog without being selectable at runtime.

The current shell runtime consumes these manifest fields:

- `id`
- `display_name`
- `enabled`
- `cli.command`
- `cli.auth_check.command`
- `cli.auth_check.args`
- `models.fast`
- `models.deep`
- `models.economy`
- `models.worker`
- `models.loop`
- `environment.set`
- `environment.unset`
- `launch.interactive.args`
- `launch.noninteractive.args`
- `output.usage_payloads`
- `output.usage`
- `output.task_completion`

Template variables available in `environment.*` and `launch.*.args`:

- `$MODEL`
- `$PROMPT_TEXT`
- `$PROMPT_FILE`
- `$PROJECT_DIR`
- `$WORKTREE_DIR`
- `$PROVIDER_ID`
- `$CLI`

Provider command helpers:

- `scripts/provider.sh list [project_dir]`
- `scripts/provider.sh catalog [project_dir]`
- `scripts/provider.sh current [project_dir]`
- `scripts/provider.sh health [provider] [project_dir]`
- `scripts/provider.sh output-schema [provider] [project_dir]`
- `scripts/provider.sh select <provider> [project_dir]`
- `scripts/provider.sh launch-dry-run <interactive|noninteractive> <project_dir> <model> <prompt_file>`
- `mac10 sandbox-provider-smoke [provider] [--run] [--no-build]`

To add a provider:

1. Create `plugins/agents/<provider>/plugin.json`.
2. Set `enabled` to `false` until the provider has local launch and health smokes. Disabled providers appear in `catalog` but not `list`, and cannot be selected.
3. Define `cli.command`, `cli.auth_check`, role model defaults, provider environment, both launch modes, and `output.usage` aliases/columns for task usage telemetry.
4. Run `scripts/provider.sh health <provider>`, `scripts/provider.sh output-schema <provider>`, `scripts/provider.sh launch-dry-run noninteractive <project_dir> worker <prompt_file>`, and `mac10 sandbox-provider-smoke <provider>`.
5. Enable the provider only after worker, loop, Master 1, and repair launch paths validate through the shared interface.

Future provider work should add provider manifests here first, then extend the provider interface only when a provider needs a new capability that cannot be expressed by these fields.
