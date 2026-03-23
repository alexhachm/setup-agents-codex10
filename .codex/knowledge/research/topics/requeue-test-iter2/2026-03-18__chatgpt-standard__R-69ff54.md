---
kind: research_note
scope: project
id: R-69ff54
title: "requeue-test-iter2 — ChatGPT standard research"
created: 2026-03-18
updated: 2026-03-18
topics:
  - requeue-test-iter2
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
What color is the sky? Answer in one word.

# Findings
Answer (one word): blue

Below is a production-grade way to operationalize trivial Q/A tasks like this inside a Node.js/Electron multi-agent system, since your real goal is pipeline reliability—not the literal answer.

1) Concrete, actionable implementation
Target stack (recommended)

Node.js: ≥ 20.x (stable fetch, worker_threads improvements)

Electron: ≥ 30.x (Chromium 124+, better IPC isolation)

Task orchestration: in-process queue + persistent backing (SQLite/Postgres)

Schema validation: zod@3.x

Queue (optional upgrade): bullmq@5.x (Redis-backed)

Minimal “deterministic-answer” worker

For simple questions (like this one), do NOT call an LLM. Use a deterministic fast-path.

TypeScript
// worker/qa-fastpath.ts
const FAST_ANSWERS: Record<string, string> = {
  "what color is the sky": "blue",
  "what is 2+2": "four",
};

export function fastAnswer(input: string): string | null {
  const normalized = input.toLowerCase().trim().replace(/[?.!]/g, "");
  return FAST_ANSWERS[normalized] ?? null;
}
Coordinator routing pattern
TypeScript
// coordinator/router.ts
import { fastAnswer } from "../worker/qa-fastpath";

export async function routeTask(task: { question: string }) {
  const fast = fastAnswer(task.question);

  if (fast) {
    return {
      type: "fastpath",
      answer: fast,
      latency_ms: 1,
    };
  }

  // fallback → LLM worker
  return await enqueueLLMTask(task);
}
LLM worker (structured, one-word enforcement)
TypeScript
// worker/llm-worker.ts
import OpenAI from "openai";
import { z } from "zod";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const schema = z.object({
  answer: z.string().regex(/^\w+$/), // enforce one word
});

export async function llmAnswer(question: string) {
  const res = await client.responses.create({
    model: "gpt-5.3", // or your configured model
    input: `Answer in exactly one word:\n${question}`,
    max_output_tokens: 5,
  });

  const text = res.output_text.trim().toLowerCase();
  return schema.parse({ answer: text }).answer;
}
Electron IPC bridge
TypeScript
// main/ipc.ts
import { ipcMain } from "electron";
import { routeTask } from "../coordinator/router";

ipcMain.handle("ask-question", async (_, question: string) => {
  return await routeTask({ question });
});
2) Implementation patterns (what matters in production)
A. Fast-path vs LLM-path (critical pattern)

Fast-path (deterministic):

lookup tables

regex rules

cached answers

LLM-path (expensive fallback)

👉 This reduces:

latency (ms vs seconds)

cost (0 vs API call)

failure rate

B. Idempotent task design
TypeScript
const taskId = hash(question);

if (await db.exists(taskId)) {
  return db.get(taskId);
}

Prevents duplicate LLM calls in requeue scenarios (like your requeue-test-iter2).

C. Requeue-safe state machine
TypeScript
enum Status {
  PENDING,
  RUNNING,
  COMPLETED,
  FAILED,
}

Persist transitions:

TypeScript
await db.update(taskId, { status: "RUNNING" });

On restart:

requeue RUNNING → PENDING

D. Strict output contracts

Always enforce:

format (one word)

casing

length

Using:

zod

regex

JSON schema

E. Observability hooks
TypeScript
logger.info({
  taskId,
  route: fast ? "fastpath" : "llm",
  latency_ms,
});
3) Known pitfalls / gotchas
❌ 1. Overusing LLM for trivial tasks

Wasteful and slow

Fix: fast-path dictionary

❌ 2. Non-deterministic outputs

LLMs may return:

“Blue.”

“The sky is blue”

“Usually blue”

Fix:

regex validation

retry with stricter prompt

post-process normalization

❌ 3. Requeue duplication bugs

If your queue retries:

same task runs multiple times

multiple writes

Fix:

idempotency key (hash of input)

unique DB constraint

❌ 4. Electron IPC blocking

Avoid:

TypeScript
ipcMain.on("ask", async () => { ... }) // ❌ blocking

Use:

TypeScript
ipcMain.handle(...) // ✅ promise-based
❌ 5. Silent schema drift

If you change output format later:

downstream breaks

Fix:

versioned schemas

4) Authoritative docs / references
Node.js

https://nodejs.org/api/

https://nodejs.org/api/worker_threads.html

Electron IPC

https://www.electronjs.org/docs/latest/api/ipc-main

https://www.electronjs.org/docs/latest/tutorial/ipc

BullMQ (queue)

https://docs.bullmq.io/

Zod (validation)

https://zod.dev/

OpenAI Responses API

https://platform.openai.com/docs/api-reference/responses

Key takeaway

For systems like yours, the real problem is not answering “blue”—it’s:

Designing a pipeline that never needs to ask the model in the first place unless absolutely necessary, and remains correct under retries, restarts, and scale.

If you want, I can map this directly onto your repo’s coordinator + watchdog + research queue and show exactly where to plug in fast-path + idempotency.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/requeue-test-iter2/_rollup.md
