# mac10 -> Codex Migration Spec (No Code Changes Yet)

Scope:
- Analyze full `setup-agents-mac10` runtime path and define exact compatibility fixes for Codex CLI.
- This is a planning/spec document only. No source edits are applied in this step.

Date:
- 2026-03-08

Validated runtime facts (local):
- `codex-cli 0.111.0`
- `codex` rejects Claude flags/model IDs:
  - `--dangerously-skip-permissions` -> invalid
  - `-p "/worker-loop"` -> interpreted as `--profile`, not print mode
  - `-m sonnet|opus` -> unsupported
  - `--prompt-file`, `--cwd`, `--continue` -> invalid in current CLI
- Supported equivalents:
  - Safety bypass: `--dangerously-bypass-approvals-and-sandbox`
  - Non-interactive run: `codex exec ...`
  - Working directory: `-C <dir>`
  - Resume: `codex resume` or `codex exec resume`
  - Stdin prompt: `codex exec ... - < prompt.md`

---

## 1) Blocking Incompatibilities and Required Fixes

### A. Launcher/CLI flag incompatibility
Files:
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/setup.sh`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/scripts/launch-agent.sh`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/scripts/worker-sentinel.sh`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/scripts/loop-sentinel.sh`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/coordinator/src/web-server.js`

Problems:
- Hardcoded `claude` binary and Claude-only flags/models.
- Slash command invocation assumption (`/master-loop`) is not native Codex command syntax.

Fix design:
1. Replace runtime binary with `codex`.
2. Replace safety flag with `--dangerously-bypass-approvals-and-sandbox`.
3. Add model alias resolver in one place (e.g. `fast|deep|economy`) -> valid Codex model IDs.
4. Replace slash argument execution with prompt-file mapping and stdin:
   - `/master-loop` -> `.claude/commands/master-loop.md`
   - `/architect-loop` -> `.claude/commands/architect-loop.md`
   - `/allocate-loop` -> `.claude/commands/allocate-loop.md`
   - `/worker-loop` -> `.claude/commands/worker-loop.md`
   - `/loop-agent` -> `.claude/commands/loop-agent.md`
5. Use:
   - `codex exec --dangerously-bypass-approvals-and-sandbox -m "$MODEL" -C "$DIR" - < "$PROMPT_FILE"`

---

### B. Missing helper scripts referenced by loop docs
Files referencing helpers:
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/templates/commands/master-loop.md`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/templates/commands/architect-loop.md`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/templates/commands/allocate-loop.md`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/.claude/commands/*`

Referenced helpers:
- `.claude/scripts/state-lock.sh`
- `.claude/scripts/signal-wait.sh`
- `.claude/scripts/launch-worker.sh`

Current installed in project:
- `.claude/scripts/mac10`
- `.claude/scripts/worker-sentinel.sh`

Fix design:
1. Add missing helper scripts to `scripts/` source and copy them in `setup.sh` (same way as `worker-sentinel.sh`).
2. Ensure worktrees get these scripts under `.claude/scripts/`.
3. Ensure executable permissions are set.

Note:
- This is a blocker independent of Codex migration because current loop docs already depend on these files.

---

### C. Instruction file mismatch (`CLAUDE.md` vs Codex flow)
Files:
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/setup.sh`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/coordinator/src/overlay.js`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/coordinator/src/index.js`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/coordinator/src/cli-server.js`

Problems:
- Coordinator writes per-task overlays to `CLAUDE.md`.
- Setup only provisions root/worker `CLAUDE.md`.

Fix design (safe transition):
1. Dual-write overlays to both:
   - `CLAUDE.md` (legacy compatibility)
   - `AGENTS.md` (Codex-native compatibility)
2. During setup, seed both root and worker instruction files:
   - `CLAUDE.md` from existing templates
   - `AGENTS.md` mirrored from same templates
3. Keep `.claude/commands/*.md` as prompt sources for `codex exec - < file`.

---

### D. Settings/hook schema mismatch
Files:
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/templates/settings.json`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/.claude/settings.json`

Problems:
- Current settings object uses Claude-specific semantics and `CLAUDE_PROJECT_DIR`.
- Codex CLI enforcement is done primarily via CLI flags + `~/.codex/config.toml`.

Fix design:
1. Keep project-local settings file for documentation only (optional), but do not rely on it for enforcement.
2. Enforce policy in launch commands:
   - `-C <dir>`
   - sandbox/approval flags
   - explicit env exports (e.g. `CODEX_PROJECT_DIR`)
3. If hooks are still required, invoke them from wrappers/sentinels directly before `codex exec`.

---

### E. Team burst env toggle mismatch
Files:
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/scripts/launch-agent.sh`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/templates/commands/architect-loop.md`
- `/mnt/c/Users/Owner/Desktop/setup-agents-mac10/templates/commands/allocate-loop.md`

Problem:
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` has no known Codex equivalent.

Fix design:
1. Remove hard dependency on that env gate.
2. Reframe “burst mode” as explicit coordinator-orchestrated parallel `codex exec` subprocesses (optional).
3. Keep burst behavior behind mac10 policy flag if needed.

---

## 2) File-by-File Change Plan

### `setup.sh`
Planned edits:
1. Preflight:
   - `check_cmd claude` -> `check_cmd codex`
   - `_wsl_shim claude` -> `_wsl_shim codex`
2. Launch command echoes:
   - Replace Claude examples with Codex command examples.
3. Script copy/install phase:
   - Include missing helper scripts: `state-lock.sh`, `signal-wait.sh`, `launch-worker.sh` (and any script referenced in command docs).
4. Optional:
   - Seed `AGENTS.md` alongside `CLAUDE.md`.

---

### `scripts/launch-agent.sh`
Planned edits:
1. Replace `claude` execution with Codex runner.
2. Add command mapping function from slash-command input to prompt file path.
3. Add model alias resolver:
   - `sonnet` -> `fast` alias
   - `opus` -> `deep` alias
   - `haiku` -> `economy` alias
   - alias -> valid codex model id
4. Run:
   - `codex exec --dangerously-bypass-approvals-and-sandbox -m "$MODEL_RESOLVED" -C "$DIR" - < "$PROMPT_FILE"`
5. Remove Claude-only env toggles; replace/keep neutral env vars:
   - `export CODEX_PROJECT_DIR="$DIR"`
   - `export MAC10_AGENT_ROLE="$CMD"`

---

### `scripts/worker-sentinel.sh`
Planned edits:
1. Replace Claude launch line with Codex one-shot `exec` using worker loop prompt file.
2. Keep sentinel lifecycle behavior unchanged (rebase, wait on inbox, reset worker on exit).
3. Remove `unset CLAUDECODE`; optionally unset harmlessly but not required.

---

### `scripts/loop-sentinel.sh`
Planned edits:
1. Replace Claude launch line with Codex one-shot `exec` using loop-agent prompt file.
2. Keep adaptive backoff logic as-is.
3. Remove `unset CLAUDECODE` dependency.

---

### `coordinator/src/web-server.js`
Planned edits:
1. Change `launchAgent(... model, slashCmd ...)` calls:
   - `sonnet|opus` inputs become codex aliases (`fast|deep`) or resolved model IDs.
2. Keep passing logical slash command names (wrapper maps them to markdown prompt files).
3. Update returned UI strings to avoid Claude model naming.

---

### `coordinator/src/overlay.js`, `coordinator/src/index.js`, `coordinator/src/cli-server.js`
Planned edits:
1. Overlay writes:
   - write `AGENTS.md` (required)
   - optionally keep `CLAUDE.md` for compatibility
2. Base worker doc path:
   - support `.claude/worker-claude.md` and `.codex/worker-agents.md` if present
3. Copy logic for new workers:
   - ensure per-worktree `AGENTS.md` is populated.

---

### `README.md` and template docs
Planned edits:
1. Replace Claude prerequisites/launch examples with Codex equivalents.
2. Replace model branding (Opus/Sonnet/Haiku) with runtime aliases (`deep/fast/economy`) and resolved model IDs.
3. Update reset/restart wording if `/clear` is no longer meaningful in Codex mode.

---

## 3) Runtime Command Contracts (Post-Migration)

### Contract 1: One-shot agent loop execution
```bash
codex exec \
  --dangerously-bypass-approvals-and-sandbox \
  -m "$MODEL_RESOLVED" \
  -C "$RUN_DIR" \
  - < "$PROMPT_FILE"
```

### Contract 2: Prompt file generation
Input:
- role doc
- loop doc
- optional task overlay section

Output:
- single markdown prompt file consumed via stdin by `codex exec`.

### Contract 3: Model resolution
Example map:
- `fast` -> `gpt-5.3-codex`
- `deep` -> `gpt-5.3-codex`
- `economy` -> `gpt-5.1-codex-mini`
- `highest` -> `gpt-5.3-codex` (or account-specific highest available)

All resolver logic should live in one script/function to avoid drift.

---

## 4) Migration Order (Recommended)

1. Add missing helper scripts and setup copy logic.
2. Swap launch runtime from Claude to Codex in launch/sentinels.
3. Add command mapping (`/x` -> prompt file) in launcher.
4. Update web-server launch model aliases.
5. Update overlay/write path for `AGENTS.md`.
6. Update docs/templates naming and examples.
7. Run end-to-end validation.

---

## 5) Validation Checklist (After Implementation)

### Preflight
1. `bash setup.sh <project> <workers>` passes with `codex` installed.
2. `.claude/scripts/` contains all scripts referenced in command docs.

### Launcher tests
1. Master launch command opens and executes mapped loop prompt.
2. Worker sentinel receives task, runs one-shot Codex worker loop, then resets to idle.
3. Loop sentinel runs one-shot Codex loop iterations and obeys backoff logic.

### Coordinator tests
1. `mac10 request` -> triage flow works.
2. `mac10 assign-task` triggers worker launch path successfully.
3. Overlay file appears as `AGENTS.md` in worker worktree.

### Regression checks
1. `mac10 status`, `mac10 log`, `mac10 inbox` behavior unchanged.
2. GUI launch buttons still work.
3. No unresolved `claude` command references remain in executable paths.

---

## 6) Open Decisions (Still Needs Brainstorming)

1. Whether to fully rename `.claude/` -> `.codex/` now, or run transitional dual-compat mode first.
2. Exact model IDs to standardize in production for your account tier.
3. Whether to keep autonomous masters in `codex exec` one-shot loop mode or move masters to persistent interactive `codex` sessions.

