---
kind: research_note
scope: project
id: R-ed0df8
title: "std-test-iter2 — ChatGPT standard research"
created: 2026-03-18
updated: 2026-03-18
topics:
  - std-test-iter2
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
What is 2+2? Answer in one word.

# Findings
four

1) Concrete, actionable answer (with specifics)

Even though the question is trivial, in a Node.js/Electron multi-agent system, the key is how deterministic computations are handled across agents.

Recommended baseline

Node.js version: ≥ 20.x (LTS)

Electron version: ≥ 30.x (for modern Chromium + Node integration)

Use pure JS arithmetic for deterministic ops:

JavaScript
const result = 2 + 2; // 4
If computation is agent-executed (important)

Ensure:

No LLM involvement for deterministic math

Route to a deterministic execution tool

Example tool registry:

JavaScript
// tools/math.js
export function add(a, b) {
  return a + b;
}

Agent usage:

JavaScript
import { add } from './tools/math.js';

const result = add(2, 2); // always 4
2) Implementation patterns (multi-agent systems)
Pattern: Deterministic Tool Offloading

Never let agents "think" about trivial math.

Router pattern:

JavaScript
function routeTask(task) {
  if (task.type === 'math') {
    return 'math-worker';
  }
  return 'llm-worker';
}

Worker:

JavaScript
// math-worker.js
process.on('message', (task) => {
  if (task.op === 'add') {
    process.send({ result: task.a + task.b });
  }
});
Pattern: Capability-based agents

Define strict capabilities:

JSON
{
  "agent": "math-agent",
  "capabilities": ["addition", "subtraction"]
}

Prevents:

hallucinated math

inconsistent outputs

Pattern: Idempotent task execution
JavaScript
const cache = new Map();

function compute(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const result = fn();
  cache.set(key, result);
  return result;
}

compute("2+2", () => 2 + 2); // always 4
3) Known pitfalls / gotchas
❌ Letting LLMs compute basic math

LLMs are not guaranteed deterministic

Can produce "4.", "four", "The answer is 4"

Fix: Always use code execution for math

❌ Serialization inconsistencies

Across agents:

JSON
"4" vs 4 vs "four"

Fix: enforce schema

TypeScript
type MathResult = {
  value: number;
};
❌ Floating point surprises (not here, but relevant)
JavaScript
0.1 + 0.2 !== 0.3

Fix (when needed):

Use decimal.js or big.js

❌ Overengineering trivial tasks

Avoid:

spawning workers

IPC overhead
for simple operations

Rule:

Inline for trivial

delegate for complex or untrusted compute

❌ Prompt leakage into deterministic layers

If your system mixes:

LLM reasoning

tool execution

You may accidentally:

"2+2 = four because..."

Fix: strict tool boundaries

LLM → intent

Tool → execution

4) Authoritative docs / references
Node.js

https://nodejs.org/api/

https://nodejs.org/api/worker_threads.html

Electron

https://www.electronjs.org/docs/latest

Deterministic math libs

https://github.com/MikeMcl/decimal.js/

https://github.com/MikeMcl/big.js/

Multi-agent / tool execution patterns

OpenAI function/tool calling concepts

LangChain tools: https://js.langchain.com/docs/modules/tools/

Key takeaway for your system

Even a trivial question like 2+2 exposes a core architectural rule:

Never let probabilistic agents handle deterministic tasks.

Instead:

Route → tool

Execute → code

Return → structured result

This principle scales directly to:

code execution

diff validation

merge checks

test assertions

If you want, I can map this into your repo’s coordinator/worker architecture and show exactly where to enforce this boundary.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/std-test-iter2/_rollup.md
