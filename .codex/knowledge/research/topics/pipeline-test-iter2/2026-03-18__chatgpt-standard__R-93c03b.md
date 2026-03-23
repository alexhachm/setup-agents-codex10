---
kind: research_note
scope: project
id: R-93c03b
title: "pipeline-test-iter2 — ChatGPT standard research"
created: 2026-03-18
updated: 2026-03-18
topics:
  - pipeline-test-iter2
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
What is 2+2? Answer in exactly one word.

# Findings
four

---

Below is a production-oriented interpretation of your “2+2” query inside a Node.js/Electron multi-agent system—treating it as a deterministic computation task that flows through your pipeline.

1) Concrete, actionable answer (system-level)

Even though the correct result is:

four

In a multi-agent system, the important part is not the math—it’s how you ensure:

deterministic execution

consistent formatting (“one word”)

safe evaluation

reproducibility across agents

Recommended stack (2026-ready)

Node.js: ≥ 20.x (built-in fetch, stable worker_threads)

Electron: ≥ 30.x (Chromium sandbox improvements)

Task execution isolation:

worker_threads (lightweight)

OR vm module (for sandboxed eval)

Validation layer:

zod or superstruct for schema enforcement

Queue:

bullmq (Redis-backed) OR in-memory for lightweight systems

2) Implementation patterns
A. Deterministic compute agent (recommended pattern)

Treat even trivial math as a typed task:

TypeScript
// types.ts
export type ComputeTask = {
  type: 'compute.arithmetic';
  expression: string; // "2+2"
  outputFormat: 'one-word';
};
B. Safe evaluator (DO NOT use raw eval)
TypeScript
// evaluator.ts
import { Script } from 'node:vm';

export function safeEval(expression: string): number {
  const script = new Script(expression);
  const context = {};
  return script.runInNewContext(context, {
    timeout: 50, // prevent infinite loops
  });
}
C. Agent worker
TypeScript
// compute-agent.ts
import { safeEval } from './evaluator';

export async function computeAgent(task: ComputeTask): Promise<string> {
  if (task.type !== 'compute.arithmetic') {
    throw new Error('Unsupported task');
  }

  const result = safeEval(task.expression);

  // enforce deterministic formatting
  if (task.outputFormat === 'one-word') {
    return numberToWord(result);
  }

  return String(result);
}

// minimal mapping (expand as needed)
function numberToWord(n: number): string {
  const map: Record<number, string> = {
    0: 'zero',
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
  };

  if (!(n in map)) throw new Error('Unsupported number');
  return map[n];
}
D. Coordinator routing pattern
TypeScript
// coordinator.ts
import { computeAgent } from './compute-agent';

export async function routeTask(task: any) {
  switch (task.type) {
    case 'compute.arithmetic':
      return computeAgent(task);

    default:
      throw new Error('No agent available');
  }
}
E. End-to-end example
TypeScript
const task = {
  type: 'compute.arithmetic',
  expression: '2+2',
  outputFormat: 'one-word',
};

const result = await routeTask(task);

console.log(result); // "four"
3) Known pitfalls / gotchas
❌ 1. Using eval
TypeScript
eval("2+2") // unsafe

Remote code execution risk

Breaks sandboxing guarantees

Never use in agent systems

❌ 2. Non-deterministic formatting

LLM output might be:

"Four"

"4"

"The answer is four"

Fix: enforce post-processing layer (as shown)

❌ 3. Floating-point surprises
TypeScript
0.1 + 0.2 !== 0.3

Use:

decimal.js

big.js

for production math tasks

❌ 4. Agent drift (LLM-based compute)

If you let an LLM answer:

“2+2 = 4”

You may get:

formatting violations

hallucinated reasoning

inconsistent outputs

Best practice:
➡️ route deterministic tasks to non-LLM compute agents

❌ 5. Missing idempotency

If tasks retry:

JSON
{ "expression": "2+2" }

You must guarantee same output every time.

Use:

TypeScript
taskId = hash(expression + outputFormat)
4) Production patterns (high leverage)
Pattern: “LLM for planning, code for execution”

LLM decides:

“this is arithmetic”

System executes:

deterministic compute agent

Pattern: Typed task contracts

Use strict schemas:

TypeScript
import { z } from 'zod';

export const ComputeTaskSchema = z.object({
  type: z.literal('compute.arithmetic'),
  expression: z.string(),
  outputFormat: z.enum(['one-word']),
});
Pattern: Capability routing

Instead of switch, use registry:

TypeScript
const registry = {
  'compute.arithmetic': computeAgent,
};

export async function route(task) {
  const handler = registry[task.type];
  if (!handler) throw new Error('No handler');
  return handler(task);
}
Pattern: Sandboxed execution pool

For scaling:

Use worker_threads

One worker per compute domain

TypeScript
import { Worker } from 'node:worker_threads';
5) Concrete recommendations for your system

Given your repo + architecture:

Upgrade your pipeline with:
1. Task typing layer

Add type: "compute.arithmetic"

Avoid free-form prompts

2. Deterministic execution tier

Route math → compute agent

NOT LLM

3. Output normalization layer

Enforce:

casing

format

schema

4. Idempotent task hashing

Prevent duplicate compute work

5. Execution isolation

Use vm or worker_threads

Add timeouts

6) Authoritative references
Node.js

VM module:
https://nodejs.org/api/vm.html

Worker threads:
https://nodejs.org/api/worker_threads.html

BullMQ (queueing)

https://docs.bullmq.io/

Zod (schema validation)

https://github.com/colinhacks/zod

Decimal math

https://mikemcl.github.io/decimal.js/

Final takeaway

The “2+2” problem in your system is not about arithmetic—it’s about:

building a deterministic execution lane inside a probabilistic multi-agent architecture

If you want, I can extend this into:

a full compute service module

integration with your research queue / coordinator

or a generic “deterministic tools layer” for your agents

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/pipeline-test-iter2/_rollup.md
