---
kind: research_note
scope: project
id: R-d0ed65
title: "requeue-iter1 — ChatGPT standard research"
created: 2026-03-18
updated: 2026-03-18
topics:
  - requeue-iter1
sources:
  - chatgpt-standard
confidence: medium
status: draft
---

# Question
What color is the sky? One word.

# Findings
Blue

---

Yes. For your actual prompt target, the answer is still blue.

For a Node.js/Electron multi-agent system, the useful part is not the fact itself, but how to make “one-word factual answers” reliable, machine-checkable, and safe to requeue.

Concrete recommendation

Treat this class of task as a strict-output contract:

expected type: single token / one word

allowed normalization: trim whitespace, lowercase

retry rule: if output contains spaces, punctuation, explanation, or multiple words, auto-requeue once with a stricter formatter prompt

validation layer: enforce the contract in code, not just in prompting

Use:

Node.js 22 LTS or 24 LTS for the coordinator/runtime. Node 24 is the latest LTS line, while Node 22 is also LTS and widely compatible. 
Node.js
+1

Electron IPC with ipcMain/ipcRenderer and contextBridge for main↔renderer boundaries. Electron documents IPC channels as the standard communication pattern, and contextIsolation is on by default since Electron 12. 
Electron
+2
Electron
+2

Ajv to validate task envelopes and model outputs against JSON Schema. Ajv compiles schemas to efficient JS validators and supports modern JSON Schema drafts including 2020-12. 
ajv.js.org
+2
ajv.js.org
+2

Implementation pattern
1) Define a task envelope
JSON
{
  "taskId": "requeue-iter1",
  "question": "What color is the sky?",
  "outputMode": "one_word",
  "expectedFormat": {
    "type": "string",
    "pattern": "^[A-Za-z]+$",
    "maxLength": 20
  },
  "retryPolicy": {
    "maxAttempts": 2,
    "requeueOnValidationFailure": true
  }
}

This separates:

the semantic question

the format contract

the retry policy

That is much more robust than relying on “One word” buried in prose.

2) Validate model output in Node
JavaScript
// validator.js
import Ajv from "ajv";

const ajv = new Ajv();

const outputSchema = {
  type: "string",
  pattern: "^[A-Za-z]+$",
  maxLength: 20
};

const validate = ajv.compile(outputSchema);

export function normalizeOneWord(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function validateOneWord(value) {
  const normalized = normalizeOneWord(value);
  const ok = validate(normalized);
  return {
    ok,
    value: normalized,
    errors: validate.errors ?? []
  };
}

Why this pattern:

normalize first

validate second

do not let downstream agents guess whether "Blue." or " blue " is acceptable

Ajv’s compiled-schema approach is the intended usage model in its docs. 
ajv.js.org
+1

3) Requeue on formatting failure, not immediately on content disagreement
JavaScript
// requeue-runner.js
import { validateOneWord } from "./validator.js";

export async function runOneWordTask({ task, callModel, requeue }) {
  const prompt = [
    `Answer the question in exactly one word.`,
    `No punctuation.`,
    `No explanation.`,
    `Question: ${task.question}`
  ].join("\n");

  const raw = await callModel(prompt);
  const checked = validateOneWord(raw);

  if (checked.ok) {
    return {
      status: "completed",
      answer: checked.value,
      raw
    };
  }

  if ((task.attempt ?? 1) < task.retryPolicy.maxAttempts) {
    await requeue({
      ...task,
      attempt: (task.attempt ?? 1) + 1,
      priorFailure: {
        reason: "validation_failure",
        raw
      }
    });

    return {
      status: "requeued",
      reason: "validation_failure",
      raw
    };
  }

  return {
    status: "failed",
    reason: "invalid_final_output",
    raw,
    validationErrors: checked.errors
  };
}

Concrete recommendation:

requeue on structure failure

flag for review on semantic uncertainty

do not endlessly retry a trivial task, or your agent loop will thrash

4) Electron-safe IPC surface

Expose only a narrow API from preload to renderer:

JavaScript
// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentAPI", {
  submitTask: (task) => ipcRenderer.invoke("agent:submit-task", task),
  getTask: (taskId) => ipcRenderer.invoke("agent:get-task", taskId)
});
JavaScript
// main.js
const { app, BrowserWindow, ipcMain } = require("electron");

ipcMain.handle("agent:submit-task", async (_event, task) => {
  // validate task envelope here
  return { accepted: true, taskId: task.taskId };
});

ipcMain.handle("agent:get-task", async (_event, taskId) => {
  return { taskId, status: "completed", answer: "blue" };
});

