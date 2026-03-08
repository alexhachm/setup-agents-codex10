# Claude Reference Index (setup-agents-mac10)

Generated from "/mnt/c/Users/Owner/Desktop/setup-agents-mac10" on 2026-03-07 (America/Chicago).

Scope:
- Includes all non-.git matches for claude usages/calls and Claude-specific custom references.
- This is the discovery/index step only (no migrations yet).

## Summary
- Files with Claude-related references: 60
- Direct claude token usages/calls: 31
- Claude env/custom variables (CLAUDE*): 55
- Claude path/file references (.claude/, CLAUDE.md, worker-claude.md, etc.): 227
- Model/vendor references (opus, sonnet, haiku, anthropic): 62

## 1) Files Containing Claude-Related References

```text
./.claude/agents/build-validator.md
./.claude/agents/code-architect.md
./.claude/agents/verify-app.md
./.claude/commands/allocate-loop.md
./.claude/commands/architect-loop.md
./.claude/commands/loop-agent.md
./.claude/commands/master-loop.md
./.claude/commands/scan-codebase-allocator.md
./.claude/commands/scan-codebase.md
./.claude/commands/worker-loop.md
./.claude/docs/architect-role.md
./.claude/docs/master-1-role.md
./.claude/docs/master-2-role.md
./.claude/docs/master-3-role.md
./.claude/knowledge/allocation-learnings.md
./.claude/knowledge/codebase-insights.md
./.claude/knowledge/mistakes.md
./.claude/knowledge/patterns.md
./.claude/scripts/worker-sentinel.sh
./.claude/settings.json
./.claude/worker-claude.md
./.gitignore
./CLAUDE.md
./README.md
./coordinator/bin/mac10
./coordinator/package.json
./coordinator/src/cli-server.js
./coordinator/src/db.js
./coordinator/src/hub.js
./coordinator/src/index.js
./coordinator/src/overlay.js
./coordinator/src/watchdog.js
./coordinator/src/web-server.js
./coordinator/tests/allocator.test.js
./coordinator/tests/cli.test.js
./coordinator/tests/merger.test.js
./coordinator/tests/security.test.js
./coordinator/tests/state-machine.test.js
./coordinator/tests/watchdog.test.js
./gui/public/index.html
./scripts/launch-agent.sh
./scripts/loop-sentinel.sh
./scripts/worker-sentinel.sh
./setup.sh
./templates/agents/build-validator.md
./templates/agents/code-architect.md
./templates/agents/verify-app.md
./templates/commands/allocate-loop.md
./templates/commands/architect-loop.md
./templates/commands/master-loop.md
./templates/commands/scan-codebase-allocator.md
./templates/commands/scan-codebase.md
./templates/commands/worker-loop.md
./templates/docs/architect-role.md
./templates/docs/master-1-role.md
./templates/docs/master-2-role.md
./templates/docs/master-3-role.md
./templates/root-claude.md
./templates/settings.json
./templates/worker-claude.md
```

## 2) Direct claude Usages/Calls

```text
./README.md:22:# Prerequisites: node 18+, git, gh, tmux, claude
./README.md:30:claude --model opus /architect-loop
./setup.sh:47:  _wsl_shim claude
./setup.sh:79:check_cmd claude
./setup.sh:376:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /master-loop"
./setup.sh:377:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model opus /architect-loop"
./setup.sh:378:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /allocate-loop"
./setup.sh:394:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /master-loop"
./setup.sh:395:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model opus /architect-loop"
./setup.sh:396:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /allocate-loop"
./setup.sh:401:  echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /master-loop"
./setup.sh:402:  echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model opus /architect-loop"
./setup.sh:403:  echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /allocate-loop"
./scripts/worker-sentinel.sh:3:# Waits for tasks via mac10 inbox, syncs git, launches claude, resets on exit.
./scripts/worker-sentinel.sh:37:  echo "[sentinel-$WORKER_ID] Launching claude..."
./scripts/worker-sentinel.sh:39:  claude --model opus --dangerously-skip-permissions -p "/worker-loop" 2>&1 || true
./scripts/worker-sentinel.sh:66:      echo "[sentinel-$WORKER_ID] Found orphaned task assignment — launching claude"
./scripts/launch-agent.sh:33:claude --dangerously-skip-permissions --model "$MODEL" "$CMD"
./scripts/loop-sentinel.sh:3:# Continuously relaunches claude for a persistent autonomous loop.
./scripts/loop-sentinel.sh:63:  echo "[loop-sentinel-$LOOP_ID] Launching claude (iteration backoff=${BACKOFF}s)..."
./scripts/loop-sentinel.sh:66:  claude --model opus --dangerously-skip-permissions -p "/loop-agent" 2>&1 || true
./.claude/settings.json:10:      "Bash(claude *)",
./templates/settings.json:10:      "Bash(claude *)",
./.claude/scripts/worker-sentinel.sh:3:# Waits for tasks via mac10 inbox, syncs git, launches claude, resets on exit.
./.claude/scripts/worker-sentinel.sh:38:    echo "[sentinel-$WORKER_ID] Launching claude..."
./.claude/scripts/worker-sentinel.sh:40:    claude --model opus --dangerously-skip-permissions -p "/worker-loop" 2>&1 || true
./.claude/knowledge/mistakes.md:8:- **Issue**: Worker sentinels launch `claude` inside tmux, but `CLAUDECODE` env var from parent causes "nested session" rejection
./.claude/knowledge/mistakes.md:9:- **Fix**: Added `unset CLAUDECODE` before launching claude in BOTH `scripts/worker-sentinel.sh` AND `.claude/scripts/worker-sentinel.sh`
./.claude/knowledge/mistakes.md:22:- **Issue**: `claude --dangerously-skip-permissions "/worker-loop"` processes the command but doesn't exit — goes interactive, sentinel never cycles
./.claude/knowledge/mistakes.md:23:- **Fix**: Added `-p` (print mode) flag: `claude --model opus --dangerously-skip-permissions -p "/worker-loop"` — exits after processing
./.claude/knowledge/patterns.md:8:- Sentinel needs `unset CLAUDECODE` before launching claude in tmux
```

