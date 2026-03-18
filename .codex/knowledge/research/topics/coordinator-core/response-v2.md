COORDINATOR CORE

I’ve also pinned the current Electron/Node process guidance, so I’m shaping this into a concrete boundary recommendation for `coordinator-core`: shared protocol only, with process/IPC, session-worktree persistence, and worker-vs-utility-process choices called out as the main coordinator failure points.

Thought for 21m 56s

Assuming you mean the public `spencerbeggs/claude-design-coordinator` monorepo and its `@spencerbeggs/claude-coordinator-core` package, the fastest accurate summary is: **`coordinator-core` is the contract layer, not the orchestration layer**. It exports Zod schemas, inferred types, and defaults; the real behavior for questions, context, and sessions lives in the server state/router and the MCP bridge. In the current repo, the package versions are `@spencerbeggs/claude-coordinator-core@0.1.0`, `@spencerbeggs/claude-coordinator-server@0.1.0`, `@spencerbeggs/claude-coordinator-mcp@0.1.0`, with `zod@4.3.5`, `@trpc/server/@trpc/client@11.8.1`, `ws@8.19.0`, `@modelcontextprotocol/sdk@1.25.3`, `typescript@5.9.3`, `vitest@4.0.17`, `turbo@2.7.5`, `pnpm@10.28.0`, and package engines of `node >=20` while the repo’s dev runtime is pinned to Node `24.11.0`.

For the **`Question` domain specifically**, the current core model is intentionally minimal: a `Question` has `id`, `question`, `from`, optional `to`, optional `answer`, optional `answeredBy`, `status`, `createdAt`, and optional `answeredAt`; status is only `"pending"` or `"answered"`. The server’s `ask` route just creates that object and stores it, `answer` overwrites it with answer metadata, and `listPending(agentId?)` filters pending items by `to` if present. That is a clean prototype pattern, but it is not a full workflow engine yet.

### **What is good here, and worth copying**

1. **Contract-first core package.** Keeping schemas/types/defaults in `coordinator-core` and behavior in `server`/`mcp` is the right separation. The core exports agent, context, decision, and question schemas plus `DEFAULT_PORT/HOST/URL`, which is exactly what a shared domain package should do.  
2. **Zod at the edges.** The repo uses Zod everywhere for DTOs, which is the right pattern for multi-agent systems because every boundary is untrusted. Zod’s own docs explicitly position schemas as runtime validation plus type inference.  
3. **ESM/strict TS discipline.** The repo is strict TS, ESM, `.js` import extensions, and `node:` builtins. That is especially useful when the same contract package is shared across Node tools, Electron main/preload, and test code.

### **The three changes I would make first**

**A. Stop hand-writing the tRPC client contract.**  
Today `mcp/src/client.ts` defines a manual `TypedTRPCClient` and then casts `createTRPCClient(...) as unknown as TypedTRPCClient`. That already drifted: the client says `context.list.query(input?: { prefix?: string; tags?: string[] })`, but the server schema supports `tags` and `createdBy`, not `prefix`. That is the exact kind of bug contract packages are supposed to prevent.

Use the actual router type instead:

// pkgs/claude-coordinator-mcp/src/client.ts  
import type { AppRouter } from "@spencerbeggs/claude-coordinator-server";  
import { createTRPCClient, createWSClient, wsLink } from "@trpc/client";  
import WebSocket from "ws";  
import superjson from "superjson";  
import { DEFAULT\_URL } from "@spencerbeggs/claude-coordinator-core";

export function createCoordinatorClient(url \= DEFAULT\_URL) {  
 const wsClient \= createWSClient({  
   url,  
   WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,  
   connectionParams: async () \=\> ({  
     token: await getCoordinatorToken(),  
   }),  
 });

 const trpc \= createTRPCClient\<AppRouter\>({  
   links: \[wsLink({ client: wsClient, transformer: superjson })\],  
 });

 return {  
   trpc,  
   close: () \=\> wsClient.close(),  
 };  
}

That fixes two real problems at once: router drift and date serialization. The current client/server do **not** configure a tRPC transformer, even though they return `Date`\-typed fields like `createdAt`, `connectedAt`, and `answeredAt`. tRPC’s docs are explicit that if you want `Date`/`Map`/`Set` to survive over the wire correctly, you need a transformer like `superjson` on both server and client.

