# Claude Equivalents to Codex Agent Usage Index

> Complete mapping of every codex-specific usage in this project to its Claude Code equivalent.
> Purpose: Reference for full Claude replacement of the codex CLI layer.

---

## Table of Contents

1. [Binary & Invocation](#1-binary--invocation)
2. [CLI Flags](#2-cli-flags)
3. [Model IDs & Aliases](#3-model-ids--aliases)
4. [Agent Launch Patterns](#4-agent-launch-patterns)
5. [Directory & Path Conventions](#5-directory--path-conventions)
6. [Instruction Files](#6-instruction-files)
7. [Settings & Permissions](#7-settings--permissions)
8. [Hooks](#8-hooks)
9. [Subagent / Agent Definitions](#9-subagent--agent-definitions)
10. [Sentinel & Loop Scripts](#10-sentinel--loop-scripts)
11. [Coordinator Runtime References](#11-coordinator-runtime-references)
12. [Overlay System](#12-overlay-system)
13. [Setup Script Replacements](#13-setup-script-replacements)
14. [Signal & State Files](#14-signal--state-files)
15. [Environment Variables](#15-environment-variables)
16. [Knowledge Base](#16-knowledge-base)
17. [Per-Agent Command Mapping](#17-per-agent-command-mapping)
18. [Migration Decision Log](#18-migration-decision-log)

---

## 1. Binary & Invocation

| Codex Usage | Claude Equivalent | Files Affected |
|-------------|-------------------|----------------|
| `codex` (binary) | `claude` | `setup.sh:81`, `scripts/launch-agent.sh:95,99`, `.codex/scripts/worker-sentinel.sh:71`, `.codex/scripts/loop-sentinel.sh:130` |
| `codex exec` (non-interactive) | `claude -p` (print mode) | `scripts/launch-agent.sh:99-101`, `scripts/worker-sentinel.sh:71`, `scripts/loop-sentinel.sh:130` |
| `codex --dangerously-bypass-approvals-and-sandbox` | `claude --dangerously-skip-permissions` | All launch scripts |
| `check_cmd codex` (preflight) | `check_cmd claude` | `setup.sh:81` |
| `_wsl_shim codex` (WSL bridge) | `_wsl_shim claude` | `setup.sh:49` |

### Invocation Pattern Comparison

**Codex interactive (Master-1):**
```bash
codex --dangerously-bypass-approvals-and-sandbox \
  -m "$MODEL_RESOLVED" \
  -C "$DIR" \
  -- "$PROMPT_TEXT"
```

**Claude interactive equivalent:**
```bash
claude --dangerously-skip-permissions \
  -m "$MODEL_RESOLVED" \
  -C "$DIR" \
  "$PROMPT_TEXT"
```

**Codex non-interactive (Master-2, Master-3, Workers, Loops):**
```bash
codex exec --dangerously-bypass-approvals-and-sandbox \
  -m "$MODEL_RESOLVED" \
  -C "$DIR" \
  - < "$PROMPT_FILE"
```

**Claude non-interactive equivalent:**
```bash
claude -p "$(cat "$PROMPT_FILE")" \
  --dangerously-skip-permissions \
  -m "$MODEL_RESOLVED" \
  -C "$DIR"
```

> **Note:** Claude `-p` reads prompt as an argument, not from stdin redirection. Use `"$(cat file)"` or `--append-system-prompt-file` for file-based prompts. Alternatively, pipe: `cat "$PROMPT_FILE" | claude -p --dangerously-skip-permissions -m "$MODEL_RESOLVED"`.

---

## 2. CLI Flags

| Codex Flag | Claude Flag | Notes |
|------------|-------------|-------|
| `--dangerously-bypass-approvals-and-sandbox` | `--dangerously-skip-permissions` | Same intent, different naming |
| `exec` (subcommand for non-interactive) | `-p` / `--print` (flag for non-interactive) | Codex uses a subcommand; Claude uses a flag |
| `-m <model>` | `-m <model>` / `--model <model>` | Identical flag, different model IDs |
| `-C <dir>` | `-C <dir>` | Same flag, same behavior (set working directory) |
| `- < file` (stdin prompt) | `"$(cat file)"` as arg, or pipe `cat file \| claude -p` | Claude `-p` takes prompt as positional arg |
| `-- "$PROMPT_TEXT"` (end-of-flags prompt) | `"$PROMPT_TEXT"` (positional arg) | Claude takes prompt as first positional arg |
| *(no equivalent)* | `--max-turns N` | Claude-only: limit agentic turns |
| *(no equivalent)* | `--max-budget-usd N` | Claude-only: cost cap |
| *(no equivalent)* | `--output-format json\|stream-json\|text` | Claude-only: structured output |
| *(no equivalent)* | `--allowedTools "Tool(pattern)"` | Claude-only: per-session tool allow |
| *(no equivalent)* | `--disallowedTools "Tool(pattern)"` | Claude-only: per-session tool deny |
| *(no equivalent)* | `--append-system-prompt "text"` | Claude-only: append to system prompt |
| *(no equivalent)* | `--append-system-prompt-file file` | Claude-only: append file to system prompt |
| *(no equivalent)* | `--verbose` | Claude-only: verbose logging |
| *(no equivalent)* | `--effort low\|medium\|high\|max` | Claude-only: effort level |
| *(no equivalent)* | `-c` / `--continue` | Claude-only: resume last session |
| *(no equivalent)* | `-r` / `--resume <id>` | Claude-only: resume named session |
| *(no equivalent)* | `-w` / `--worktree <name>` | Claude-only: git worktree isolation |
| *(no equivalent)* | `--permission-mode plan\|default\|dontAsk\|bypassPermissions` | Claude-only: permission mode |
| *(no equivalent)* | `--no-session-persistence` | Claude-only: ephemeral sessions |

---

## 3. Model IDs & Aliases

### Direct Model Mapping

| Codex Model ID | Claude Model ID | Used For |
|----------------|-----------------|----------|
| `gpt-5.3-codex` | `claude-sonnet-4-6` (alias: `sonnet`) | Flagship — all masters, workers |
| `gpt-5.3-codex` | `claude-opus-4-6` (alias: `opus`) | Deep reasoning alternative |
| `gpt-5.1-codex-mini` | `claude-haiku-4-5` (alias: `haiku`) | Economy / fast lightweight |
| `gpt-5.3-codex-spark` | `claude-haiku-4-5` (alias: `haiku`) | Spark/fast classification |

### Alias Resolution Table

**File:** `scripts/launch-agent.sh` lines 46-58

| Alias (current) | Codex Resolved | Claude Resolved | Claude Alias |
|-----------------|----------------|-----------------|--------------|
| `sonnet` | `gpt-5.3-codex` | `claude-sonnet-4-6` | `sonnet` |
| `opus` | `gpt-5.3-codex` | `claude-opus-4-6` | `opus` |
| `fast` | `gpt-5.3-codex` | `claude-sonnet-4-6` | `sonnet` |
| `deep` | `gpt-5.3-codex` | `claude-opus-4-6` | `opus` |
| `haiku` | `gpt-5.1-codex-mini` | `claude-haiku-4-5` | `haiku` |
| `economy` | `gpt-5.1-codex-mini` | `claude-haiku-4-5` | `haiku` |

### Coordinator Routing Classes

**File:** `coordinator/src/cli-server.js` lines 52-53

| Route Class | Codex Model | Claude Model |
|------------|-------------|--------------|
| `spark` | `gpt-5.3-codex-spark` | `haiku` |
| `high` | `gpt-5.3-codex` | `opus` |
| `mid` | `gpt-5.3-codex` | `sonnet` |
| Default | `gpt-5.3-codex` | `sonnet` |

### Config Keys

**File:** `coordinator/src/cli-server.js`

| Codex Config Key | Codex Default | Claude Equivalent Key | Claude Default |
|-----------------|---------------|----------------------|----------------|
| `model_spark` | `gpt-5.3-codex-spark` | `model_spark` | `haiku` |
| `model_flagship` | `gpt-5.3-codex` | `model_flagship` | `sonnet` |

---

## 4. Agent Launch Patterns

### Master-1 (Interface — Interactive)

**Codex (current):** `scripts/launch-agent.sh:95`
```bash
codex --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.3-codex \
  -C "$DIR" \
  -- "$(cat .codex/commands-codex10/master-loop.md)"
```

**Claude equivalent:**
```bash
claude --dangerously-skip-permissions \
  -m sonnet \
  -C "$DIR" \
  "$(cat .claude/commands/master-loop.md)"
```

---

### Master-2 (Architect — Autonomous, restart loop)

**Codex (current):** `scripts/launch-agent.sh:99-101`
```bash
while true; do
  codex exec --dangerously-bypass-approvals-and-sandbox \
    -m gpt-5.3-codex \
    -C "$DIR" \
    - < .codex/commands-codex10/architect-loop.md
  sleep 3
done
```

**Claude equivalent:**
```bash
while true; do
  claude -p "$(cat .claude/commands/architect-loop.md)" \
    --dangerously-skip-permissions \
    -m opus \
    -C "$DIR" \
    --no-session-persistence
  sleep 3
done
```

---

### Master-3 (Allocator — Autonomous, restart loop)

**Codex (current):** `scripts/launch-agent.sh:99-101`
```bash
while true; do
  codex exec --dangerously-bypass-approvals-and-sandbox \
    -m gpt-5.3-codex \
    -C "$DIR" \
    - < .codex/commands-codex10/allocate-loop.md
  sleep 3
done
```

**Claude equivalent:**
```bash
while true; do
  claude -p "$(cat .claude/commands/allocate-loop.md)" \
    --dangerously-skip-permissions \
    -m sonnet \
    -C "$DIR" \
    --no-session-persistence
  sleep 3
done
```

---

### Worker (One-shot per task)

**Codex (current):** `.codex/scripts/worker-sentinel.sh:71`
```bash
codex exec --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.3-codex \
  -C "$WORKTREE" \
  - < .codex/commands-codex10/worker-loop.md
```

**Claude equivalent:**
```bash
claude -p "$(cat .claude/commands/worker-loop.md)" \
  --dangerously-skip-permissions \
  -m sonnet \
  -C "$WORKTREE" \
  --no-session-persistence
```

---

### Loop Agent (Autonomous with adaptive backoff)

**Codex (current):** `.codex/scripts/loop-sentinel.sh:130`
```bash
codex exec --dangerously-bypass-approvals-and-sandbox \
  -m gpt-5.3-codex \
  -C "$PROJECT_DIR" \
  - < .codex/commands-codex10/loop-agent.md
```

**Claude equivalent:**
```bash
claude -p "$(cat .claude/commands/loop-agent.md)" \
  --dangerously-skip-permissions \
  -m sonnet \
  -C "$PROJECT_DIR" \
  --no-session-persistence
```

---

## 5. Directory & Path Conventions

| Codex Path | Claude Path | Purpose |
|------------|-------------|---------|
| `.codex/` | `.claude/` | Root config directory |
| `.codex/commands/` | `.claude/commands/` | Shared command templates |
| `.codex/commands-codex10/` | `.claude/commands/` | Namespace-isolated commands (flatten into `.claude/commands/` — single namespace) |
| `.codex/agents/` | `.claude/agents/` | Subagent definitions |
| `.codex/docs/` | `.claude/docs/` | Role documentation |
| `.codex/knowledge/` | `.claude/knowledge/` | Knowledge base |
| `.codex/scripts/` | `.claude/scripts/` | Execution scripts |
| `.codex/state/` | `.claude/state/` | Runtime state (DB, PID, sockets) |
| `.codex/signals/` | `.claude/signals/` | Signal files |
| `.codex/hooks/` | `.claude/hooks/` | Pre-execution hooks |
| `.codex/logs/` | `.claude/logs/` | Activity logs |
| `.codex/settings.json` | `.claude/settings.json` | Project settings |
| `.codex/worker-agents.md` | `.claude/worker-claude.md` | Worker base instructions |
| `.codex/worker-claude.md` | `.claude/worker-claude.md` | Legacy worker base (same file) |
| `AGENTS.md` (project root) | `CLAUDE.md` (project root) | Root instruction file — Claude reads `CLAUDE.md` natively |

### Key Differences

- **Claude reads `CLAUDE.md` natively** at session start (walks up directory tree). No `AGENTS.md` support.
- **Claude reads `.claude/agents/*.md`** for subagent definitions (with frontmatter).
- **The dual-write to both `CLAUDE.md` and `AGENTS.md`** collapses to writing only `CLAUDE.md`.
- **The `.codex/commands-codex10/` isolation** is unnecessary with a single namespace — all templates go to `.claude/commands/`.

---

## 6. Instruction Files

| Codex File | Claude File | Read By | Notes |
|------------|-------------|---------|-------|
| `AGENTS.md` (root) | `CLAUDE.md` (root) | Claude natively at session start | Claude reads CLAUDE.md automatically |
| `CLAUDE.md` (root, legacy) | `CLAUDE.md` (root) | Claude natively | Already correct naming |
| `.codex/worker-agents.md` | `.claude/worker-claude.md` | Overlay system (`overlay.js`) | Base template for worker overlays |
| `.codex/worker-claude.md` | `.claude/worker-claude.md` | Overlay system (fallback) | Same destination |
| `templates/root-claude.md` | `templates/root-claude.md` | `setup.sh` → copies to `CLAUDE.md` | No rename needed |
| `templates/worker-claude.md` | `templates/worker-claude.md` | `setup.sh` → copies to `.claude/worker-claude.md` | No rename needed |

### Overlay Write Points

**File:** `coordinator/src/overlay.js` lines 139-148

**Codex (current):** Dual-writes to both paths
```javascript
fs.writeFileSync(claudePath, content, 'utf8');   // CLAUDE.md
fs.writeFileSync(agentsPath, content, 'utf8');    // AGENTS.md
```

**Claude equivalent:** Single write
```javascript
fs.writeFileSync(claudePath, content, 'utf8');    // CLAUDE.md only
// Remove AGENTS.md write entirely
```

### Base Instruction Selection

**File:** `coordinator/src/overlay.js` lines 12-24

**Codex (current):** Prefers `worker-agents.md`, falls back to `worker-claude.md`
```javascript
if (fs.existsSync(workerAgentsMd)) {
  base = fs.readFileSync(workerAgentsMd, 'utf8');
} else {
  base = fs.readFileSync(workerClaudeMd, 'utf8');
}
```

**Claude equivalent:** Just read `worker-claude.md`
```javascript
base = fs.readFileSync(workerClaudeMd, 'utf8');  // .claude/worker-claude.md
```

---

## 7. Settings & Permissions

### Settings File

**Codex:** `.codex/settings.json`
**Claude:** `.claude/settings.json`

### Permission Patterns

| Codex Permission | Claude Permission | Notes |
|-----------------|-------------------|-------|
| `"Bash(codex *)"` | `"Bash(claude *)"` | Binary name swap |
| `"Bash(mac10 *)"` | `"Bash(mac10 *)"` | Coordinator CLI — unchanged (mac10 is the coordinator, not the LLM CLI) |
| `"Bash(git *)"` | `"Bash(git *)"` | Identical |
| `"Bash(gh *)"` | `"Bash(gh *)"` | Identical |
| `"Bash(npm *)"` | `"Bash(npm *)"` | Identical |
| `"Bash(node *)"` | `"Bash(node *)"` | Identical |
| `"Read"` | `"Read"` | Identical |
| `"Edit"` | `"Edit"` | Identical |
| `"Write"` | `"Write"` | Identical |
| `"Bash(cat *)"` | `"Bash(cat *)"` | Identical |

### Settings Keys

| Codex Key | Claude Key | Notes |
|-----------|------------|-------|
| `"skipDangerousModePermissionPrompt": true` | `"skipDangerousModePermissionPrompt": true` | Identical |
| `"trustedDirectories": [...]` | `"trustedDirectories": [...]` | Identical structure, update paths from `.codex` to `.claude` |

### Trusted Directories Example

**Codex:**
```json
"trustedDirectories": [
  "/mnt/c/Users/Owner/Desktop/setup-agents-codex10",
  "/mnt/c/Users/Owner/Desktop/setup-agents-codex10/.worktrees/wt-1"
]
```

**Claude:**
```json
"trustedDirectories": [
  "/mnt/c/Users/Owner/Desktop/setup-agents-mac10",
  "/mnt/c/Users/Owner/Desktop/setup-agents-mac10/.worktrees/wt-1"
]
```

---

## 8. Hooks

### Hook Configuration Location

**Codex:** `.codex/settings.json` → `hooks` key
**Claude:** `.claude/settings.json` → `hooks` key (or `.claude/hooks.json` dedicated file)

### Pre-Tool Hook

**Codex (current):**
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|Read|Bash",
      "hooks": [{
        "type": "command",
        "command": "bash -c 'bash \"$CODEX_PROJECT_DIR/.codex/hooks/pre-tool-secret-guard.sh\"'"
      }]
    }]
  }
}
```

**Claude equivalent:**
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write|Read|Bash",
      "hooks": [{
        "type": "command",
        "command": "bash -c 'bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-secret-guard.sh\"'"
      }]
    }]
  }
}
```

### Environment Variable in Hook

| Codex Env Var | Claude Env Var |
|---------------|----------------|
| `$CODEX_PROJECT_DIR` | `$CLAUDE_PROJECT_DIR` |

### Hook Events (identical in both)

| Event | Supported |
|-------|-----------|
| `PreToolUse` | Yes |
| `PostToolUse` | Yes |
| `PostToolUseFailure` | Yes |
| `SessionStart` | Yes |
| `SessionEnd` | Yes |
| `UserPromptSubmit` | Yes |
| `Notification` | Yes |
| `Stop` | Yes |
| `SubagentStart` | Claude-only |
| `SubagentStop` | Claude-only |
| `PreCompact` | Claude-only |

---

## 9. Subagent / Agent Definitions

### Agent Definition Files

**Codex:** `.codex/agents/*.md`
**Claude:** `.claude/agents/*.md`

### Current Agent Definitions

| Codex Agent File | Claude Agent File | Purpose |
|-----------------|-------------------|---------|
| `.codex/agents/build-validator.md` | `.claude/agents/build-validator.md` | Build validation |
| `.codex/agents/code-architect.md` | `.claude/agents/code-architect.md` | Code architecture |
| `.codex/agents/verify-app.md` | `.claude/agents/verify-app.md` | App verification |

### Claude Subagent Frontmatter Format

Claude agents support YAML frontmatter (codex agents may not have had this). For Claude, each `.claude/agents/*.md` file should have:

```markdown
---
name: build-validator
description: Validates builds after code changes. Use proactively after edits.
tools: Bash, Read, Grep, Glob
model: sonnet
maxTurns: 10
---

[Agent instructions here...]
```

### Built-In Claude Subagents (no codex equivalent)

| Claude Built-In | Description |
|----------------|-------------|
| `Explore` | Fast codebase search (haiku) |
| `Plan` | Planning/architecture agent |
| `general-purpose` | Full-capability agent |

---

## 10. Sentinel & Loop Scripts

### Worker Sentinel

**File:** `.codex/scripts/worker-sentinel.sh` → `.claude/scripts/worker-sentinel.sh`

| Codex Line | Codex Code | Claude Replacement |
|-----------|------------|-------------------|
| Line 71 | `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$WORKTREE" - < "$PROMPT_FILE"` | `claude -p "$(cat "$PROMPT_FILE")" --dangerously-skip-permissions -m sonnet -C "$WORKTREE" --no-session-persistence` |
| Prompt path | `.codex/commands-codex10/worker-loop.md` or `.codex/commands/worker-loop.md` | `.claude/commands/worker-loop.md` |

### Loop Sentinel

**File:** `.codex/scripts/loop-sentinel.sh` → `.claude/scripts/loop-sentinel.sh`

| Codex Line | Codex Code | Claude Replacement |
|-----------|------------|-------------------|
| Line 130 | `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$PROJECT_DIR" - < "$PROMPT_FILE"` | `claude -p "$(cat "$PROMPT_FILE")" --dangerously-skip-permissions -m sonnet -C "$PROJECT_DIR" --no-session-persistence` |
| Prompt path | `.codex/commands-codex10/loop-agent.md` or `.codex/commands/loop-agent.md` | `.claude/commands/loop-agent.md` |

### Launch Agent Script

**File:** `scripts/launch-agent.sh` → `scripts/launch-agent.sh`

| Function | Codex Code | Claude Replacement |
|----------|------------|-------------------|
| `resolve_model()` | Maps aliases → `gpt-5.3-codex` / `gpt-5.1-codex-mini` | Maps aliases → `sonnet` / `opus` / `haiku` |
| `resolve_prompt_file()` | Looks in `.codex/commands-codex10/` then `.codex/commands/` | Looks in `.claude/commands/` only |
| Interactive launch | `codex --dangerously-bypass-approvals-and-sandbox -m "$MODEL" -C "$DIR" -- "$PROMPT"` | `claude --dangerously-skip-permissions -m "$MODEL" -C "$DIR" "$PROMPT"` |
| Non-interactive launch | `codex exec --dangerously-bypass-approvals-and-sandbox -m "$MODEL" -C "$DIR" - < "$FILE"` | `claude -p "$(cat "$FILE")" --dangerously-skip-permissions -m "$MODEL" -C "$DIR" --no-session-persistence` |

### Model Resolver Replacement

**Codex:**
```bash
resolve_model() {
  case "$1" in
    sonnet|opus|fast|deep) echo "gpt-5.3-codex" ;;
    haiku|economy)          echo "gpt-5.1-codex-mini" ;;
    *)                      echo "$1" ;;
  esac
}
```

**Claude:**
```bash
resolve_model() {
  case "$1" in
    fast|sonnet)   echo "sonnet" ;;
    deep|opus)     echo "opus" ;;
    haiku|economy) echo "haiku" ;;
    *)             echo "$1" ;;
  esac
}
```

---

## 11. Coordinator Runtime References

### index.js Namespace Handling

**File:** `coordinator/src/index.js`

| Codex Reference | Claude Replacement | Line |
|----------------|-------------------|------|
| `'.codex', 'state'` | `'.claude', 'state'` | ~17-19 |
| `'.codex', 'scripts', 'worker-sentinel.sh'` | `'.claude', 'scripts', 'worker-sentinel.sh'` | ~139 |
| `MAC10_NAMESPACE` env var | `MAC10_NAMESPACE` (unchanged — coordinator namespace, not LLM-specific) | ~17 |
| `'codex10'` default namespace | `'mac10'` (revert to single namespace) | ~17 |

### Worker Spawn Command

**Codex:**
```javascript
`MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${worker.id} "${projectDir}"`
```

**Claude (unchanged — sentinel script handles the claude invocation internally):**
```javascript
`MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${worker.id} "${projectDir}"`
```

### Loop Spawn Command

**Codex:**
```javascript
`MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${loopId} "${projectDir}"`
```

**Claude (unchanged):**
```javascript
`MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${loopId} "${projectDir}"`
```

---

## 12. Overlay System

**File:** `coordinator/src/overlay.js`

| Codex Behavior | Claude Replacement |
|---------------|-------------------|
| Reads `.codex/worker-agents.md` (preferred) | Reads `.claude/worker-claude.md` (single file) |
| Falls back to `.codex/worker-claude.md` | No fallback needed — single canonical path |
| Writes to both `CLAUDE.md` and `AGENTS.md` in worktree | Writes to `CLAUDE.md` only |
| Path references to `.codex/knowledge/` | Path references to `.claude/knowledge/` |
| Path references to `.codex/agents/` | Path references to `.claude/agents/` |

### Path Constants to Replace in overlay.js

| Codex String | Claude String |
|-------------|---------------|
| `'.codex', 'worker-agents.md'` | `'.claude', 'worker-claude.md'` |
| `'.codex', 'worker-claude.md'` | `'.claude', 'worker-claude.md'` |
| `'AGENTS.md'` (write target) | Remove — only write `CLAUDE.md` |
| `'.codex', 'knowledge'` | `'.claude', 'knowledge'` |
| `'.codex', 'agents'` | `'.claude', 'agents'` |

---

## 13. Setup Script Replacements

**File:** `setup.sh`

### Binary & Preflight

| Codex Line | Codex Code | Claude Code |
|-----------|------------|-------------|
| 49 | `_wsl_shim codex` | `_wsl_shim claude` |
| 81 | `check_cmd codex` | `check_cmd claude` |

### Directory Structure

| Codex Step | Claude Step |
|-----------|------------|
| Create `.codex/` | Create `.claude/` |
| Migration `.claude/` → `.codex/` | No migration needed (`.claude/` is native) |
| `.codex/commands/` | `.claude/commands/` |
| `.codex/commands-codex10/` | Remove (single namespace) |
| `.codex/agents/` | `.claude/agents/` |
| `.codex/docs/` | `.claude/docs/` |
| `.codex/knowledge/` | `.claude/knowledge/` |
| `.codex/scripts/` | `.claude/scripts/` |
| `.codex/state/` | `.claude/state/` |
| `.codex/signals/` | `.claude/signals/` |
| `.codex/hooks/` | `.claude/hooks/` |
| `.codex/logs/` | `.claude/logs/` |

### Instruction File Copies

| Codex Copy | Claude Copy |
|-----------|------------|
| `templates/root-claude.md` → `AGENTS.md` | `templates/root-claude.md` → `CLAUDE.md` |
| `templates/root-claude.md` → `CLAUDE.md` | `templates/root-claude.md` → `CLAUDE.md` (single target) |
| `templates/worker-claude.md` → `.codex/worker-agents.md` | `templates/worker-claude.md` → `.claude/worker-claude.md` |
| `templates/worker-claude.md` → `.codex/worker-claude.md` | Same as above (deduplicate) |

### Namespace Wrappers

| Codex Wrapper | Claude Equivalent |
|--------------|-------------------|
| `.codex/scripts/codex10` (→ coordinator with `MAC10_NAMESPACE="codex10"`) | `.claude/scripts/mac10` (→ coordinator with `MAC10_NAMESPACE="mac10"`) |
| `.codex/scripts/mac10-codex10` (copy of codex10) | Remove (single namespace) |
| `.codex/scripts/mac10` (compat shim) | `.claude/scripts/mac10` (primary wrapper) |
| Dynamic shim `.codex/scripts/.codex10-shims/mac10` | Remove (single namespace, no shim needed) |

### Launch Commands in setup.sh

| Codex Launch (Lines 449-476) | Claude Launch |
|-----------------------------|---------------|
| `codex --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex ...` (Master-1) | `claude --dangerously-skip-permissions -m sonnet ...` |
| `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex ... < architect-loop.md` (Master-2) | `claude -p "$(cat architect-loop.md)" --dangerously-skip-permissions -m opus ...` |
| `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex ... < allocate-loop.md` (Master-3) | `claude -p "$(cat allocate-loop.md)" --dangerously-skip-permissions -m sonnet ...` |

---

## 14. Signal & State Files

### State Files

| Codex File | Claude File | Purpose |
|-----------|------------|---------|
| `.codex/state/codex10.db` | `.claude/state/mac10.db` | SQLite database |
| `.codex/state/codex10.pid` | `.claude/state/mac10.pid` | Coordinator PID |
| `.codex/state/codex10.sock.path` | `.claude/state/mac10.sock.path` | Unix socket |
| `.codex/state/codex10.tcp.port` | `.claude/state/mac10.tcp.port` | TCP port |
| `.codex/state/codex10.coordinator.log` | `.claude/state/mac10.coordinator.log` | Coordinator log |
| `.codex/state/codex10.agent-health.json` | `.claude/state/mac10.agent-health.json` | Agent health |
| `.codex/state/codex10.handoff.json` | `.claude/state/mac10.handoff.json` | Handoff state |

### Signal Files

| Codex Signal | Claude Signal |
|-------------|---------------|
| `.codex/signals/.codex10.handoff-signal` | `.claude/signals/.mac10.handoff-signal` |
| `.codex/signals/.codex10.task-signal` | `.claude/signals/.mac10.task-signal` |
| `.codex/signals/.codex10.fix-signal` | `.claude/signals/.mac10.fix-signal` |
| `.codex/signals/.codex10.completion-signal` | `.claude/signals/.mac10.completion-signal` |
| `.codex/signals/.codex10.restart-signal` | `.claude/signals/.mac10.restart-signal` |

---

## 15. Environment Variables

| Codex Env Var | Claude Env Var | Used In |
|--------------|----------------|---------|
| `MAC10_NAMESPACE="codex10"` | `MAC10_NAMESPACE="mac10"` | All scripts, coordinator |
| `CODEX_PROJECT_DIR` | `CLAUDE_PROJECT_DIR` | Hooks |
| `MAC10_SCRIPT_DIR` | `MAC10_SCRIPT_DIR` (unchanged) | Coordinator startup |
| *(no equivalent)* | `ANTHROPIC_MODEL` | Set default model |
| *(no equivalent)* | `CLAUDE_CODE_EFFORT_LEVEL` | Set effort level |
| *(no equivalent)* | `CLAUDE_CODE_SUBAGENT_MODEL` | Set subagent model |
| *(no equivalent)* | `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Disable auto memory |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | *(removed in codex; Claude supports natively via `.claude/agents/`)* | Agent team mode |

---

## 16. Knowledge Base

**Path change:** `.codex/knowledge/` → `.claude/knowledge/`

All files are project-managed (not Claude-native). No format changes needed — only path references inside agent prompt templates must update.

| Codex Path | Claude Path |
|-----------|------------|
| `.codex/knowledge/mistakes.md` | `.claude/knowledge/mistakes.md` |
| `.codex/knowledge/patterns.md` | `.claude/knowledge/patterns.md` |
| `.codex/knowledge/instruction-patches.md` | `.claude/knowledge/instruction-patches.md` |
| `.codex/knowledge/worker-lessons.md` | `.claude/knowledge/worker-lessons.md` |
| `.codex/knowledge/change-summaries.md` | `.claude/knowledge/change-summaries.md` |
| `.codex/knowledge/codebase-insights.md` | `.claude/knowledge/codebase-insights.md` |
| `.codex/knowledge/user-preferences.md` | `.claude/knowledge/user-preferences.md` |
| `.codex/knowledge/allocation-learnings.md` | `.claude/knowledge/allocation-learnings.md` |
| `.codex/knowledge/loop-findings.md` | `.claude/knowledge/loop-findings.md` |
| `.codex/knowledge/domain/*.md` | `.claude/knowledge/domain/*.md` |

### References to Update Inside Prompt Templates

Every `.codex/commands-codex10/*.md` file that references `.codex/knowledge/` must change to `.claude/knowledge/`.

---

## 17. Per-Agent Command Mapping

The coordinator CLI commands (`mac10`/`codex10`) are **not LLM-specific** — they talk to the Node.js coordinator, not the codex binary. These commands remain unchanged in Claude migration. Only the wrapper script path changes.

### Wrapper Reference in Prompts

| Codex Reference in Prompts | Claude Reference |
|---------------------------|-----------------|
| `./.codex/scripts/codex10 request ...` | `mac10 request ...` or `./.claude/scripts/mac10 request ...` |
| `./.codex/scripts/codex10 status` | `mac10 status` |
| `./.codex/scripts/codex10 fix ...` | `mac10 fix ...` |
| `./.codex/scripts/codex10 inbox ...` | `mac10 inbox ...` |
| `./.codex/scripts/codex10 triage ...` | `mac10 triage ...` |
| `./.codex/scripts/codex10 create-task ...` | `mac10 create-task ...` |
| `./.codex/scripts/codex10 ready-tasks` | `mac10 ready-tasks` |
| `./.codex/scripts/codex10 worker-status` | `mac10 worker-status` |
| `./.codex/scripts/codex10 assign-task ...` | `mac10 assign-task ...` |
| `./.codex/scripts/codex10 integrate ...` | `mac10 integrate ...` |
| `./.codex/scripts/codex10 my-task ...` | `mac10 my-task ...` |
| `./.codex/scripts/codex10 start-task ...` | `mac10 start-task ...` |
| `./.codex/scripts/codex10 heartbeat ...` | `mac10 heartbeat ...` |
| `./.codex/scripts/codex10 complete-task ...` | `mac10 complete-task ...` |
| `./.codex/scripts/codex10 fail-task ...` | `mac10 fail-task ...` |
| `./.codex/scripts/codex10 distill ...` | `mac10 distill ...` |
| `./.codex/scripts/codex10 loop ...` | `mac10 loop ...` |
| `./.codex/scripts/codex10 loop-status` | `mac10 loop-status` |
| `./.codex/scripts/codex10 stop-loop ...` | `mac10 stop-loop ...` |
| `./.codex/scripts/codex10 loop-prompt ...` | `mac10 loop-prompt ...` |
| `./.codex/scripts/codex10 loop-requests ...` | `mac10 loop-requests ...` |
| `./.codex/scripts/codex10 loop-heartbeat ...` | `mac10 loop-heartbeat ...` |
| `./.codex/scripts/codex10 clarify ...` | `mac10 clarify ...` |
| `./.codex/scripts/codex10 check-completion ...` | `mac10 check-completion ...` |
| `./.codex/scripts/codex10 log` | `mac10 log` |
| `./.codex/scripts/codex10 tier1-complete ...` | `mac10 tier1-complete ...` |
| `./.codex/scripts/codex10 ask-clarification ...` | `mac10 ask-clarification ...` |

### Constraint Line in Every Prompt Template

**Codex (current):**
> "Use only `./.codex/scripts/codex10 ...` for coordinator commands. Never invoke raw `mac10` in this codex10 runtime."

**Claude (replacement):**
> "Use only `mac10 ...` for coordinator commands. Ensure `./.claude/scripts` is on PATH."

---

## 18. Migration Decision Log

### Decisions Required Before Implementation

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Namespace:** Keep dual (codex10 + mac10) or collapse to single? | Dual / Single | **Single (`mac10`)** — eliminates `.codex/commands-codex10/` isolation layer |
| 2 | **Root instruction file:** `CLAUDE.md` only or keep dual write? | Single / Dual | **Single (`CLAUDE.md`)** — Claude reads it natively |
| 3 | **Model mapping:** `fast`→sonnet, `deep`→opus? Or both→sonnet? | Split / Unified | **Split** — use opus for architect (deep reasoning), sonnet for others |
| 4 | **Prompt delivery:** `"$(cat file)"` arg vs stdin pipe? | Arg / Pipe | **Arg** — `claude -p "$(cat file)"` is more explicit |
| 5 | **Session persistence:** Use `--no-session-persistence` for autonomous agents? | Yes / No | **Yes** — prevents session file buildup from sentinel loops |
| 6 | **Worker base file:** Keep both `worker-agents.md` + `worker-claude.md`? | Both / Single | **Single (`worker-claude.md`)** — Claude-native naming |
| 7 | **Coordinator namespace env:** Keep `MAC10_NAMESPACE` or rename? | Keep / Rename | **Keep** — coordinator is LLM-agnostic, no rename needed |
| 8 | **Spark model class:** Map to haiku or sonnet? | Haiku / Sonnet | **Haiku** — spark is the lightweight/fast classification tier |

### Files Requiring Changes (Ordered by Priority)

| Priority | File | Change Type | Scope |
|----------|------|------------|-------|
| P0 | `scripts/launch-agent.sh` | Binary swap, flag swap, model resolver | All launch patterns |
| P0 | `.codex/scripts/worker-sentinel.sh` | Binary swap, flag swap, path swap | Worker invocation |
| P0 | `.codex/scripts/loop-sentinel.sh` | Binary swap, flag swap, path swap | Loop invocation |
| P0 | `setup.sh` | Binary preflight, directory creation, launch commands | Full rewrite of codex references |
| P1 | `coordinator/src/overlay.js` | Path constants, remove AGENTS.md write | Overlay system |
| P1 | `coordinator/src/cli-server.js` | Model ID defaults | Routing config |
| P1 | `coordinator/src/index.js` | Path constants (`.codex` → `.claude`), default namespace | Runtime init |
| P1 | `.codex/settings.json` → `.claude/settings.json` | Permission pattern (`codex *` → `claude *`), env var in hooks | Settings |
| P2 | `.codex/commands-codex10/master-loop.md` | Path refs, constraint line | Prompt template |
| P2 | `.codex/commands-codex10/architect-loop.md` | Path refs, constraint line | Prompt template |
| P2 | `.codex/commands-codex10/allocate-loop.md` | Path refs, constraint line | Prompt template |
| P2 | `.codex/commands-codex10/worker-loop.md` | Path refs, constraint line, PATH setup | Prompt template |
| P2 | `.codex/commands-codex10/loop-agent.md` | Path refs | Prompt template |
| P2 | `templates/commands/*.md` | Path refs (`.codex/` → `.claude/`) | Source templates |
| P3 | `AGENTS.md` → rename to `CLAUDE.md` | File rename | Root instruction |
| P3 | `.codex/scripts/codex10` → `.claude/scripts/mac10` | Wrapper rename, remove namespace override | Coordinator wrapper |
| P3 | `README.md` | Documentation updates | Docs |
| P3 | `mac10-codex-migration-spec.md` | Archive or remove | Docs |
| P3 | `codex-equivalents-index.md` | Archive or remove | Docs |