This follows Electron’s documented IPC model and keeps privileged logic in the main/preload layers rather than the renderer. contextBridge is specifically intended for exposing a safe, limited API into the renderer when context isolation is enabled. 
Electron
+3
Electron
+3
Electron
+3

5) Child-process isolation for agent workers

If your “multi-agent” workers run as subprocesses, use node:child_process.spawn() instead of cramming all agent execution into one process.

JavaScript
// worker-launch.js
import { spawn } from "node:child_process";

export function launchWorker(script, args = []) {
  const child = spawn(process.execPath, [script, ...args], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (buf) => {
    process.stdout.write(`[worker] ${buf}`);
  });

  child.stderr.on("data", (buf) => {
    process.stderr.write(`[worker:err] ${buf}`);
  });

  child.on("exit", (code, signal) => {
    console.log("worker exit", { code, signal });
  });

  return child;
}

Node documents spawn() as the primary API for subprocess creation. 
Node.js

For this kind of workload:

one coordinator process

N worker subprocesses

structured task/result JSON over stdio, sockets, or a queue

explicit state transitions: queued -> running -> completed|failed|requeued

Recommended architecture for your exact use case

For “requeue-iter1”-style microtasks, I would use:

Task schema

taskId

question

outputMode

expectedFormat

attempt

maxAttempts

semanticDomain

Validation stages

Stage 1: transport/schema validation

Stage 2: output-shape validation

Stage 3: optional semantic validator

Retry taxonomy

malformed output → requeue once

timeout / worker crash → retry with backoff

semantically dubious answer → mark low-confidence, do not infinite-loop

Audit trail

store raw prompt

raw model output

normalized output

validation result

retry reason

That gives you debuggability when a worker returns:

"The sky is blue"

"blue."

"blu"

""

Known pitfalls

The biggest gotchas in systems like this are:

Prompt-only enforcement

A model can ignore “one word” surprisingly often. Enforce in code.

Over-normalization

If you strip too aggressively, "blue-green" might become accepted when it should fail. Decide allowed characters explicitly in schema.

Infinite requeue loops

Always cap retries. A bad prompt, broken model endpoint, or bad parser can otherwise spin forever.

Renderer over-privilege in Electron

Do not let the renderer call filesystem, shell, or worker-launch APIs directly. Use preload + contextBridge + IPC. Electron’s security guidance strongly recommends minimizing privileged renderer access. 
Electron
+1

Mixing semantic correctness with format correctness

For this prompt, "blue" is format-valid and semantically fine. But in harder tasks, those are separate checks. Keep them separate in your system design.

Using unversioned Electron docs

Electron explicitly warns to use docs matching your app’s Electron version, because API behavior can differ across releases. 
Electron

Concrete production-style recommendation

For your coordinator:

Use a JSON task envelope

Validate with Ajv before dispatch

Run workers as isolated child processes

Normalize and validate outputs before accepting

Requeue only on structural failures

Persist every attempt with reason codes

Expose only narrow IPC methods to the Electron renderer

Minimal end-to-end example
JavaScript
// one-word-agent.js
import Ajv from "ajv";

const ajv = new Ajv();
const schema = {
  type: "string",
  pattern: "^[A-Za-z]+$",
  maxLength: 20
};
const validate = ajv.compile(schema);

function normalize(s) {
  return String(s ?? "").trim().toLowerCase();
}

async function fakeModel(question) {
  if (question === "What color is the sky?") return "Blue";
  return "unknown";
}

async function runTask(task) {
  const raw = await fakeModel(task.question);
  const answer = normalize(raw);

  if (!validate(answer)) {
    return {
      status: "requeue",
      reason: "invalid_format",
      raw,
      errors: validate.errors
    };
  }

  return {
    status: "completed",
    answer
  };
}

const result = await runTask({
  taskId: "requeue-iter1",
  question: "What color is the sky?"
});

console.log(result);
// { status: 'completed', answer: 'blue' }
Authoritative references

Node.js child processes: node:child_process / spawn() 
Node.js

Node.js process APIs and lifecycle events 
Node.js

Electron IPC tutorial 
Electron

Electron contextBridge API 
Electron

Electron preload scripts 
Electron

Electron security guidance 
Electron

Ajv getting started / compile schema / JSON Schema support 
ajv.js.org
+2
ajv.js.org
+2

If you want, I can turn this into a reusable one-word-task-runner.js module for your Node/Electron coordinator.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/requeue-iter1/_rollup.md
