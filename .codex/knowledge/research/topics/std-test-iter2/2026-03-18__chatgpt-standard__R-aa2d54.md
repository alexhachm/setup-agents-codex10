---
kind: research_note
scope: project
id: R-aa2d54
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
Four

1. Concrete, actionable answer (Node.js/Electron context)

Even trivial computations like 2 + 2 matter in agent systems because they expose:

Determinism vs LLM output

Tooling boundaries (LLM vs runtime execution)

Recommendation:

Always execute arithmetic in Node.js runtime, not via LLM reasoning.

Node.js (v20+) example:

JavaScript
// deterministic math execution
function compute(expression) {
  // NEVER eval untrusted input in production (see pitfalls)
  return Function(`"use strict"; return (${expression})`)();
}

console.log(compute("2+2")); // 4

Safer approach (recommended):
Use a parser instead of eval:

Bash
npm install mathjs@11
JavaScript
import { evaluate } from 'mathjs';

console.log(evaluate('2 + 2')); // 4
2. Implementation patterns (multi-agent systems)
Pattern: Tool-augmented agent (critical)

Instead of letting agents “think” math:

TypeScript
// tool registry
const tools = {
  math: (input: string) => evaluate(input)
};

// agent step
async function agentStep(task) {
  if (task.type === "math") {
    return tools.math(task.payload);
  }
}
Pattern: Deterministic execution layer

Architecture:

LLM Agent → Tool Router → Deterministic Engine (Node.js) → Result

LLM decides what to compute

Node executes how

Pattern: Sandboxed execution (Electron)

In Electron:

JavaScript
// main process
import { contextBridge } from 'electron';
import { evaluate } from 'mathjs';

contextBridge.exposeInMainWorld('tools', {
  math: (expr) => evaluate(expr)
});

Renderer:

JavaScript
window.tools.math("2+2"); // 4
3. Known pitfalls / gotchas
❌ 1. Using LLM for math
"2+2" → "Four" (usually correct, but not guaranteed)

Breaks under:

larger expressions

chained reasoning

adversarial prompts

❌ 2. Using eval
JavaScript
eval("2+2") // works, but dangerous

Remote code execution risk in agent systems

❌ 3. Floating-point traps
JavaScript
0.1 + 0.2 !== 0.3

Use:

mathjs

decimal.js

❌ 4. Agent drift

Agents may:

hallucinate results

skip tool usage

Fix: enforce tool usage via schema

JSON
{
  "type": "object",
  "properties": {
    "tool": { "const": "math" },
    "input": { "type": "string" }
  },
  "required": ["tool", "input"]
}
4. Authoritative documentation / source links
Node.js

https://nodejs.org/docs/latest-v20.x/api/

Electron

https://www.electronjs.org/docs/latest

mathjs

https://mathjs.org/docs/expressions/parsing.html

Safer math / precision

https://mikemcl.github.io/decimal.js/

Secure JS evaluation patterns

https://owasp.org/www-community/attacks/Code_Injection

Bottom line for your system

For a production multi-agent coding system:

Treat math as a tool, not reasoning

Route all computations through deterministic Node services

Avoid eval, enforce schemas, and sandbox execution

If you want, I can extend this into a full tool-router + agent protocol design (with retries, telemetry, and guardrails).

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/std-test-iter2/_rollup.md