**B. Harden the question lifecycle.**  
Right now any caller who knows an `agentId` can impersonate that agent, because the server trusts `agentId` from mutation input instead of binding identity to the WebSocket connection/context. Also, `answerQuestion()` does not check “already answered”, does not enforce `to`, and the router throws a plain `Error` instead of a typed `TRPCError`. That means double answers are possible and the last write wins.

I would change the lifecycle to `pending -> claimed -> answered|expired|cancelled`, and enforce ownership:

// server/router.ts  
import { TRPCError } from "@trpc/server";

answer: publicProcedure  
 .input(AnswerInputSchema.extend({ agentId: z.string().uuid() }))  
 .mutation(({ input, ctx }) \=\> {  
   const q \= ctx.state.getQuestion(input.questionId);

   if (\!q) {  
     throw new TRPCError({ code: "NOT\_FOUND", message: "Question not found" });  
   }  
   if (q.status \!== "pending") {  
     throw new TRPCError({ code: "CONFLICT", message: "Question is no longer pending" });  
   }  
   if (q.to && q.to \!== input.agentId) {  
     throw new TRPCError({ code: "FORBIDDEN", message: "Question is assigned to another agent" });  
   }

   return ctx.state.answerQuestion(input.questionId, input.answer, input.agentId)\!;  
 });

If you expect multiple source agents, add `claimQuestion()` before `answerQuestion()`. Otherwise broadcast questions will cause duplicate work because `listPending()` intentionally returns untargeted questions to everyone.

**C. Add a wire/domain split for dates and IPC.**  
Because `QuestionSchema` and the other domain schemas use `z.coerce.date()`, the **output** type is a `Date`, but the **input** at the wire boundary is effectively string/unknown. Zod’s docs call out that coerced schemas have different input/output types, and Zod 4 also gives you `z.input`, `z.output`, and codecs for explicit network transformations. In a Node/Electron system, this is worth making explicit.

A good pattern is:

export type QuestionWire \= z.input\<typeof QuestionSchema\>;  
export type Question \= z.output\<typeof QuestionSchema\>;

or, better, a codec for dates if you want strict JSON wire objects and rich in-memory objects.

### **Electron-specific pattern I’d use**

Do **not** put coordinator networking directly in the renderer. Electron’s docs are very clear that the main process runs in Node, the renderer should be treated like web code, and privileged APIs should be exposed through preload \+ `contextBridge`. For heavy, crash-prone, or untrusted coordination work, Electron explicitly recommends `utilityProcess` as a better home than stuffing everything into the main process. Also, values exposed via `contextBridge` are copied/frozen, so expose narrow methods and events, not a mutable raw client object.

A solid desktop layout is:

* `coordinator-core`: shared schemas/types only  
* `utility process`: tRPC/WebSocket client/server, polling/subscriptions, persistence  
* `main`: owns the utility process and IPC routing  
* `preload`: exposes one method per IPC command  
* `renderer`: calls `window.coordinator.ask(...)`, `window.coordinator.listPending(...)`, etc.

That matches Electron’s IPC guidance and avoids exposing raw `ipcRenderer.send` or arbitrary channels to the UI.

### **Biggest gotchas in the current codebase**

* **There is only one real in-memory server state.** `getOrCreateState()` is a singleton, so the returned `sessionId` is effectively global to that server instance. If you need multiple independent coordination rooms/workspaces, you need `Map<sessionId, CoordinatorState>` instead of one singleton.  
* **No persistence, auth, or clustering.** The README itself calls out in-memory state, single-server design, no authentication, and MCP polling. That is okay for a prototype, not for a serious desktop multi-agent system.  
* **Server trusts caller-supplied identity.** `agentId` is accepted as input on mutations, so identity is spoofable unless you bind it to authenticated connection params/context. tRPC’s WS docs show `connectionParams` for exactly this kind of auth handshake.  
* **Question event schema drift.** `coordinator-core` defines `QuestionEventSchema` and `AnswerEventSchema`, but the server subscription emits raw `Question` objects for both paths, so consumers don’t get the discriminant the core package advertises.  
* **MCP must never write to stdout.** The current code gets this right by logging to `stderr`; keep it that way if you embed or rehost the MCP bridge. MCP’s official docs explicitly warn that stdout will corrupt JSON-RPC on stdio transports.

