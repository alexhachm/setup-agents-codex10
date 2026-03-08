# Codex Equivalents Index for Claude Calls

Generated from:
- `/mnt/c/Users/Owner/Desktop/setup-agents-codex10/claude-reference-index.md`

Validation basis:
- Local CLI help from `codex-cli 0.111.0` (`codex --help`, `codex exec --help`)
- Existing Codex migration patterns in `setup-agents-windows-codex9`

## 1) Direct Call Equivalents

| Claude call pattern | Codex equivalent | Status | Notes |
|---|---|---|---|
| `claude` | `codex` | Exact | Replace binary name in prereq checks and launch scripts. |
| `_wsl_shim claude` | `_wsl_shim codex` | Exact | Same shim behavior, different binary. |
| `check_cmd claude` | `check_cmd codex` | Exact | Same command-availability check. |
| `claude --model opus /architect-loop` | `codex exec -m gpt-5.3-codex -C "$PROJECT_DIR" - < .codex/commands/architect-loop.md` | Partial | Codex has no documented slash-command argument mode; feed prompt doc via stdin. |
| `claude --dangerously-skip-permissions --model sonnet /master-loop` | `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$PROJECT_DIR" - < .codex/commands/master-loop.md` | Partial | Safety bypass flag differs in name; slash command replaced by prompt file/stdin. |
| `claude --dangerously-skip-permissions --model opus /architect-loop` | `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$PROJECT_DIR" - < .codex/commands/architect-loop.md` | Partial | Same caveat as above. |
| `claude --dangerously-skip-permissions --model sonnet /allocate-loop` | `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$PROJECT_DIR" - < .codex/commands/allocate-loop.md` | Partial | Same caveat as above. |
| `claude --model opus --dangerously-skip-permissions -p "/worker-loop" 2>&1 \|\| true` | `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$WORKTREE" - < .codex/commands/worker-loop.md 2>&1 \|\| true` | Good | Claude `-p` (print-and-exit) maps well to `codex exec` (non-interactive, exits). |
| `claude --model opus --dangerously-skip-permissions -p "/loop-agent" 2>&1 \|\| true` | `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$PROJECT_DIR" - < .codex/commands/loop-agent.md 2>&1 \|\| true` | Good | Same non-interactive replacement pattern. |
| `mac10 loop "<prompt>"` | `./.claude/scripts/codex10 loop "<prompt>"` | Exact | Same DB path: `createLoop()` inserts in `loops`, then `onLoopCreated` spawns `scripts/loop-sentinel.sh` in tmux. |
| `claude --dangerously-skip-permissions --model "$MODEL" "$CMD"` | `codex exec --dangerously-bypass-approvals-and-sandbox -m "$MODEL" -C "$DIR" - < "$(cmd_to_prompt_file "$CMD")"` | Partial | Requires a wrapper function to map slash-style `$CMD` to prompt files. |
| `.claude/settings.json: "Bash(claude *)"` | `.codex` runtime policy via CLI flags (`-a`, `-s`) or `~/.codex/config.toml` profiles | Partial | No 1:1 repo-local `settings.json` permission schema confirmed in current Codex CLI docs/help. |

## 2) Model Mapping (Role Intent)

| Claude model | Typical role in project | Recommended Codex mapping | Status |
|---|---|---|---|
| `sonnet` | Fast interface/allocator | `gpt-5.3-codex` (optionally lower reasoning effort) | Approximate |
| `opus` | Deep architect/worker | `gpt-5.3-codex` (high/xhigh reasoning effort) | Approximate |
| `haiku` | Cheap validator | `gpt-5.1-codex-mini` | Approximate |

Note: these are intent-based mappings, not vendor/model parity.

## 3) Env Variable Equivalents

| Claude-specific env use | Codex equivalent | Status | Notes |
|---|---|---|---|
| `unset CLAUDECODE` before launching child agent | Usually not needed | No-op / Partial | No documented Codex equivalent nested-session blocker variable in current CLI help. |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | None (no 1:1 env switch found) | Gap | Use external orchestrator (tmux + multiple `codex exec` processes) for team behavior. |
| `CLAUDE_PROJECT_DIR` in hook commands | `CODEX_PROJECT_DIR` (if you export it in your wrappers) | Partial | Pattern used in prior codex9 scaffolding; not auto-provided by CLI docs. |

## 4) Suggested Wrapper for Slash-Style Commands

```bash
cmd_to_prompt_file() {
  case "$1" in
    /master-loop) echo ".codex/commands/master-loop.md" ;;
    /architect-loop) echo ".codex/commands/architect-loop.md" ;;
    /allocate-loop) echo ".codex/commands/allocate-loop.md" ;;
    /worker-loop) echo ".codex/commands/worker-loop.md" ;;
    /loop-agent) echo ".codex/commands/loop-agent.md" ;;
    *) echo "" ;;
  esac
}

run_codex_loop() {
  local model="$1"
  local cmd="$2"
  local prompt_file
  prompt_file="$(cmd_to_prompt_file "$cmd")"
  [ -n "$prompt_file" ] || { echo "Unknown loop command: $cmd" >&2; return 1; }
  codex exec --dangerously-bypass-approvals-and-sandbox -m "$model" -C "$PWD" - < "$prompt_file"
}
```

## 5) Needs Brainstorming (Non-1:1 Areas)

1. Native slash command invocation parity (`/architect-loop` style direct arg handling) is not documented for current Codex CLI; stdin prompt injection is a workaround.
2. Native teammate delegation toggle parity (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) has no direct Codex env equivalent.
3. Repo-local `settings.json` permission/hook schema parity with Claude settings is unclear for current Codex CLI; may need wrapper-enforced guards instead.