## 3) Claude Environment / Custom Variables (CLAUDE*)

```text
./setup.sh:113:CLAUDE_DIR="$PROJECT_DIR/.claude"
./setup.sh:114:mkdir -p "$CLAUDE_DIR/commands"
./setup.sh:115:mkdir -p "$CLAUDE_DIR/state"
./setup.sh:116:mkdir -p "$CLAUDE_DIR/knowledge/domain"
./setup.sh:117:mkdir -p "$CLAUDE_DIR/scripts"
./setup.sh:125:  dest="$CLAUDE_DIR/commands/$(basename "$f")"
./setup.sh:130:mkdir -p "$CLAUDE_DIR/agents"
./setup.sh:132:  dest="$CLAUDE_DIR/agents/$(basename "$f")"
./setup.sh:138:  dest="$CLAUDE_DIR/knowledge/$(basename "$f")"
./setup.sh:143:mkdir -p "$CLAUDE_DIR/docs"
./setup.sh:144:cp "$SCRIPT_DIR/templates/docs/"*.md "$CLAUDE_DIR/docs/"
./setup.sh:146:# CLAUDE.md for architect (root) — only if not already present
./setup.sh:147:if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
./setup.sh:148:  cp "$SCRIPT_DIR/templates/root-claude.md" "$PROJECT_DIR/CLAUDE.md"
./setup.sh:150:  echo "  CLAUDE.md already exists, keeping existing."
./setup.sh:153:# Worker CLAUDE.md template
./setup.sh:154:cp "$SCRIPT_DIR/templates/worker-claude.md" "$CLAUDE_DIR/worker-claude.md"
./setup.sh:157:cp "$SCRIPT_DIR/scripts/worker-sentinel.sh" "$CLAUDE_DIR/scripts/"
./setup.sh:158:chmod +x "$CLAUDE_DIR/scripts/worker-sentinel.sh"
./setup.sh:161:mkdir -p "$CLAUDE_DIR/hooks"
./setup.sh:162:cp "$SCRIPT_DIR/.claude/hooks/pre-tool-secret-guard.sh" "$CLAUDE_DIR/hooks/" 2>/dev/null || true
./setup.sh:163:chmod +x "$CLAUDE_DIR/hooks/"*.sh 2>/dev/null || true
./setup.sh:166:SETTINGS_FILE="$CLAUDE_DIR/settings.json"
./setup.sh:181:cat > "$CLAUDE_DIR/scripts/mac10" << 'WRAPPER'
./setup.sh:193:sed -i "s|PLACEHOLDER_MAC10_BIN|$MAC10_BIN|" "$CLAUDE_DIR/scripts/mac10"
./setup.sh:194:chmod +x "$CLAUDE_DIR/scripts/mac10"
./setup.sh:197:export PATH="$CLAUDE_DIR/scripts:$SCRIPT_DIR/coordinator/bin:$PATH"
./setup.sh:227:  # Copy CLAUDE.md for worker
./setup.sh:228:  cp "$CLAUDE_DIR/worker-claude.md" "$WT_PATH/CLAUDE.md"
./setup.sh:236:  cp "$CLAUDE_DIR/commands/"*.md "$WT_PATH/.claude/commands/"
./setup.sh:237:  cp "$CLAUDE_DIR/scripts/mac10" "$WT_PATH/.claude/scripts/"
./setup.sh:238:  cp "$CLAUDE_DIR/agents/"*.md "$WT_PATH/.claude/agents/"
./setup.sh:239:  cp "$CLAUDE_DIR/hooks/"*.sh "$WT_PATH/.claude/hooks/" 2>/dev/null || true
./setup.sh:243:  cp -r "$CLAUDE_DIR/knowledge/"* "$WT_PATH/.claude/knowledge/" 2>/dev/null || true
./setup.sh:301:SOCK_PATH_FILE="$CLAUDE_DIR/state/mac10.sock.path"
./scripts/worker-sentinel.sh:36:  # Launch Claude worker (unset CLAUDECODE to allow nested session in tmux)
./scripts/worker-sentinel.sh:38:  unset CLAUDECODE
./scripts/loop-sentinel.sh:65:  unset CLAUDECODE
./scripts/launch-agent.sh:30:unset CLAUDECODE 2>/dev/null || true
./scripts/launch-agent.sh:32:export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
./.claude/settings.json:83:            "command": "bash -c 'bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-secret-guard.sh\"'"
./templates/settings.json:57:            "command": "bash -c 'bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-secret-guard.sh\"'"
./coordinator/src/index.js:61:    // Write task overlay to worker's CLAUDE.md
./.claude/scripts/worker-sentinel.sh:37:    # Launch Claude worker (unset CLAUDECODE to allow nested session in tmux)
./.claude/scripts/worker-sentinel.sh:39:    unset CLAUDECODE
./coordinator/src/overlay.js:7: * Generate per-task CLAUDE.md overlay for a worker.
./coordinator/src/overlay.js:9: *   1. Base CLAUDE.md — always present, defines worker role + tools
./coordinator/src/overlay.js:119:  const overlayPath = path.join(worktreeDir, 'CLAUDE.md');
./coordinator/src/cli-server.js:701:          // Copy worker CLAUDE.md
./coordinator/src/cli-server.js:704:            fs.copyFileSync(workerClaude, path.join(wtPath, 'CLAUDE.md'));
./templates/commands/allocate-loop.md:29:Use native teammate delegation only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set.
./templates/commands/architect-loop.md:29:Use native teammate delegation only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set.
./.claude/knowledge/patterns.md:8:- Sentinel needs `unset CLAUDECODE` before launching claude in tmux
./.claude/knowledge/mistakes.md:8:- **Issue**: Worker sentinels launch `claude` inside tmux, but `CLAUDECODE` env var from parent causes "nested session" rejection
./.claude/knowledge/mistakes.md:9:- **Fix**: Added `unset CLAUDECODE` before launching claude in BOTH `scripts/worker-sentinel.sh` AND `.claude/scripts/worker-sentinel.sh`
```