### **Best-practice summary for your system**

If you keep the current architecture, I’d treat `coordinator-core` as a **pure domain contract package**, then harden everything around it:

1. Keep schemas in core, but add explicit wire/domain types for dates and IPC.  
2. Replace handwritten tRPC client types with `AppRouter`, and add `superjson`.  
3. Bind agent identity to authenticated WS connection params instead of request input.  
4. Add `claim/expire/cancel` semantics to questions, not just `pending/answered`.  
5. Run coordinator networking in Electron main or a utility process, and bridge only narrow commands/events into the renderer.  
6. If you want a real-time dashboard, expose subscriptions directly to Electron instead of going through the MCP polling path; tRPC’s subscription docs also recommend tracked event IDs for reconnect safety.

### **Source code and docs worth bookmarking**

* `README.md` for architecture, config, tool list, and current limitations.  
* `pkgs/claude-coordinator-core/src/schemas/question.ts` for the current `Question` contract.  
* `pkgs/claude-coordinator-server/src/router.ts` for the current ask/answer/listPending behavior.  
* `pkgs/claude-coordinator-server/src/state.ts` for singleton state, question storage, and overwrite behavior.  
* `pkgs/claude-coordinator-mcp/src/client.ts` for the handwritten client typing and missing transformer.  
* Electron docs: process model, context isolation, contextBridge, IPC, utilityProcess.  
* tRPC docs: WebSockets, `wsLink`, transformers, connection params, tracked subscriptions.  
* Zod docs: schemas, coercion, `z.input`/`z.output`, codecs, JSON Schema export.  
* MCP docs: SDKs, stdio logging, and auth guidance.

If your `coordinator-core` is a different repo/package than this one, send the package path or repo name and I’ll re-map the answer to that exact code.

COORDINATOR ROUTING

I’ve tightened this into an implementation blueprint, and one important update is that current guidance centers on Electron 41 with bundled Node 24.14.0 / Node 24 Active LTS. Next I’m focusing on concrete contracts, queues, cancellation/locking, shell isolation, and where an OpenAI-specific orchestration layer fits.

A key concrete recommendation has emerged: reserve `ipcMain.handle`/`ipcRenderer.invoke` for control messages only, and put every long-lived or high-volume agent stream on `MessagePort`s. I’m now turning that into exact module boundaries, route schemas, observability, write-safety, and production failure handling with current Electron/Node API details.

Thought for 23m 2s

Assuming **coordinator-routing** is the layer that accepts a task, decides which agent/tool should handle it, and moves work across Electron **main / renderer / utility** processes, I would build it as a **typed control plane in the Electron main process** with a separate execution plane for agents. As of March 2026, Electron 41.0.3 is current stable and bundles Node 24.14.0; Electron 39.8.3 bundles Node 22.22.1. Electron only supports the latest three stable major lines, and the Electron docs explicitly warn you to use docs that match your installed version, not whatever `/docs/latest` happens to contain.

## **1\) What the coordinator-routing domain should own**

In this kind of app, the coordinator should own exactly these concerns: task intake, schema validation, route selection, process boundary selection, cancellation/deadlines, retry/idempotency, and run-event emission. It should **not** own UI rendering, heavy agent execution, or direct tool implementations. Electron’s own process model maps well to this: the **main process** is the single application entry point, **renderers** are UI-only, and **utility processes** are the place for untrusted, CPU-intensive, or crash-prone components.

A good concrete split is:

src/main/coordinator/  
 contracts/        // task/run event schemas  
 registry/         // agent descriptors \+ capabilities  
 policy/           // deterministic routing/scoring  
 runtime/          // run store, leases, retries, cancellation  
 transport/        // Electron IPC adapters  
 agents/           // utility-process bootstrap \+ pools

For Electron security and maintainability, keep the renderer thin and explicit:

// main/window.ts  
import { BrowserWindow } from 'electron';  
import { join } from 'node:path';

