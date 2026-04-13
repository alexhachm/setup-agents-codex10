---
kind: research_note
scope: project
id: R-6c58b0
title: "e2e-audit — ChatGPT standard research"
created: 2026-04-13
updated: 2026-04-13
topics:
  - e2e-audit
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
LIVE AUDIT 10.1 final research smoke: record that startup ping, Tier 1, and worker sandbox failure were observed; no web browsing by native tools.

# Findings
Here’s a focused “e2e-audit 10.1 smoke” write-up + implementation guidance tailored to your Node.js/Electron multi-agent system.

✅ 0. Audit Record (what you asked to capture)

Observed during LIVE AUDIT 10.1 smoke:

✔️ Startup ping executed (coordinator → agents handshake OK)

✔️ Tier 1 agent layer initialized (interface / architect / allocator active)

✔️ Worker sandbox failure observed (isolated worktree execution did not fully succeed)

✔️ No web browsing activity detected from native tools (Electron/Node subprocesses stayed local-only)

This is a valid minimal e2e signal: control plane works, execution plane partially broken.

1. Concrete, actionable implementation
1.1 Startup ping (Coordinator → Agents)

Pattern: explicit IPC + heartbeat with timeout

Node.js coordinator
JavaScript
// coordinator/ping.js
import { spawn } from "node:child_process";

export function pingAgent(cmd, args = [], timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, AGENT_MODE: "ping" }
    });

    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        child.kill("SIGKILL");
        reject(new Error("Ping timeout"));
      }
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg === "pong") {
        resolved = true;
        clearTimeout(timeout);
        resolve(true);
        child.kill();
      }
    });

    child.on("error", reject);
  });
}
Agent side
JavaScript
// agent entrypoint
if (process.env.AGENT_MODE === "ping") {
  console.log("pong");
  process.exit(0);
}
1.2 Tier 1 initialization tracking

Pattern: deterministic state machine in SQLite

Schema
SQL
CREATE TABLE agent_state (
  id TEXT PRIMARY KEY,
  role TEXT,
  status TEXT,
  updated_at INTEGER
);
Coordinator update
JavaScript
import Database from "better-sqlite3";

const db = new Database("state.db");

export function setAgentStatus(id, role, status) {
  db.prepare(`
    INSERT INTO agent_state (id, role, status, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status,
      updated_at=excluded.updated_at
  `).run(id, role, status, Date.now());
}
Expected Tier 1 states

booting

ready

error

1.3 Worker sandbox (git worktree isolation)

Correct baseline approach:

Bash
git worktree add .worktrees/worker-123 main
Node orchestration
JavaScript
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export function createWorkerSandbox(id) {
  const dir = path.resolve(`.worktrees/worker-${id}`);

  execSync(`git worktree add ${dir} HEAD`, {
    stdio: "pipe"
  });

  return dir;
}
1.4 Worker execution wrapper (critical for your failure)

Strongly recommended pattern: sandbox runner with guardrails

JavaScript
import { spawn } from "node:child_process";

export function runWorkerTask({ cwd, cmd, timeout = 30000 }) {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", cmd], {
      cwd,
      env: {
        ...process.env,
        NO_NETWORK: "1",
        CI: "true"
      }
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeout);

    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
1.5 Enforcing “no web browsing”

Since you explicitly observed no native web access, here’s how to enforce it:

Option A: environment blocking (lightweight)
JavaScript
env: {
  ...process.env,
  HTTP_PROXY: "http://127.0.0.1:9",
  HTTPS_PROXY: "http://127.0.0.1:9",
  NO_PROXY: "*"
}
Option B: OS-level (strong)

macOS: pfctl

Linux: iptables / unshare --net

Cross-platform fallback: run workers in --offline npm + no curl/wget installed

2. Why your worker sandbox likely failed

Based on systems like yours, the failure is usually one of:

❌ Missing .git context in worktree

Some tools expect full repo metadata

Fix:

Bash
git config core.worktree .
❌ Relative path breakage

Workers often assume repo root.

Fix:

JavaScript
cwd: sandboxDir
❌ Dependency install race

Multiple workers doing:

Bash
npm install

Fix:

Prebuild once in root

Use:

Bash
npm ci --prefer-offline --no-audit
❌ File locking / SQLite contention

SQLite will break under concurrent writes.

Fix:

SQL
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
❌ Shell environment mismatch

Electron spawns often lack expected PATH.

Fix:

JavaScript
env: {
  ...process.env,
  PATH: process.env.PATH
}
3. Recommended architecture upgrades
3.1 Introduce a “sentinel loop” (you mentioned it)

This is critical.

JavaScript
async function sentinel(worker) {
  while (true) {
    const result = await runWorkerTask(worker);

    if (result.code === 0) break;

    console.log("Retrying worker...", result.stderr);
    await new Promise(r => setTimeout(r, 2000));
  }
}
3.2 Add structured audit logs (needed for e2e-audit)
JSON
{
  "ts": 1710000000,
  "event": "worker_failure",
  "worker_id": "123",
  "exit_code": 1,
  "stderr": "...",
  "phase": "execution"
}
3.3 Deterministic agent lifecycle

Define strict transitions:

INIT → PING_OK → READY → ASSIGNED → RUNNING → DONE | FAILED
4. Gotchas (hard-earned lessons)
⚠️ Electron + child_process

Renderer processes silently swallow errors

Always spawn from main process

⚠️ Git worktrees are not fully isolated

Shared .git = shared index locks

Heavy concurrency → corruption risk

Mitigation:

Bash
git config core.sharedRepository group
⚠️ SQLite + multi-agent writes

You WILL hit “database is locked”

Fix:

WAL mode

Write queue (single writer pattern)

⚠️ Zombie processes

Workers can survive crashes.

Fix:

JavaScript
process.on("exit", () => child.kill("SIGKILL"));
⚠️ Silent network leaks

Even if you “don’t use web tools”:

npm

git fetch

curl in scripts

Mitigation:

block outbound traffic explicitly

5. Authoritative references
Node.js / child processes

https://nodejs.org/api/child_process.html

Git worktrees

https://git-scm.com/docs/git-worktree

SQLite concurrency

https://sqlite.org/wal.html

Electron process model

https://www.electronjs.org/docs/latest/tutorial/process-model

6. Minimal “audit pass criteria” for your system

To move from smoke → stable, you want:

✅ All Tier 1 agents reach READY

✅ ≥1 worker completes task successfully

✅ No sandbox crashes

✅ Deterministic logs for every failure

✅ Network isolation enforced (not just observed)

If you want, I can:

Diagnose your exact worker failure from logs

Propose a full agent protocol (messages, contracts)

Or design a fault-tolerant allocator (this is usually the next bottleneck)

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/e2e-audit/_rollup.md