## 4) Claude Path / Config / Prompt References

```text
./setup.sh:113:CLAUDE_DIR="$PROJECT_DIR/.claude"
./setup.sh:114:mkdir -p "$CLAUDE_DIR/commands"
./setup.sh:115:mkdir -p "$CLAUDE_DIR/state"
./setup.sh:116:mkdir -p "$CLAUDE_DIR/knowledge/domain"
./setup.sh:117:mkdir -p "$CLAUDE_DIR/scripts"
./setup.sh:125:  dest="$CLAUDE_DIR/commands/$(basename "$f")"
./setup.sh:130:mkdir -p "$CLAUDE_DIR/agents"
./setup.sh:132:  dest="$CLAUDE_DIR/agents/$(basename "$f")"
./setup.sh:138:  dest="$CLAUDE_DIR/knowledge/$(basename "$f")"
./setup.sh:143:mkdir -p "$CLAUDE_DIR/docs"
./setup.sh:144:cp "$SCRIPT_DIR/templates/docs/"*.md "$CLAUDE_DIR/docs/"
./setup.sh:146:# CLAUDE.md for architect (root) — only if not already present
./setup.sh:147:if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
./setup.sh:148:  cp "$SCRIPT_DIR/templates/root-claude.md" "$PROJECT_DIR/CLAUDE.md"
./setup.sh:150:  echo "  CLAUDE.md already exists, keeping existing."
./setup.sh:153:# Worker CLAUDE.md template
./setup.sh:154:cp "$SCRIPT_DIR/templates/worker-claude.md" "$CLAUDE_DIR/worker-claude.md"
./setup.sh:157:cp "$SCRIPT_DIR/scripts/worker-sentinel.sh" "$CLAUDE_DIR/scripts/"
./setup.sh:158:chmod +x "$CLAUDE_DIR/scripts/worker-sentinel.sh"
./setup.sh:161:mkdir -p "$CLAUDE_DIR/hooks"
./setup.sh:162:cp "$SCRIPT_DIR/.claude/hooks/pre-tool-secret-guard.sh" "$CLAUDE_DIR/hooks/" 2>/dev/null || true
./setup.sh:163:chmod +x "$CLAUDE_DIR/hooks/"*.sh 2>/dev/null || true
./setup.sh:166:SETTINGS_FILE="$CLAUDE_DIR/settings.json"
./setup.sh:181:cat > "$CLAUDE_DIR/scripts/mac10" << 'WRAPPER'
./setup.sh:193:sed -i "s|PLACEHOLDER_MAC10_BIN|$MAC10_BIN|" "$CLAUDE_DIR/scripts/mac10"
./setup.sh:194:chmod +x "$CLAUDE_DIR/scripts/mac10"
./setup.sh:197:export PATH="$CLAUDE_DIR/scripts:$SCRIPT_DIR/coordinator/bin:$PATH"
./setup.sh:227:  # Copy CLAUDE.md for worker
./setup.sh:228:  cp "$CLAUDE_DIR/worker-claude.md" "$WT_PATH/CLAUDE.md"
./setup.sh:231:  mkdir -p "$WT_PATH/.claude/commands"
./setup.sh:232:  mkdir -p "$WT_PATH/.claude/knowledge/domain"
./setup.sh:233:  mkdir -p "$WT_PATH/.claude/scripts"
./setup.sh:234:  mkdir -p "$WT_PATH/.claude/agents"
./setup.sh:235:  mkdir -p "$WT_PATH/.claude/hooks"
./setup.sh:236:  cp "$CLAUDE_DIR/commands/"*.md "$WT_PATH/.claude/commands/"
./setup.sh:237:  cp "$CLAUDE_DIR/scripts/mac10" "$WT_PATH/.claude/scripts/"
./setup.sh:238:  cp "$CLAUDE_DIR/agents/"*.md "$WT_PATH/.claude/agents/"
./setup.sh:239:  cp "$CLAUDE_DIR/hooks/"*.sh "$WT_PATH/.claude/hooks/" 2>/dev/null || true
./setup.sh:240:  chmod +x "$WT_PATH/.claude/hooks/"*.sh 2>/dev/null || true
./setup.sh:243:  cp -r "$CLAUDE_DIR/knowledge/"* "$WT_PATH/.claude/knowledge/" 2>/dev/null || true
./setup.sh:246:  cp "$SETTINGS_FILE" "$WT_PATH/.claude/settings.json" 2>/dev/null || true
./setup.sh:301:SOCK_PATH_FILE="$CLAUDE_DIR/state/mac10.sock.path"
./.gitignore:2:.claude/state/
./CLAUDE.md:35:- `.claude/knowledge/codebase-insights.md` — structure and patterns
./CLAUDE.md:36:- `.claude/knowledge/user-preferences.md` — user communication preferences
./templates/worker-claude.md:29:- `.claude/knowledge/mistakes.md` — avoid repeating known errors
./templates/worker-claude.md:30:- `.claude/knowledge/patterns.md` — follow established patterns
./templates/worker-claude.md:31:- `.claude/knowledge/instruction-patches.md` — apply patches targeting "worker"
./templates/worker-claude.md:32:- `.claude/knowledge/worker-lessons.md` — lessons from fix reports
./templates/worker-claude.md:33:- `.claude/knowledge/change-summaries.md` — understand recent changes
./scripts/worker-sentinel.sh:18:export PATH="$PROJECT_DIR/.claude/scripts:$PATH"
./scripts/worker-sentinel.sh:36:  # Launch Claude worker (unset CLAUDECODE to allow nested session in tmux)
./scripts/worker-sentinel.sh:38:  unset CLAUDECODE
./.claude/worker-claude.md:29:- `.claude/knowledge/mistakes.md` — avoid repeating known errors
./.claude/worker-claude.md:30:- `.claude/knowledge/patterns.md` — follow established patterns
./.claude/worker-claude.md:31:- `.claude/knowledge/instruction-patches.md` — apply patches targeting "worker"
./.claude/worker-claude.md:32:- `.claude/knowledge/worker-lessons.md` — lessons from fix reports
./.claude/worker-claude.md:33:- `.claude/knowledge/change-summaries.md` — understand recent changes
./templates/settings.json:57:            "command": "bash -c 'bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-secret-guard.sh\"'"
./scripts/loop-sentinel.sh:15:export PATH="$PROJECT_DIR/.claude/scripts:$PATH"
./scripts/loop-sentinel.sh:65:  unset CLAUDECODE
./templates/commands/worker-loop.md:18:export PATH="$(pwd)/.claude/scripts:$PATH"
./templates/commands/worker-loop.md:24:- `.claude/knowledge/mistakes.md` — avoid repeating known errors
./templates/commands/worker-loop.md:25:- `.claude/knowledge/patterns.md` — follow established patterns
./templates/commands/worker-loop.md:26:- `.claude/knowledge/instruction-patches.md` — apply any patches targeting "worker", then note them
./templates/commands/worker-loop.md:27:- `.claude/knowledge/worker-lessons.md` — lessons from fix reports
./templates/commands/worker-loop.md:28:- `.claude/knowledge/change-summaries.md` — understand recent changes by other workers
./templates/commands/worker-loop.md:118:Append a brief summary to `.claude/knowledge/change-summaries.md`:
./templates/commands/worker-loop.md:162:1. Append any domain-specific learnings to `.claude/knowledge/domain/$DOMAIN.md`
./templates/commands/worker-loop.md:173:1. Write domain knowledge to `.claude/knowledge/domain/$DOMAIN.md`
./templates/commands/worker-loop.md:174:2. Append mistakes to `.claude/knowledge/mistakes.md`
./templates/commands/worker-loop.md:175:3. Append change summary to `.claude/knowledge/change-summaries.md`
./templates/commands/worker-loop.md:188:3. **No coordination.** Don't read/write state files. Use `mac10` CLI for everything. Exception: knowledge files in `.claude/knowledge/`.
./.claude/settings.json:83:            "command": "bash -c 'bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-secret-guard.sh\"'"
./templates/root-claude.md:32:- `.claude/knowledge/codebase-insights.md` — structure and patterns
./templates/root-claude.md:33:- `.claude/knowledge/user-preferences.md` — user communication preferences
./scripts/launch-agent.sh:24:export PATH="$DIR/.claude/scripts:$SCRIPT_DIR/../coordinator/bin:$PATH"
./scripts/launch-agent.sh:30:unset CLAUDECODE 2>/dev/null || true
./scripts/launch-agent.sh:32:export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
./templates/commands/scan-codebase.md:10:export PATH="$(pwd)/.claude/scripts:$PATH"
./templates/commands/scan-codebase.md:47:Write findings to `.claude/knowledge/codebase-insights.md` (~2000 tokens max):
./templates/commands/scan-codebase.md:86:Write a machine-readable map to `.claude/state/codebase-map.json`:
./.claude/scripts/worker-sentinel.sh:14:export PATH="$PROJECT_DIR/.claude/scripts:$PATH"
./.claude/scripts/worker-sentinel.sh:37:    # Launch Claude worker (unset CLAUDECODE to allow nested session in tmux)
./.claude/scripts/worker-sentinel.sh:39:    unset CLAUDECODE
./templates/commands/scan-codebase-allocator.md:10:export PATH="$(pwd)/.claude/scripts:$PATH"
./templates/commands/scan-codebase-allocator.md:21:   - `.claude/knowledge/codebase-insights.md`
./templates/commands/scan-codebase-allocator.md:22:   - `.claude/knowledge/patterns.md`
./templates/commands/scan-codebase-allocator.md:23:   - `.claude/knowledge/allocation-learnings.md`
./templates/commands/scan-codebase-allocator.md:24:   - `.claude/knowledge/domain/` (all files)
./templates/commands/scan-codebase-allocator.md:27:   - Read `.claude/state/codebase-map.json` if it exists
./.claude/docs/master-3-role.md:34:4. `bash .claude/scripts/launch-worker.sh <worker_id>` — spawn the worker
./.claude/docs/master-3-role.md:75:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-3] [ACTION] details" >> .claude/logs/activity.log
./templates/commands/architect-loop.md:9:cat .claude/docs/master-2-role.md
./templates/commands/architect-loop.md:10:cat .claude/knowledge/codebase-insights.md
./templates/commands/architect-loop.md:11:cat .claude/knowledge/patterns.md
./templates/commands/architect-loop.md:12:cat .claude/knowledge/instruction-patches.md
./templates/commands/architect-loop.md:29:Use native teammate delegation only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set.
./templates/commands/architect-loop.md:44:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-2] [TEAM_BURST] id=[request_id] purpose=\"[reason]\" teammates=[N]" >> .claude/logs/activity.log
./templates/commands/architect-loop.md:69:bash .claude/scripts/signal-wait.sh .claude/signals/.handoff-signal 15
./templates/commands/architect-loop.md:106:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-2] [TIER_CLASSIFY] id=[request_id] tier=[1|2|3] reason=\"[brief reasoning]\"" >> .claude/logs/activity.log
./templates/commands/architect-loop.md:129:   bash .claude/scripts/state-lock.sh .claude/state/handoff.json 'cat > .claude/state/handoff.json << DONE
./templates/commands/architect-loop.md:141:   echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-2] [TIER1_EXECUTE] id=[request_id] file=[files] pr=[PR URL]" >> .claude/logs/activity.log
./templates/commands/architect-loop.md:180:   bash .claude/scripts/launch-worker.sh <worker_id>
./templates/commands/architect-loop.md:185:   echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-2] [TIER2_ASSIGN] id=[request_id] worker=worker-N task=\"[subject]\"" >> .claude/logs/activity.log
./templates/commands/architect-loop.md:199:   bash .claude/scripts/state-lock.sh .claude/state/task-queue.json 'cat > .claude/state/task-queue.json << TASKS
./templates/commands/architect-loop.md:219:   touch .claude/signals/.task-signal
./templates/commands/architect-loop.md:223:   echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-2] [DECOMPOSE_DONE] id=[request_id] tasks=[N] domains=[list]" >> .claude/logs/activity.log
./templates/commands/architect-loop.md:256:last_scan=$(jq -r '.scanned_at // "1970-01-01"' .claude/state/codebase-map.json 2>/dev/null)
./templates/commands/architect-loop.md:268:bash .claude/scripts/signal-wait.sh .claude/signals/.handoff-signal 15
./templates/commands/architect-loop.md:281:   cat .claude/state/agent-health.json
./templates/commands/master-loop.md:9:cat .claude/docs/master-1-role.md
./templates/commands/master-loop.md:10:cat .claude/knowledge/user-preferences.md
./templates/commands/master-loop.md:54:touch .claude/signals/.handoff-signal
./templates/commands/master-loop.md:59:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-1] [REQUEST] \"[description]\"" >> .claude/logs/activity.log
./templates/commands/master-loop.md:79:touch .claude/signals/.fix-signal
./templates/commands/master-loop.md:84:bash .claude/scripts/state-lock.sh .claude/knowledge/mistakes.md 'cat >> .claude/knowledge/mistakes.md << LESSON
./templates/commands/master-loop.md:96:bash .claude/scripts/state-lock.sh .claude/state/worker-lessons.md 'cat >> .claude/state/worker-lessons.md << WLESSON
./templates/commands/master-loop.md:141:bash .claude/scripts/signal-wait.sh .claude/signals/.handoff-signal 20
./templates/commands/master-loop.md:150:bash .claude/scripts/state-lock.sh .claude/knowledge/user-preferences.md 'cat > .claude/knowledge/user-preferences.md << PREFS
./templates/commands/master-loop.md:168:Log: `echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-1] [DISTILL] user preferences updated" >> .claude/logs/activity.log`
./.claude/docs/master-1-role.md:33:On startup, read `.claude/knowledge/user-preferences.md` to maintain continuity across resets. This file captures how the user likes to communicate, their priorities, and a brief session history.
./.claude/docs/master-1-role.md:36:Before resetting (`/clear`), write to `.claude/knowledge/user-preferences.md`:
./.claude/docs/master-1-role.md:44:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-1] [ACTION] details" >> .claude/logs/activity.log
./coordinator/src/index.js:61:    // Write task overlay to worker's CLAUDE.md
./.claude/docs/master-2-role.md:75:6. Launch worker terminal: `bash .claude/scripts/launch-worker.sh <worker_id>`
./.claude/docs/master-2-role.md:101:- Workers keep making the same category of mistake → stage patch for worker-claude.md
./.claude/docs/master-2-role.md:133:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-2] [ACTION] details" >> .claude/logs/activity.log
./coordinator/src/overlay.js:7: * Generate per-task CLAUDE.md overlay for a worker.
./coordinator/src/overlay.js:9: *   1. Base CLAUDE.md — always present, defines worker role + tools
./coordinator/src/overlay.js:13:  const workerClaudeMd = path.join(projectDir, '.claude', 'worker-claude.md');
./coordinator/src/overlay.js:119:  const overlayPath = path.join(worktreeDir, 'CLAUDE.md');
./.claude/commands/worker-loop.md:18:export PATH="$(pwd)/.claude/scripts:$PATH"
./.claude/commands/worker-loop.md:24:- `.claude/knowledge/mistakes.md` — avoid repeating known errors
./.claude/commands/worker-loop.md:25:- `.claude/knowledge/patterns.md` — follow established patterns
./.claude/commands/worker-loop.md:26:- `.claude/knowledge/instruction-patches.md` — apply any patches targeting "worker", then note them
./.claude/commands/worker-loop.md:27:- `.claude/knowledge/worker-lessons.md` — lessons from fix reports
./.claude/commands/worker-loop.md:28:- `.claude/knowledge/change-summaries.md` — understand recent changes by other workers
./.claude/commands/worker-loop.md:118:Append a brief summary to `.claude/knowledge/change-summaries.md`:
./.claude/commands/worker-loop.md:162:1. Append any domain-specific learnings to `.claude/knowledge/domain/$DOMAIN.md`
./.claude/commands/worker-loop.md:173:1. Write domain knowledge to `.claude/knowledge/domain/$DOMAIN.md`
./.claude/commands/worker-loop.md:174:2. Append mistakes to `.claude/knowledge/mistakes.md`
./.claude/commands/worker-loop.md:175:3. Append change summary to `.claude/knowledge/change-summaries.md`
./.claude/commands/worker-loop.md:188:3. **No coordination.** Don't read/write state files. Use `mac10` CLI for everything. Exception: knowledge files in `.claude/knowledge/`.
./templates/commands/allocate-loop.md:9:cat .claude/docs/master-3-role.md
./templates/commands/allocate-loop.md:10:cat .claude/knowledge/allocation-learnings.md
./templates/commands/allocate-loop.md:11:cat .claude/knowledge/codebase-insights.md
./templates/commands/allocate-loop.md:12:cat .claude/knowledge/instruction-patches.md
./templates/commands/allocate-loop.md:29:Use native teammate delegation only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set.
./templates/commands/allocate-loop.md:44:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-3] [TEAM_BURST] id=[request_id] purpose=\"[reason]\" teammates=[N]" >> .claude/logs/activity.log
./templates/commands/allocate-loop.md:64:bash .claude/scripts/state-lock.sh .claude/state/agent-health.json 'jq ".\"master-3\".status = \"active\" | .\"master-3\".started_at = \"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'\" | .\"master-3\".context_budget = 0" .claude/state/agent-health.json > /tmp/ah.json && mv /tmp/ah.json .claude/state/agent-health.json'
./templates/commands/allocate-loop.md:77:bash .claude/scripts/signal-wait.sh .claude/signals/.task-signal 10 &
./templates/commands/allocate-loop.md:78:bash .claude/scripts/signal-wait.sh .claude/signals/.fix-signal 10 &
./templates/commands/allocate-loop.md:79:bash .claude/scripts/signal-wait.sh .claude/signals/.completion-signal 10 &
./templates/commands/allocate-loop.md:106:   bash .claude/scripts/launch-worker.sh <worker_id>
./templates/commands/allocate-loop.md:110:   touch .claude/signals/.worker-signal
./templates/commands/allocate-loop.md:158:6. Touch `.claude/signals/.handoff-signal` (so Master-2 can track)
./templates/commands/allocate-loop.md:173:started_at_ts=$(jq -r '.["master-3"].started_at // empty' .claude/state/agent-health.json 2>/dev/null)
./templates/commands/allocate-loop.md:189:bash .claude/scripts/state-lock.sh .claude/knowledge/allocation-learnings.md 'cat > .claude/knowledge/allocation-learnings.md << LEARN
./templates/commands/allocate-loop.md:209:cat .claude/state/agent-health.json
./.claude/commands/scan-codebase.md:10:export PATH="$(pwd)/.claude/scripts:$PATH"
./.claude/commands/scan-codebase.md:47:Write findings to `.claude/knowledge/codebase-insights.md` (~2000 tokens max):
./.claude/commands/scan-codebase.md:86:Write a machine-readable map to `.claude/state/codebase-map.json`:
./coordinator/src/cli-server.js:701:          // Copy worker CLAUDE.md
./coordinator/src/cli-server.js:702:          const workerClaude = path.join(srcClaude, 'worker-claude.md');
./coordinator/src/cli-server.js:704:            fs.copyFileSync(workerClaude, path.join(wtPath, 'CLAUDE.md'));
./.claude/commands/scan-codebase-allocator.md:10:export PATH="$(pwd)/.claude/scripts:$PATH"
./.claude/commands/scan-codebase-allocator.md:21:   - `.claude/knowledge/codebase-insights.md`
./.claude/commands/scan-codebase-allocator.md:22:   - `.claude/knowledge/patterns.md`
./.claude/commands/scan-codebase-allocator.md:23:   - `.claude/knowledge/allocation-learnings.md`
./.claude/commands/scan-codebase-allocator.md:24:   - `.claude/knowledge/domain/` (all files)
./.claude/commands/scan-codebase-allocator.md:27:   - Read `.claude/state/codebase-map.json` if it exists
./.claude/knowledge/codebase-insights.md:20:- `.claude/commands/` — Agent loop templates (architect, worker, allocator, master, scan)
./.claude/knowledge/codebase-insights.md:21:- `.claude/agents/` — Specialized agents (code-architect, build-validator, verify-app)
./.claude/knowledge/codebase-insights.md:22:- `.claude/knowledge/` — Shared knowledge base (synced to worktrees before tasks)
./.claude/knowledge/codebase-insights.md:30:- **infra**: scripts/, setup.sh (416L), .claude/scripts/
./.claude/knowledge/codebase-insights.md:31:- **agent-config**: .claude/commands/, .claude/agents/, templates/
./.claude/knowledge/patterns.md:8:- Sentinel needs `unset CLAUDECODE` before launching claude in tmux
./.claude/commands/master-loop.md:27:export PATH="$(pwd)/.claude/scripts:$PATH"
./.claude/commands/master-loop.md:31:- `.claude/knowledge/codebase-insights.md`
./.claude/commands/master-loop.md:32:- `.claude/knowledge/patterns.md`
./.claude/commands/master-loop.md:33:- `.claude/knowledge/user-preferences.md`
./.claude/commands/master-loop.md:95:   - Append a brief lesson to `.claude/knowledge/mistakes.md`:
./.claude/commands/master-loop.md:101:   - Append to `.claude/knowledge/worker-lessons.md`:
./.claude/commands/master-loop.md:131:1. **Distill user preferences**: Write communication style, domain priorities, approval preferences, and a brief session summary to `.claude/knowledge/user-preferences.md`. Keep it under ~500 tokens.
./.claude/knowledge/allocation-learnings.md:42:- **Coordinator restart (Node version mismatch)**: Coordinator uses `better-sqlite3` compiled for Node v22. System Node is v24. If coordinator crashes: use `nvm use 22` and restart via tmux or background process. Update `coordinator/.claude/state/mac10.sock.path` to new socket.
./.claude/knowledge/mistakes.md:8:- **Issue**: Worker sentinels launch `claude` inside tmux, but `CLAUDECODE` env var from parent causes "nested session" rejection
./.claude/knowledge/mistakes.md:9:- **Fix**: Added `unset CLAUDECODE` before launching claude in BOTH `scripts/worker-sentinel.sh` AND `.claude/scripts/worker-sentinel.sh`
./.claude/knowledge/mistakes.md:10:- **Note**: There are two copies of the sentinel script — the coordinator uses `.claude/scripts/` version
./.claude/commands/architect-loop.md:37:export PATH="$(pwd)/.claude/scripts:$PATH"
./.claude/commands/architect-loop.md:41:- `.claude/knowledge/codebase-insights.md`
./.claude/commands/architect-loop.md:42:- `.claude/knowledge/patterns.md`
./.claude/commands/architect-loop.md:43:- `.claude/knowledge/mistakes.md`
./.claude/commands/architect-loop.md:44:- `.claude/knowledge/instruction-patches.md` — apply any patches targeting "architect", then clear applied entries
./.claude/commands/architect-loop.md:47:- `.claude/state/codebase-map.json` — machine-readable domain map, coupling hotspots, launch commands
./.claude/commands/architect-loop.md:90:- Append the failure pattern to `.claude/knowledge/mistakes.md` if it reveals a decomposition issue.
./.claude/commands/architect-loop.md:168:Write a patch to `.claude/knowledge/instruction-patches.md`:
./.claude/commands/architect-loop.md:178:Domain knowledge files (`.claude/knowledge/domain/*.md`) can be updated directly without the 3-observation threshold.
./.claude/commands/architect-loop.md:220:3. **Write insights**: Update `.claude/knowledge/codebase-insights.md` with any new discoveries
./.claude/commands/architect-loop.md:221:4. **Write patterns**: Update `.claude/knowledge/patterns.md` with decomposition lessons
./.claude/commands/architect-loop.md:242:1. **No direct file manipulation for state.** Use `mac10` CLI only. Exception: knowledge files in `.claude/knowledge/` are yours to curate.
./.claude/commands/allocate-loop.md:38:export PATH="$(pwd)/.claude/scripts:$PATH"
./.claude/commands/allocate-loop.md:42:- `.claude/knowledge/codebase-insights.md`
./.claude/commands/allocate-loop.md:43:- `.claude/knowledge/patterns.md`
./.claude/commands/allocate-loop.md:44:- `.claude/knowledge/allocation-learnings.md`
./.claude/commands/allocate-loop.md:45:- `.claude/knowledge/domain/` (all files)
./.claude/commands/allocate-loop.md:180:2. **Distill allocation learnings**: Write patterns to `.claude/knowledge/allocation-learnings.md`:
./.claude/commands/allocate-loop.md:190:2. **Always use `mac10` CLI** for all coordination. No direct file reads for state. Exception: knowledge files in `.claude/knowledge/`.
./.claude/commands/loop-agent.md:29:4. Write findings to `.claude/knowledge/loop-findings.md` (create if doesn't exist, append/update if it does).
./.claude/commands/loop-agent.md:38:   - `.claude/knowledge/codebase-insights.md` — structure and patterns
./.claude/commands/loop-agent.md:39:   - `.claude/knowledge/loop-findings.md` — accumulated intelligence from previous iterations (if exists)
./.claude/commands/loop-agent.md:84:2. Update `.claude/knowledge/loop-findings.md` with any new findings from this iteration
./.claude/commands/loop-agent.md:115:`.claude/knowledge/loop-findings.md` is shared across all loops. Structure it as:
./templates/docs/master-3-role.md:29:Watch: `.claude/signals/.task-signal`, `.claude/signals/.fix-signal`, `.claude/signals/.completion-signal`
./templates/docs/master-3-role.md:30:After assignment: launch idle workers with `bash .claude/scripts/launch-worker.sh <worker_id>`; signal already-running workers with `touch .claude/signals/.worker-signal`
./templates/docs/master-3-role.md:36:4. `bash .claude/scripts/launch-worker.sh <worker_id>` — spawn the worker
./templates/docs/master-3-role.md:77:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-3] [ACTION] details" >> .claude/logs/activity.log
./templates/docs/master-1-role.md:30:After submitting a request via `mac10 request`: `touch .claude/signals/.handoff-signal`
./templates/docs/master-1-role.md:31:After submitting a fix via `mac10 fix`: `touch .claude/signals/.fix-signal`
./templates/docs/master-1-role.md:34:On startup, read `.claude/knowledge/user-preferences.md` to maintain continuity across resets. This file captures how the user likes to communicate, their priorities, and a brief session history.
./templates/docs/master-1-role.md:37:Before resetting (`/clear`), write to `.claude/knowledge/user-preferences.md`:
./templates/docs/master-1-role.md:45:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-1] [ACTION] details" >> .claude/logs/activity.log
./templates/docs/master-2-role.md:72:6. Launch worker terminal: `bash .claude/scripts/launch-worker.sh <worker_id>`
./templates/docs/master-2-role.md:76:Watch: `.claude/signals/.handoff-signal` (new requests)
./templates/docs/master-2-role.md:77:Touch after Tier 3 decomposition: `.claude/signals/.task-signal`
./templates/docs/master-2-role.md:102:- Workers keep making the same category of mistake → stage patch for worker-claude.md
./templates/docs/master-2-role.md:134:echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [master-2] [ACTION] details" >> .claude/logs/activity.log
```

## 5) Model / Vendor References (opus|sonnet|haiku|anthropic)

```text
./setup.sh:366:    wt.exe -w 0 new-tab --title "Master-1 (Interface)" bash.exe -l "$WIN_LAUNCH_SCRIPT" "$PROJECT_DIR" sonnet /master-loop &
./setup.sh:367:    echo "  Master-1 (Interface/Sonnet) terminal opened."
./setup.sh:369:    wt.exe -w 0 new-tab --title "Master-2 (Architect)" bash.exe -l "$WIN_LAUNCH_SCRIPT" "$PROJECT_DIR" opus /architect-loop &
./setup.sh:370:    echo "  Master-2 (Architect/Opus) terminal opened."
./setup.sh:372:    wt.exe -w 0 new-tab --title "Master-3 (Allocator)" bash.exe -l "$WIN_LAUNCH_SCRIPT" "$PROJECT_DIR" sonnet /allocate-loop &
./setup.sh:373:    echo "  Master-3 (Allocator/Sonnet) terminal opened."
./setup.sh:376:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /master-loop"
./setup.sh:377:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model opus /architect-loop"
./setup.sh:378:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /allocate-loop"
./setup.sh:384:    "$WT_EXE" -w 0 new-tab --title "Master-1 (Interface)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$LAUNCH_SCRIPT" "$PROJECT_DIR" sonnet /master-loop &
./setup.sh:385:    echo "  Master-1 (Interface/Sonnet) terminal opened."
./setup.sh:387:    "$WT_EXE" -w 0 new-tab --title "Master-2 (Architect)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$LAUNCH_SCRIPT" "$PROJECT_DIR" opus /architect-loop &
./setup.sh:388:    echo "  Master-2 (Architect/Opus) terminal opened."
./setup.sh:390:    "$WT_EXE" -w 0 new-tab --title "Master-3 (Allocator)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$LAUNCH_SCRIPT" "$PROJECT_DIR" sonnet /allocate-loop &
./setup.sh:391:    echo "  Master-3 (Allocator/Sonnet) terminal opened."
./setup.sh:394:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /master-loop"
./setup.sh:395:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model opus /architect-loop"
./setup.sh:396:    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /allocate-loop"
./setup.sh:401:  echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /master-loop"
./setup.sh:402:  echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model opus /architect-loop"
./setup.sh:403:  echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model sonnet /allocate-loop"
./setup.sh:412:echo "  Master-1 (Interface/Sonnet)  — user's contact point"
./setup.sh:413:echo "  Master-2 (Architect/Opus)    — triage & decomposition"
./setup.sh:414:echo "  Master-3 (Allocator/Sonnet)  — task-worker matching"
./README.md:8:User ──mac10 CLI──→ Coordinator (Node.js) ──tmux──→ Workers (Opus)
./README.md:12:                    Architect (Opus) ←──mac10 CLI──────→|
./README.md:16:- **Architect**: Single Opus agent. Triages requests into Tier 1/2/3, decomposes complex work into tasks.
./README.md:17:- **Workers 1-8**: Opus agents in git worktrees. Receive tasks, code, create PRs.
./README.md:30:claude --model opus /architect-loop
./scripts/worker-sentinel.sh:39:  claude --model opus --dangerously-skip-permissions -p "/worker-loop" 2>&1 || true
./scripts/loop-sentinel.sh:66:  claude --model opus --dangerously-skip-permissions -p "/loop-agent" 2>&1 || true
./coordinator/src/web-server.js:383:    launchAgent('Master-2 (Architect)', 'architect', 'opus', '/architect-loop', 'architect_launched', res);
./coordinator/src/web-server.js:389:    launchAgent('Master-1 (Interface)', 'master-1', 'sonnet', '/master-loop', 'master1_launched', res);
./coordinator/src/web-server.js:395:    launchAgent('Master-3 (Allocator)', 'master-3', 'sonnet', '/allocate-loop', 'master3_launched', res);
./templates/docs/master-3-role.md:4:You are the operations manager running on **Sonnet** for speed. You have direct codebase knowledge AND manage all worker assignments, lifecycle, heartbeats, and integration. You handle Tier 3 tasks from Master-2 (Tier 1/2 bypass you).
./gui/public/index.html:72:          <div class="master-title">Master-1 <span class="master-model">Sonnet</span></div>
./gui/public/index.html:78:          <div class="master-title">Master-2 <span class="master-model">Opus</span></div>
./gui/public/index.html:84:          <div class="master-title">Master-3 <span class="master-model">Sonnet</span></div>
./coordinator/src/watchdog.js:12:// Defaults are generous — Claude Opus tasks take 3-10 minutes legitimately.
./templates/docs/master-2-role.md:4:You are the codebase expert running on **Opus**. You hold deep knowledge of the entire codebase from your initial scan. You have THREE responsibilities:
./.claude/docs/master-3-role.md:4:You are the operations manager running on **Sonnet** for speed. You have direct codebase knowledge AND manage all worker assignments, lifecycle, heartbeats, and integration. You handle Tier 3 tasks from Master-2 (Tier 1/2 bypass you).
./.claude/scripts/worker-sentinel.sh:40:    claude --model opus --dangerously-skip-permissions -p "/worker-loop" 2>&1 || true
./.claude/agents/verify-app.md:3:model: sonnet
./templates/docs/master-1-role.md:4:You are the user's ONLY point of contact. You run on **Sonnet** for speed. You never read code, never investigate implementations, never decompose tasks. Your context stays clean because every token should serve user communication.
./.claude/agents/build-validator.md:3:model: haiku
./.claude/docs/master-2-role.md:4:You are the codebase expert running on **Opus**. You hold deep knowledge of the entire codebase from your initial scan. You have THREE responsibilities:
./.claude/agents/code-architect.md:3:model: sonnet
./.claude/docs/master-1-role.md:4:You are the user's ONLY point of contact. You run on **Sonnet** for speed. You never read code, never investigate implementations, never decompose tasks. Your context stays clean because every token should serve user communication.
./.claude/docs/architect-role.md:103:| 2 | build-validator subagent (Haiku) |
./.claude/docs/architect-role.md:104:| 3 | build-validator (Haiku) + verify-app (Sonnet) |
./templates/docs/architect-role.md:103:| 2 | build-validator subagent (Haiku) |
./templates/docs/architect-role.md:104:| 3 | build-validator (Haiku) + verify-app (Sonnet) |
./templates/agents/verify-app.md:3:model: sonnet
./templates/commands/master-loop.md:5:You are **Master-1: Interface** running on **Sonnet**.
./templates/commands/master-loop.md:20:████  I AM MASTER-1 — YOUR INTERFACE (Sonnet)  ████
./templates/agents/build-validator.md:3:model: haiku
./templates/agents/code-architect.md:3:model: sonnet
./templates/commands/architect-loop.md:5:You are **Master-2: Architect** running on **Opus**.
./templates/commands/architect-loop.md:50:████  I AM MASTER-2 — ARCHITECT (Opus)  ████
./templates/commands/allocate-loop.md:5:You are **Master-3: Allocator** running on **Sonnet**.
./templates/commands/allocate-loop.md:50:████  I AM MASTER-3 — ALLOCATOR (Sonnet)  ████
./.claude/knowledge/mistakes.md:23:- **Fix**: Added `-p` (print mode) flag: `claude --model opus --dangerously-skip-permissions -p "/worker-loop"` — exits after processing
```