export function createMainWindow() {  
 return new BrowserWindow({  
   width: 1400,  
   height: 900,  
   webPreferences: {  
     preload: join(\_\_dirname, 'preload.js'),  
     contextIsolation: true,  
     sandbox: true,  
     nodeIntegration: false,  
   },  
 });  
}

Electron’s security guidance says `contextIsolation` is default since Electron 12, sandboxing is default since Electron 20, and disabling context isolation also disables sandboxing. Preload \+ `contextBridge` is the supported way to expose narrow APIs to the renderer.

## **2\) Use two planes: control plane and data plane**

The biggest implementation mistake in coordinator-routing is using one IPC mechanism for everything. In Electron, the clean split is:

* **Control plane**: `ipcRenderer.invoke` ↔ `ipcMain.handle`  
* **Event / stream plane**: `postMessage` \+ `MessageChannelMain` / `MessagePortMain`  
* **Execution plane**: `utilityProcess.fork()` or `worker_threads`, depending on workload

Electron explicitly recommends `invoke/handle` for two-way request/response IPC, and `sendSync` blocks the whole renderer so it should be treated as a last resort. Electron also documents that `MessagePort`s can only be transferred via `postMessage`, not `send` or `invoke`.

My concrete recommendation is:

* `coord:startRun`, `coord:cancelRun`, `coord:getRunState`: `invoke/handle`  
* token/log/diff/test output stream: `MessagePort`  
* patcher/tester/code-runner agents: `utilityProcess`  
* tiny in-process CPU transforms: `worker_threads`  
* pure I/O agents: do **not** move to workers just because they are “background”; Node’s docs are explicit that workers help CPU-heavy JS, not I/O-heavy work.

## **3\) Make routing typed and deterministic**

Do **not** route by free-form agent names or prompt text. Route by a typed task envelope plus a registry of agent descriptors. For a codebase like yours, I would model the routing contract like this:

// contracts/task.ts  
import \* as z from 'zod';

export const Capability \= z.enum(\[  
 'plan',  
 'codebase.search',  
 'code.patch',  
 'test.run',  
 'lint.run',  
 'terminal.exec',  
 'review',  
 'summarize',  
\]);

export const TaskEnvelope \= z.object({  
 taskId: z.string().min(1),  
 runId: z.string().min(1),  
 parentTaskId: z.string().min(1).nullable().default(null),  
 capability: Capability,  
 input: z.unknown(),  
 refs: z.array(z.object({  
   kind: z.enum(\['file', 'selection', 'artifact', 'task'\]),  
   id: z.string(),  
 })).default(\[\]),  
 deadlineAt: z.number().int().positive(),  
 maxRetries: z.number().int().min(0).max(3).default(1),  
 maxFanOut: z.number().int().min(1).max(8).default(1),  
 trust: z.enum(\['ui', 'agent', 'system'\]).default('ui'),  
 idempotencyKey: z.string().min(1),  
});

export type TaskEnvelope \= z.infer\<typeof TaskEnvelope\>;

Zod 4 is now stable and is a TypeScript-first validator. If you want a transport-neutral contract between processes, JSON Schema Draft 2020-12 plus Ajv v8 is the better fit; Ajv compiles schemas to efficient validators and caches compiled schemas, which is exactly what you want on a coordinator hot path.

If you want the contract in JSON Schema so multiple processes or languages can share it:

// contracts/task.schema.json  
export const taskSchema \= {  
 $schema: 'https://json-schema.org/draft/2020-12/schema',  
 type: 'object',  
 required: \['taskId', 'runId', 'capability', 'input', 'deadlineAt', 'idempotencyKey'\],  
 additionalProperties: false,  
 properties: {  
   taskId: { type: 'string', minLength: 1 },  
   runId: { type: 'string', minLength: 1 },  
   parentTaskId: { type: \['string', 'null'\] },  
   capability: {  
     enum: \['plan', 'codebase.search', 'code.patch', 'test.run', 'lint.run', 'terminal.exec', 'review', 'summarize'\],  
   },  
   input: true,  
   refs: {  
     type: 'array',  
     items: {  
       type: 'object',  
       required: \['kind', 'id'\],  
       additionalProperties: false,  
       properties: {  
         kind: { enum: \['file', 'selection', 'artifact', 'task'\] },  
         id: { type: 'string' },  
       },  
     },  
   },  
   deadlineAt: { type: 'integer', minimum: 1 },  
   maxRetries: { type: 'integer', minimum: 0, maximum: 3, default: 1 },  
   maxFanOut: { type: 'integer', minimum: 1, maximum: 8, default: 1 },  
   trust: { enum: \['ui', 'agent', 'system'\], default: 'ui' },  
   idempotencyKey: { type: 'string', minLength: 1 },  
 },  
} as const;

