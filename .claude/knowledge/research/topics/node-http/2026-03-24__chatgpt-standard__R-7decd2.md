---
kind: research_note
scope: project
id: R-7decd2
title: "node-http — ChatGPT standard research"
created: 2026-03-24
updated: 2026-03-24
topics:
  - node-http
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
What are the differences between Node.js http.request timeout options: timeout, connectTimeout, and socket timeout? Explain each with code examples.

# Findings
This is one of those areas where Node’s naming is misleading: there is no single “timeout” concept—there are three different phases of an HTTP request lifecycle, and different knobs affect each.

Below is a precise breakdown (Node 18–22 behavior) for http.request() and related APIs.

🔥 TL;DR mental model
Phase	What can hang?	Timeout knob
DNS + TCP connect	server unreachable	connectTimeout (not native in core)
Connected but idle	no data flowing	socket timeout
Entire request lifecycle	too slow overall	request timeout (timeout)
1) timeout (ClientRequest timeout)
What it is

Set via:

JavaScript
req.setTimeout(ms, cb)

Or sometimes via libraries: { timeout: ms }

What it actually does

It sets a timeout on the underlying socket after it is assigned

Fires if no activity happens for X ms during the request

👉 Important: this is NOT a total request deadline, it’s an inactivity timeout
GitHub

Example
JavaScript
import http from 'node:http';

const req = http.request('http://example.com', (res) => {
  res.on('data', () => {});
  res.on('end', () => console.log('done'));
});

req.setTimeout(5000, () => {
  console.log('Request timed out (idle)');
  req.destroy(new Error('timeout'));
});

req.end();
Behavior

Starts after socket is connected

Resets on every data chunk

Fires if no bytes sent/received

Pitfall

❌ Does NOT protect against:

slow DNS

TCP connection never established

❌ Does NOT enforce “total request must finish in 5s”

2) socket timeout (low-level, same thing underneath)
What it is

Directly:

JavaScript
req.on('socket', (socket) => {
  socket.setTimeout(ms);
});

Also what req.setTimeout() uses internally

What it actually does

Timeout on TCP socket inactivity

Applies to:

request

response

both directions

👉 Node docs + behavior: all these APIs ultimately map to socket inactivity timeout
Stack Overflow

Example (explicit control)
JavaScript
const req = http.request(options);

req.on('socket', (socket) => {
  socket.setTimeout(3000);

  socket.on('timeout', () => {
    console.log('Socket idle timeout');
    req.destroy();
  });
});

req.end();
Behavior nuances

Timer resets on:

incoming data

outgoing data

If streaming large responses slowly → may never trigger

Pitfall (big one)

A socket timeout is NOT “time to complete the request”
It’s “time between packets”
GitHub

3) connectTimeout (NOT native in Node core)
This is where most confusion comes from.

Node’s http.request does NOT have a built-in connectTimeout option.

Instead:

TCP connect can hang indefinitely (depending on OS)

You must implement it manually

Common pattern
JavaScript
import http from 'node:http';

function requestWithConnectTimeout(options, connectTimeoutMs) {
  const req = http.request(options);

  const connectTimer = setTimeout(() => {
    req.destroy(new Error('Connect timeout'));
  }, connectTimeoutMs);

  req.on('socket', (socket) => {
    if (socket.connecting) {
      socket.once('connect', () => {
        clearTimeout(connectTimer);
      });
    } else {
      clearTimeout(connectTimer);
    }
  });

  return req;
}

// usage
const req = requestWithConnectTimeout(
  { host: '10.255.255.1', port: 80 },
  2000
);

req.on('error', console.error);
req.end();
Behavior

Covers:

DNS lookup

TCP handshake

Stops timer once connection established

Alternative (modern Node)

Using AbortController:

JavaScript
const controller = new AbortController();

setTimeout(() => controller.abort(), 2000);

const req = http.request({
  host: 'example.com',
  signal: controller.signal
});
🔍 Putting it all together (production pattern)

In real systems (like your multi-agent runner), you typically want all three layers:

JavaScript
function httpRequestWithTimeouts(options) {
  const controller = new AbortController();

  const req = http.request({
    ...options,
    signal: controller.signal,
  });

  // 1. Connect timeout
  const connectTimer = setTimeout(() => {
    controller.abort(); // kills DNS/TCP phase
  }, 2000);

  req.on('socket', (socket) => {
    socket.once('connect', () => clearTimeout(connectTimer));

    // 2. Socket inactivity timeout
    socket.setTimeout(5000);
    socket.on('timeout', () => {
      req.destroy(new Error('Socket idle timeout'));
    });
  });

  // 3. Hard overall timeout
  const totalTimer = setTimeout(() => {
    controller.abort();
  }, 10000);

  req.on('close', () => clearTimeout(totalTimer));

  return req;
}
⚠️ Gotchas (important for your system design)
1. Node core has no true “total timeout”

You must implement it yourself (AbortController)

2. timeout ≠ request deadline

It’s just inactivity

Long streaming responses won’t trigger it

3. Connect phase is unprotected by default

This is a major failure mode in distributed agents

You’ll see workers hang forever on bad IPs

4. You must destroy/abort manually

Timeout events do NOT automatically cancel the request
You must call:

JavaScript
req.destroy()

or use AbortController
Stack Overflow

5. Agent pooling interaction

With keep-alive:

socket may already be connected

→ connect timeout won’t apply

Must handle both:

JavaScript
if (socket.connecting) { ... }
🧠 Practical recommendation for your multi-agent system

Given your architecture (parallel agents + shell loops):

Use this policy:

connectTimeout: 1–3s
→ fail fast on dead endpoints

socket timeout: 5–15s
→ detect stalled responses

total timeout: 10–30s
→ enforce task-level SLA

📚 Authoritative references

Node.js timeout guide (modern overview)
Node.js timeout guide

Node.js HTTP API (official docs)
Node HTTP API docs

Discussion clarifying socket vs request timeout
GitHub issue on request vs socket timeout

✔️ Key takeaway

timeout / setTimeout → socket inactivity

socket.setTimeout → same thing (lower-level)

connectTimeout → you must build it yourself

If you want, I can map this directly onto your agent executor (allocator/worker RPC layer) and suggest a hardened request wrapper tailored for your system.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/node-http/_rollup.md
