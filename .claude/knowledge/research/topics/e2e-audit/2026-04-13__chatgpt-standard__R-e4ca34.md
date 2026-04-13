---
kind: research_note
scope: project
id: R-e4ca34
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
What is the current best practice for Node.js IPC socket health checks?

# Findings
Here’s the current (Node 18–22+) best practice for IPC socket health checks in multi-process systems like yours (Electron + forked agents + worktrees). I’ll keep this grounded in real Node APIs and patterns used in production systems.

1) What “health check” actually means in Node IPC

Node IPC (via child_process.fork() or sockets) does NOT provide built-in liveness detection beyond:

'disconnect' event

'exit' / 'close'

socket 'end' / 'error'

There is no native heartbeat or readiness signal. Messages are buffered and may succeed even if the receiver isn’t fully ready yet
Stack Overflow
.

👉 Therefore, best practice = application-level health protocol, not relying on Node internals.

2) Recommended pattern (2024–2026): Heartbeat + watchdog
Core idea

You implement a bi-directional heartbeat over IPC or sockets with timeouts.

Minimal production pattern
Parent (coordinator)
JavaScript
const { fork } = require('node:child_process');

function spawnWorker() {
  const child = fork('./worker.js', [], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc']
  });

  let lastHeartbeat = Date.now();

  // receive heartbeat
  child.on('message', (msg) => {
    if (msg?.type === 'heartbeat') {
      lastHeartbeat = Date.now();
    }
  });

  // watchdog loop
  const interval = setInterval(() => {
    const delta = Date.now() - lastHeartbeat;

    if (delta > 5000) {
      console.error('Worker unhealthy, restarting...');
      child.kill('SIGKILL');
      clearInterval(interval);
      spawnWorker();
    } else {
      child.send({ type: 'ping' });
    }
  }, 1000);

  child.on('exit', () => clearInterval(interval));
}

spawnWorker();
Child (worker)
JavaScript
setInterval(() => {
  process.send?.({ type: 'heartbeat', ts: Date.now() });
}, 1000);

process.on('message', (msg) => {
  if (msg?.type === 'ping') {
    process.send?.({ type: 'pong' });
  }
});
Why this is the standard

Node IPC is just a pipe (subprocess.channel)
Node.js

Pipes don’t detect half-open states reliably

OS won’t notify you if the process is alive but hung

👉 So heartbeat is the only reliable signal of:

event loop health

responsiveness

message handling

3) Socket-level health checks (Unix/TCP)

If you’re using net.createServer() or Unix sockets:

Enable keepalive (baseline)
JavaScript
socket.setKeepAlive(true, 1000);

Uses OS TCP keepalive probes

Detects dead peers (eventually)

⚠️ BUT:

Default intervals are very long (minutes) unless tuned at OS level

Not enough for agent orchestration

Application-level ping (recommended)
JavaScript
// client
setInterval(() => {
  socket.write(JSON.stringify({ type: 'ping' }) + '\n');
}, 1000);

// server
socket.on('data', (buf) => {
  const msg = JSON.parse(buf.toString());
  if (msg.type === 'ping') {
    socket.write(JSON.stringify({ type: 'pong' }) + '\n');
  }
});
Timeout detection
JavaScript
let lastSeen = Date.now();

socket.on('data', () => {
  lastSeen = Date.now();
});

setInterval(() => {
  if (Date.now() - lastSeen > 5000) {
    socket.destroy(); // force reconnect
  }
}, 1000);
4) Advanced pattern (what you actually want for multi-agent systems)

Given your architecture (allocator + workers + git worktrees), best practice is:

A. Layered health model
Layer	Check
Process	exit, disconnect
IPC channel	heartbeat ping/pong
Task-level	“still making progress?”
OS	optional keepalive
B. Structured health message

Use something richer than ping:

TypeScript
type Health = {
  type: 'health';
  ts: number;
  load: number;
  taskId?: string;
  state: 'idle' | 'busy' | 'stuck';
};

This lets your allocator:

detect deadlocks

rebalance work

kill stuck agents

C. Deadline-based watchdog (critical for agents)

Instead of just heartbeat:

JavaScript
if (Date.now() - lastProgress > TASK_TIMEOUT) {
  // kill + reassign worktree
}
5) Known pitfalls (these bite everyone)
1. IPC channel “looks alive” but isn’t

Messages can buffer even if child is stuck

No backpressure signal on .send()

👉 Always require heartbeat ACK

2. Zombie processes

Child may ignore SIGTERM

Always escalate:

JavaScript
child.kill('SIGTERM');
setTimeout(() => child.kill('SIGKILL'), 2000);
3. disconnect is not enough

Only fires when channel explicitly closes
Node.js

Won’t fire for hangs or event loop stalls

4. Socket half-open problem

TCP can stay “connected” forever

Especially bad with Unix sockets

👉 Must implement timeout yourself

5. Forked IPC starts unreferenced

IPC channel won’t keep process alive until handlers attached
Node.js

👉 Always register process.on('message') early

6. Passing sockets between processes

Parent loses lifecycle visibility
Node.js

👉 Don’t rely on parent to track socket health afterward

6) Libraries / patterns used in real systems
Lightweight

Native child_process + custom heartbeat (most common)

Heavier

@node-ipc/node-ipc (multi-transport IPC abstraction)
GitHub

Production-grade inspiration

PM2: watchdog + restart loop

Kubernetes: liveness/readiness probes (same concept)

7) Opinionated “best practice” for your system

Given your setup (multi-agent autonomous coding system):

👉 You should implement:

Mandatory

Heartbeat every 500–1000ms

Timeout at 3–5x heartbeat interval

Supervisor restart logic

Strongly recommended

Task progress heartbeat (not just alive)

Per-agent “state” reporting

Hard kill + worktree cleanup

Optional but useful

Exponential backoff restarts

Circuit breaker (don’t respawn flapping agents)

8) Authoritative docs

Node child process IPC:
https://nodejs.org/api/child_process.html

Node.js

Node process spawning & IPC:
https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options

Node.js

node-ipc library:
https://github.com/node-ipc/node-ipc

GitHub

TL;DR (practical)

For your system:

Do not rely on Node IPC for health

Implement:

heartbeat (1s)

timeout (3–5s)

restart supervisor

Track progress, not just liveness

Kill aggressively, assume workers will hang

If you want, I can map this directly onto your repo (allocator/master/worker design) and suggest a concrete health protocol + state schema tailored to your agents.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/e2e-audit/_rollup.md