## **4\) Agent registry and routing policy**

Your routing policy should be **hard-rule first, score second, LLM last**. The coordinator should first filter by capability, trust boundary, process type, and concurrency lease. Only if there are still multiple valid candidates should it score them by affinity, cost, queue depth, and context fit.

// registry/agents.ts  
type AgentLocation \= 'main' | 'utility' | 'worker';

type AgentDescriptor \= {  
 id: string;  
 capabilities: ReadonlyArray\<TaskEnvelope\['capability'\]\>;  
 location: AgentLocation;  
 maxParallel: number;  
 accepts(task: TaskEnvelope): boolean;  
 score(task: TaskEnvelope, ctx: RouteContext): number; // lower is better  
};

type RouteContext \= {  
 queueDepthByAgent: Record\<string, number\>;  
 lastAgentByRun: Record\<string, string | undefined\>;  
};

export const AGENTS: AgentDescriptor\[\] \= \[  
 {  
   id: 'planner',  
   capabilities: \['plan', 'summarize', 'review'\],  
   location: 'utility',  
   maxParallel: 4,  
   accepts: () \=\> true,  
   score: (task, ctx) \=\> (ctx.lastAgentByRun\[task.runId\] \=== 'planner' ? 5 : 10),  
 },  
 {  
   id: 'patcher',  
   capabilities: \['code.patch'\],  
   location: 'utility',  
   maxParallel: 2,  
   accepts: (task) \=\> task.trust \!== 'ui', // example policy  
   score: (\_task, ctx) \=\> (ctx.queueDepthByAgent\['patcher'\] ?? 0),  
 },  
 {  
   id: 'tester',  
   capabilities: \['test.run', 'lint.run', 'terminal.exec'\],  
   location: 'utility',  
   maxParallel: 2,  
   accepts: () \=\> true,  
   score: (\_task, ctx) \=\> (ctx.queueDepthByAgent\['tester'\] ?? 0),  
 },  
\];  
// policy/select-route.ts  
export function selectRoutes(task: TaskEnvelope, ctx: RouteContext): AgentDescriptor\[\] {  
 const candidates \= AGENTS  
   .filter(a \=\> a.capabilities.includes(task.capability))  
   .filter(a \=\> a.accepts(task))  
   .filter(a \=\> (ctx.queueDepthByAgent\[a.id\] ?? 0\) \< a.maxParallel)  
   .sort((a, b) \=\> a.score(task, ctx) \- b.score(task, ctx));

 if (candidates.length \=== 0\) {  
   throw new Error(\`No route for capability=${task.capability}\`);  
 }

 return candidates.slice(0, task.maxFanOut);  
}

Concrete recommendation: **do not let agents call each other directly**. Every hop goes back through the coordinator. That is the easiest way to prevent circular routing, duplicate work, and “hidden” fan-out storms.

## **5\) Safe Electron IPC surface**

Expose only narrow methods from preload. Electron’s docs explicitly warn against exposing raw `ipcRenderer.send`, `ipcRenderer.invoke`, or `ipcRenderer.on`, and against forwarding the raw `event` object to renderer callbacks. Since Electron 29, `ipcRenderer` itself can no longer be sent over `contextBridge`. Also, values exposed through `contextBridge` are copied/frozen unless they are functions.

// preload.ts  
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('coord', {  
 startRun: (task: unknown) \=\> ipcRenderer.invoke('coord:startRun', task),  
 cancelRun: (runId: string) \=\> ipcRenderer.invoke('coord:cancelRun', { runId }),

 onRunControlEvent: (callback: (evt: unknown) \=\> void) \=\> {  
   const handler \= (\_event: Electron.IpcRendererEvent, evt: unknown) \=\> callback(evt);  
   ipcRenderer.on('coord:controlEvent', handler);  
   return () \=\> ipcRenderer.off('coord:controlEvent', handler);  
 },  
});

For TypeScript hygiene, also turn on strict compiler settings that catch common coordinator bugs around optional fields, registry maps, and subclass overrides:

{  
 "compilerOptions": {  
   "strict": true,  
   "noUncheckedIndexedAccess": true,  
   "exactOptionalPropertyTypes": true,  
   "noImplicitOverride": true  
 }  
}

Zod’s docs recommend `strict: true`, and the TypeScript docs show that `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride` catch exactly the kinds of contract and registry errors that coordinators tend to accumulate.

## **6\) Best streaming pattern: connect renderer directly to the selected utility process**

This is the cleanest Electron-native pattern for multi-agent apps: main creates a `MessageChannelMain`, transfers one port to the renderer and one to the selected utility child, then gets out of the way. Electron documents this exact capability: `webContents.postMessage(...)` can transfer `MessagePortMain` to renderers, and `utilityProcess` children can receive transferred ports via `child.postMessage(...)`. On the main-process side, `MessagePortMain` messages queue until you call `port.start()`, and Electron adds a `close` event; ports can also close if garbage-collected.

// main/transport/start-run.ts  
import { ipcMain, MessageChannelMain, utilityProcess } from 'electron';  
import { join } from 'node:path';

ipcMain.handle('coord:startRun', async (event, rawTask) \=\> {  
 const task \= TaskEnvelope.parse(rawTask);  
 const route \= selectRoutes(task, getRouteContext())\[0\];

 const { port1, port2 } \= new MessageChannelMain();

 // Send one end to the renderer for live events.  
 event.sender.postMessage('coord:runStream', { runId: task.runId }, \[port2\]);

 // Spawn / locate worker process.  
 const child \= utilityProcess.fork(  
   join(\_\_dirname, \`../agents/${route.id}.js\`),  
   \[\],  
   {  
     stdio: 'pipe',  
     serviceName: \`agent:${route.id}\`,  
   },  
 );

 // Send the other end to the utility child.  
 child.postMessage({ type: 'run', task }, \[port1\]);

 // Optional: pipe child stdout/stderr into a run log  
 child.stdout?.on('data', buf \=\> appendRunLog(task.runId, 'stdout', buf.toString('utf8')));  
 child.stderr?.on('data', buf \=\> appendRunLog(task.runId, 'stderr', buf.toString('utf8')));

 return { runId: task.runId, routedTo: route.id };  
});  
// renderer/bootstrap-run-stream.ts  
import { ipcRenderer } from 'electron';

export function attachRunStream(onEvent: (evt: any) \=\> void) {  
 ipcRenderer.on('coord:runStream', (e, msg) \=\> {  
   const \[port\] \= e.ports;  
   port.onmessage \= (messageEvent) \=\> onEvent({ runId: msg.runId, ...messageEvent.data });  
   port.start?.();  
 });  
}  
// agents/patcher.ts (utility child entrypoint)  
process.parentPort\!.on('message', async (e: any) \=\> {  
 if (e.data?.type \!== 'run') return;

 const task \= TaskEnvelope.parse(e.data.task);  
 const \[stream\] \= e.ports;

 try {  
   stream.postMessage({ type: 'state', state: 'started' });  
   // ... do work ...  
   stream.postMessage({ type: 'diff', filesChanged: 3 });  
   stream.postMessage({ type: 'state', state: 'completed' });  
 } catch (err) {  
   stream.postMessage({  
     type: 'error',  
     error: serializeError(err),  
   });  
 } finally {  
   stream.close?.();  
 }  
});

Concrete recommendation: set `utilityProcess.fork(..., { stdio: 'pipe', serviceName })` for agent children. Electron says `utilityProcess` defaults `stdio` to `inherit`; if you want structured run logs from `stdout`/`stderr`, you need `pipe`. `serviceName` shows up in app metrics and the `child-process-gone` reporting path, which makes production debugging much easier. Also, `utilityProcess.fork()` can only be called after `app.ready()`.

## **7\) Cancellation, deadlines, retries, idempotency**

Put `deadlineAt` and `idempotencyKey` in every task. Inside main/utility processes, convert that into an `AbortController`, and pass the resulting `signal` into APIs that support it. Node documents `AbortSignal`, `AbortSignal.timeout()`, `stream.pipeline(..., { signal })`, HTTP request aborts via `signal`, and child process aborts via `signal`. Node also has `util.transferableAbortSignal(signal)`, which became stable in Node 22.15.0 / 23.11.0, so Electron 39+/40+/41+ are on a new enough Node line for Node-to-Node signal transfer.

// runtime/cancellation.ts  
export function createTaskAbort(deadlineAt: number) {  
 const ms \= Math.max(1, deadlineAt \- Date.now());  
 return AbortSignal.timeout(ms);  
}  
// runtime/run-command.ts  
import { spawn } from 'node:child\_process';

export async function runCommand(  
 cmd: string,  
 args: string\[\],  
 signal: AbortSignal,  
 onOutput: (chunk: string) \=\> void,  
) {  
 const cp \= spawn(cmd, args, {  
   stdio: \['ignore', 'pipe', 'pipe'\],  
   signal,  
 });

 cp.stdout.setEncoding('utf8');  
 cp.stderr.setEncoding('utf8');  
 cp.stdout.on('data', onOutput);  
 cp.stderr.on('data', onOutput);

 await new Promise\<void\>((resolve, reject) \=\> {  
   cp.on('exit', (code) \=\> (code \=== 0 ? resolve() : reject(new Error(\`exit=${code}\`))));  
   cp.on('error', reject);  
 });  
}

Two important gotchas here:

1. In Node’s `http` module, setting a timeout does **not** abort the request; it only emits a `'timeout'` event. If you want real cancellation, use `AbortSignal`.  
2. If you use `exec`/`execFile` for tests or linters, default `maxBuffer` is only **1 MiB**; long logs will get truncated and the child will be terminated. For agent runners, prefer `spawn` with streaming output.

For retries, use a policy like:

* retry only on transport/tool transient errors  
* never retry non-idempotent write actions unless guarded by `idempotencyKey`  
* persist `{idempotencyKey -> terminal result}` in the coordinator  
* return prior result on duplicate start request

That one decision prevents most “double patch applied” bugs.

## **8\) Observability: carry run context everywhere**

Use `AsyncLocalStorage` in the coordinator so every log, route event, and child spawn carries `{runId, taskId}`. Node documents `AsyncLocalStorage` as the preferred, stable, memory-safe async context solution, and `diagnostics_channel` is stable for publishing diagnostic events. For simple worker-pool style correlation, Node’s docs also show `AsyncResource` patterns, though `AsyncLocalStorage.run()` should be your default.

// runtime/trace.ts  
import { AsyncLocalStorage } from 'node:async\_hooks';  
import { channel } from 'node:diagnostics\_channel';

const runCtx \= new AsyncLocalStorage\<{ runId: string; taskId: string }\>();  
const routeCh \= channel('coord.route');

export function withRunContext\<T\>(ctx: { runId: string; taskId: string }, fn: () \=\> Promise\<T\>) {  
 return runCtx.run(ctx, fn);  
}

export function emitRouteEvent(event: string, data: Record\<string, unknown\>) {  
 const ctx \= runCtx.getStore();  
 routeCh.publish({ ...ctx, event, ...data, ts: Date.now() });  
}

Concrete recommendation: emit at least these events from the coordinator:

* `task.accepted`  
* `task.validated`  
* `route.selected`  
* `agent.dispatched`  
* `agent.stream.opened`  
* `agent.completed`  
* `agent.failed`  
* `task.cancelled`  
* `task.retried`  
* `task.deduped`

That is enough to reconstruct almost every production routing incident.

## **9\) File-system and patching pitfalls that matter in coding systems**

For a coding system, coordinator-routing usually ends up driving patch writes. Node’s `fsPromises.writeFile()` docs contain two big gotchas: it is unsafe to call it multiple times on the same file without waiting for settlement, and `AbortSignal` cancellation is only **best effort**—some data may still be written. Node also notes that the callback APIs use the thread pool and concurrent modifications on the same file can corrupt data.

So the concrete rule should be:

* serialize writes **per path**  
* write to temp file then rename for final commit  
* never treat abort as rollback  
* keep “proposed diff” separate from “applied diff”  
* make reviewer/tester agents consume the proposed diff artifact, not the live file tree, until apply is committed

If you do not do that, retries and cancellation will eventually leave the repo in a half-written state.

## **10\) Known coordinator-routing pitfalls**

These are the ones I would actively code around:

1. **God coordinator**: if the coordinator starts embedding prompt logic, tool execution, and UI behavior, it becomes impossible to reason about. Keep it to policy \+ transport \+ lifecycle.  
2. **Raw IPC exposure**: do not expose raw `ipcRenderer` or raw callback events into the renderer. Electron’s docs call this out as dangerous.  
3. **Blocking renderer**: `sendSync` blocks the whole renderer. Never use it for routing.  
4. **Lossy errors across `invoke`**: Electron documents that errors thrown through `ipcMain.handle()` are serialized and only the message survives to the renderer. Always send structured errors yourself.

function serializeError(err: unknown) {  
 const e \= err instanceof Error ? err : new Error(String(err));  
 return {  
   name: e.name,  
   message: e.message,  
   stack: e.stack,  
   code: (e as any).code,  
   cause: (e as any).cause,  
   retriable: isRetriable(e),  
 };  
}

5. **Structured clone surprises**: Electron IPC uses structured clone, so prototype chains are lost, and functions/promises/symbols/WeakMaps/WeakSets or special Electron objects will throw. Only send plain JSON-ish data plus explicit ports.  
6. **MessagePort lifecycle bugs**: on main side, call `port.start()`. Listen for `close`. Hold strong references until run completion. Electron notes ports may close if the remote end closes or is garbage-collected.  
7. **Hot-reload duplicate handlers**: in dev, re-registering `ipcMain.handle()` without cleanup causes confusing behavior. Use `ipcMain.removeHandler(channel)` before re-binding.

ipcMain.removeHandler('coord:startRun');  
ipcMain.handle('coord:startRun', startRunHandler);

8. **Wrong process choice**: Node’s docs are explicit that `worker_threads` help CPU-heavy JS, not I/O-heavy work. Use utility processes for isolation/crash containment; use workers for CPU transforms.  
9. **Wrong UI endpoint**: if you have multiple windows or frames, record the source `WebContents`/`frameId` when the run is created so results go back to the correct renderer endpoint. Electron exposes frame information in IPC/webContents docs.

## **11\) Concrete recommendations I would adopt immediately**

If I were hardening this codebase today, I would do these first:

* Put the coordinator in **main**, all heavy agents in **utility processes**, and leave renderer as UI-only.  
* Standardize on one transport contract: `invoke/handle` for control, `MessagePort` for streaming.  
* Add a typed `TaskEnvelope` and `RunEvent` schema with Zod 4 or JSON Schema 2020-12 \+ Ajv v8.  
* Make routing deterministic and registry-based; do not let agents directly re-route each other.  
* Add `deadlineAt`, `idempotencyKey`, `maxRetries`, `maxFanOut` to every task.  
* Use `AsyncLocalStorage` \+ `diagnostics_channel` for run correlation.  
* Stream subprocess output with `spawn`, not `exec`, for long test/lint jobs.  
* Serialize file writes per path and treat abort as non-atomic.  
* Set Electron security options explicitly even where defaults exist, so future maintainers cannot accidentally weaken them.

## **12\) Authoritative references**

These are the references I would keep open while implementing this domain:

* Electron process model / preload / utility process overview.  
* Electron IPC tutorial and APIs: `ipcMain`, `ipcRenderer`, `webContents.postMessage`.  
* Electron `MessageChannelMain` / `MessagePortMain` / MessagePorts tutorial.  
* Electron `utilityProcess` API.  
* Electron security and `contextBridge`.  
* Electron version support and current releases.  
* Node `AbortSignal`, `AsyncLocalStorage`, `diagnostics_channel`, `worker_threads`, `child_process`, `fs.writeFile`, `stream.pipeline`.  
* JSON Schema 2020-12, Ajv v8, Zod 4\.

If you want the next pass to be even more concrete, I can turn this into a **drop-in coordinator-routing skeleton** with actual file contents for `main`, `preload`, `renderer`, and `utility` modules.

