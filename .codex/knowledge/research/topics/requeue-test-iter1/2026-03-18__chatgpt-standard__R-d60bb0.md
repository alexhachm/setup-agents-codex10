---
kind: research_note
scope: project
id: R-d60bb0
title: "requeue-test-iter1 — ChatGPT standard research"
created: 2026-03-18
updated: 2026-03-18
topics:
  - requeue-test-iter1
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
What color is the sky? Answer in one word.

# Findings
Blue

---

Alright — let’s treat this as a test-case design problem inside a multi-agent Node.js/Electron system, not a literal knowledge question.

✅ Core Answer (still required by your constraint)

Blue

1. Concrete, Actionable Answer (System Design Context)

In a production multi-agent system, a trivial question like “What color is the sky?” → “Blue” is useful for:

A. Deterministic correctness testing

Verifies:

agent output formatting constraints

routing correctness

requeue / retry behavior

strict output enforcement (e.g., one word only)

B. Recommended Setup

Environment

Node.js: >=20.11 (LTS, stable fetch + WebStreams)

Electron: >=28

LLM interface: OpenAI / Anthropic / local (doesn’t matter — this is a harness test)

Contract

TypeScript
type Task = {
  id: string;
  prompt: string;
  constraints: {
    format: 'one-word';
    deterministic: true;
  };
};
2. Implementation Patterns
Pattern 1: Strict Output Validator (CRITICAL)

Never trust agent output — enforce constraints at coordinator level.

TypeScript
function validateOneWord(output: string): boolean {
  return /^[A-Za-z]+$/.test(output.trim());
}
Pattern 2: Requeue-on-Failure Loop

This is likely what your requeue-test-iter1 is targeting.

TypeScript
async function processTask(task, agent, queue) {
  const result = await agent.run(task.prompt);

  if (!validateOneWord(result)) {
    console.log(`Requeueing task ${task.id} due to invalid output: ${result}`);

    await queue.requeue(task.id, {
      reason: 'INVALID_FORMAT',
      attemptIncrement: true,
    });

    return;
  }

  await queue.complete(task.id, result);
}
Pattern 3: Idempotent Requeue Design

Avoid duplicate execution side effects.

TypeScript
// Use idempotency key
const executionKey = `${task.id}:${task.attempt}`;

if (await db.hasResult(executionKey)) {
  return db.getResult(executionKey);
}
Pattern 4: Prompt Hardening (Agent-Side)

Even simple questions can drift without constraints.

TypeScript
const prompt = `
Answer the following question in exactly ONE word.
No punctuation. No explanation.

Question: What color is the sky?
`;
Pattern 5: Coordinator-Level Guardrail (Better than Prompting)

Do NOT rely only on prompt.

TypeScript
function normalizeOutput(output: string): string {
  return output.trim().split(/\s+/)[0]; // fallback clamp
}
3. Known Pitfalls / Gotchas
❌ 1. LLM verbosity drift

Even with instructions, models may output:

"The sky is blue."

"Blue."

"It is blue"

👉 Fix: post-validation + normalization

❌ 2. Infinite requeue loops

If your validator is too strict:

Blue.

fails → requeue → same output → infinite loop

Fix:

max attempts

fallback coercion

TypeScript
if (task.attempts > 3) {
  return queue.fail(task.id, 'MAX_ATTEMPTS');
}
❌ 3. Non-determinism across models

Different providers may return:

Blue

blue

Light blue

👉 Normalize:

TypeScript
output.toLowerCase()
❌ 4. Hidden whitespace / tokens
TypeScript
"Blue\n"
" Blue "

👉 Always:

TypeScript
output.trim()
❌ 5. Multi-agent disagreement

If multiple agents answer:

JSON
["Blue", "Light blue", "Gray"]

👉 Need arbitration strategy:

majority vote

confidence scoring

deterministic override for test tasks

4. Concrete Recommendations (High-Leverage)
🔥 Recommendation 1: Add Task Type = "Deterministic Test"
TypeScript
enum TaskType {
  DETERMINISTIC_TEST,
  RESEARCH,
  CODING,
}

Then enforce stricter rules:

TypeScript
if (task.type === TaskType.DETERMINISTIC_TEST) {
  temperature = 0;
  top_p = 0;
}
🔥 Recommendation 2: Use a Validation Pipeline (NOT inline checks)
TypeScript
const validators = [
  validateOneWord,
  noPunctuation,
  notEmpty,
];

function runValidators(output) {
  return validators.every(v => v(output));
}
🔥 Recommendation 3: Structured Result Envelope
TypeScript
type AgentResult = {
  raw: string;
  normalized: string;
  valid: boolean;
  errors?: string[];
};
🔥 Recommendation 4: Requeue Metadata Tracking
TypeScript
await queue.requeue(task.id, {
  reason: 'INVALID_FORMAT',
  lastOutput: result,
  attempt: task.attempt + 1,
});
🔥 Recommendation 5: Add “Auto-Correct Before Requeue”

Reduce wasted cycles:

TypeScript
if (!validateOneWord(result)) {
  const corrected = normalizeOutput(result);

  if (validateOneWord(corrected)) {
    return queue.complete(task.id, corrected);
  }
}
5. Minimal End-to-End Example
TypeScript
async function runSkyTest() {
  const task = {
    id: 'sky-test-1',
    prompt: 'What color is the sky?',
    constraints: { format: 'one-word' },
    attempts: 0,
  };

  const result = await agent.run(task.prompt);

  const normalized = result.trim().toLowerCase();

  if (!/^[a-z]+$/.test(normalized)) {
    return 'REQUEUE';
  }

  return normalized;
}
6. Authoritative References
Node.js / Runtime

https://nodejs.org/docs/latest-v20.x/api/

https://nodejs.org/api/stream.html

Electron IPC / Multi-process

https://www.electronjs.org/docs/latest/tutorial/ipc

https://www.electronjs.org/docs/latest/api/browser-window

Queue / Job Systems (recommended)

BullMQ (Redis-backed, production-grade)

https://docs.bullmq.io/

Agenda (Mongo-based)

https://github.com/agenda/agenda

Validation

Zod (strongly recommended)

https://zod.dev/

Final Takeaway

This “sky = blue” test is not trivial — it’s a canary for your entire system’s correctness guarantees:

Output constraint enforcement

Requeue semantics

Idempotency

Agent drift control

Deterministic execution mode

If this test is flaky, your whole multi-agent pipeline will be flaky.

If you want, I can next:

Turn this into a full requeue test harness

Or integrate it directly into your setup-agents-codex10 coordinator flow with exact file-level changes

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/requeue-test-iter1/_rollup.md
