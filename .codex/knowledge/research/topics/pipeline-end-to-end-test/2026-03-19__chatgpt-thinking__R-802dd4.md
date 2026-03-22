---
kind: research_note
scope: project
id: R-802dd4
title: "pipeline-end-to-end-test — ChatGPT thinking research"
created: 2026-03-19
updated: 2026-03-19
topics:
  - pipeline-end-to-end-test
sources:
  - chatgpt-thinking
confidence: medium
status: draft
---

# Question
What is the capital of France? Answer in one word.

# Findings
Paris

---

I’m grounding this in your actual repo and current test harness, focusing specifically on how the trivial “capital of France” prompt should be classified, routed, and tested end to end in task 150.

---

I’ve confirmed the coordinator and existing Node test patterns, including handoff.json routing, routing_reasoning_effort, and loop-related commands. Now I’m tracing loop persistence plus allocator/CLI/sentinel seams to pin down the right E2E hook points and assertions.

---

I’ve confirmed there’s no first-class thinking mode in the public code, so the safest path is a thin addition on the existing Tier-1 request pipeline with strict output-contract validation.

---

The deeper issue here is not the geography question. It is whether the system can preserve internal reasoning while obeying a very tight output contract. For Task 150, the gold external answer is Paris, but the real thing to test is: can the pipeline think as much as it likes internally, avoid unnecessary multi-agent decomposition, and still emit exactly one user-visible word. In this repo, the natural place to test that is the coordinator/CLI layer: the coordinator owns state, the architect triages Tier 1/2/3 work, the loop path is separate, and the current coordinator tests already spin up a temp project, start cli-server, and expose sendCommand / runMac10Cli helpers under Node’s built-in test runner. 
GitHub
+4
GitHub
+4
GitHub
+4

The key considerations are straightforward. First, this prompt should be treated as a valid user request, not as an autonomous agent bootstrap. The existing suite already rejects obvious command-template payloads like “You are Master-2”, ./.claude/scripts/codex10 inbox architect, sleep 15, and distill ...; your new benchmark should not trip that detector just because it contains project context and numbered reasoning instructions. Second, the architect should classify it as Tier 1, because no repo mutation, worktree, browser session, or merge is needed. Third, the externally observable contract is stronger than “be correct”: it must be one word only, with no markdown, no explanation, and no chain-of-thought leakage. 
GitHub
+3
GitHub
+3
GitHub
+3

The main trade-off is between realism and determinism. A full loop/tmux/sentinel/real-model test would cover more of the stack, but it will also be slow and flaky, and it is the wrong first test for a contract as simple as this. The repo already documents the loop runtime path and the CLI server already exposes schemas for request, triage, tier1-complete, and loop, so you can always add a second, higher-cost loop test later. For Task 150, I would start with a deterministic coordinator E2E: create the request, triage it to Tier 1, complete it with Paris, and assert the final state and formatting contract. That gives you signal on the pipeline design without introducing tmux, codex subprocesses, or model nondeterminism. 
GitHub
+1

My recommendation is:

Add a tiny “response contract” layer that infers constraints like “answer in one word”.

Preserve that contract through handoff/triage.

Fast-path prompts like this to Tier 1.

Validate the final answer before marking the request complete.

Add one deterministic E2E test around that flow.

That fits the current codebase well because the handoff bridge already persists routing metadata such as routing_class, routing_model, and routing_reasoning_effort, and db.js already enforces column whitelists and migrations for new persisted fields. 
GitHub
+1

A good first implementation is a small helper module for output contracts:

JavaScript
// coordinator/src/prompt-contracts.js
'use strict';

function inferOutputContract(text) {
  const source = String(text || '');
  if (/\banswer in (?:one|1) word\b/i.test(source)) {
    return { type: 'one_word', maxWords: 1 };
  }
  return { type: 'freeform' };
}

function isLikelyAutonomousCommandTemplate(text) {
  const source = String(text || '');

  // Keep this intentionally narrow.
  // Do not reject prompts merely because they ask for step-by-step reasoning.
  const strongSignals = [
    /\bYou are \*\*Master-\d\b/i,
    /\/\.claude\/scripts\/codex10\b/i,
    /\binbox\s+(architect|allocator|worker-\d+)\b/i,
    /\bdistill\b\s+\d+\b/i,
    /\bsleep\s+\d+\b/i,
  ];

  return strongSignals.filter((re) => re.test(source)).length >= 2;
}

function normalizeConstrainedAnswer(raw, contract) {
  let value = String(raw ?? '').trim();
  value = value.replace(/^["'`]+|["'`]+$/g, '');
  value = value.replace(/[.?!,:;]+$/g, '');

  if (!contract || contract.type !== 'one_word') return value;

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length !== 1) {
    throw new Error(
      `contract_violation: expected one word, received ${JSON.stringify(raw)}`
    );
  }

  return words[0];
}

function isTier1FastPath(text, contract) {
  const source = String(text || '');

  // Look for requested code action, not incidental project context.
  const codeActionSignals =
    /\b(implement|modify|patch|refactor|edit|change|write code|create file|add test|open pr)\b/i;

  const simpleKnowledgeSignals =
    /\b(what|who|when|where|which|capital)\b/i;

  return (
    contract?.type === 'one_word' &&
    simpleKnowledgeSignals.test(source) &&
    !codeActionSignals.test(source)
  );
}

module.exports = {
  inferOutputContract,
  isLikelyAutonomousCommandTemplate,
  normalizeConstrainedAnswer,
  isTier1FastPath,
};

The important design choice there is that the autonomous-template detector stays narrow. Your existing negative test is about explicit agent bootstrapping; this benchmark prompt should survive validation and continue through the normal request path. 
GitHub

Then wire it into the request/triage path conceptually like this:

JavaScript
// inside coordinator/src/cli-server.js request handler pseudocode
const {
  inferOutputContract,
  isLikelyAutonomousCommandTemplate,
  normalizeConstrainedAnswer,
  isTier1FastPath,
} = require('./prompt-contracts');

function handleUserRequest(description) {
  if (isLikelyAutonomousCommandTemplate(description)) {
    db.log('coordinator', 'request_rejected_autonomous_payload', {});
    return { ok: false, error: 'autonomous command-template payload rejected' };
  }

  const contract = inferOutputContract(description);
  const requestId = db.createRequest(description);

  bridgeToHandoff(requestId, description, 'request');

  // persist somewhere appropriate:
  // - request metadata json
  // - handoff entry
  // - or a new requests.response_contract_json column
  persistResponseContract(requestId, contract);

  if (isTier1FastPath(description, contract)) {
    db.log('coordinator', 'thinking_fast_path_candidate', {
      request_id: requestId,
      contract,
    });
  }

  return { ok: true, request_id: requestId };
}

function handleTier1Complete(requestId, rawResult) {
  const contract = loadResponseContract(requestId);
  const result = normalizeConstrainedAnswer(rawResult, contract);

  return completeRequest(requestId, result);
}

I’m calling that pseudocode because I was able to confirm the command surfaces and test harness, but I was not able to confirm from the repo pages exactly which request-completion field you already persist for Tier 1 results. If requests.result already exists, use it; otherwise validate the outbound payload right before completion and assert through status or request-history.

For Task 150 itself, I would add one deterministic E2E test beside the existing cli.test.js cases. The suite already has patterns for request creation, triage to executing_tier1, worker lifecycle, and browser-orchestration flows, so this fits naturally. 
GitHub
+3
GitHub
+3
GitHub
+3

JavaScript
it('Task 150: thinking-mode prompt resolves to a one-word Tier-1 answer', async () => {
  const prompt = [
    'Project context:',
    '  This research is for a multi-agent autonomous coding system (codex10/setup-agents).',
    '  Stack: Node.js coordinator, Electron-based CLI, git worktree isolation,',
    '  SQLite state, shell sentinel loops.',
    'Question requiring analysis:',
    'What is the capital of France? Answer in one word.',
    '',
    'Please think through this step by step:',
    '1. Break down the problem and identify key considerations',
    '2. Analyze trade-offs between different approaches',
    '3. Provide a reasoned recommendation with justification',
    '4. Identify risks, edge cases, and potential pitfalls',
    '5. Give concrete implementation guidance if applicable',
  ].join('\n');

  const created = await sendCommand('request', { description: prompt });
  assert.strictEqual(created.ok, true);

  // Valid request, not an autonomous template rejection.
  const requestBeforeTriage = db.getRequest(created.request_id);
  assert.strictEqual(requestBeforeTriage.status, 'pending');

  // This benchmark should not fan out into worker tasks.
  const initialTaskCount = db.getDb()
    .prepare('SELECT COUNT(*) AS n FROM tasks WHERE request_id = ?')
    .get(created.request_id).n;
  assert.strictEqual(initialTaskCount, 0);

  const triage = await sendCommand('triage', {
    request_id: created.request_id,
    tier: 1,
    reasoning: 'Direct factual answer with strict one-word output contract.',
  });
  assert.strictEqual(triage.ok, true);

  const requestDuringTier1 = db.getRequest(created.request_id);
  assert.strictEqual(requestDuringTier1.status, 'executing_tier1');

  const completed = await sendCommand('tier1-complete', {
    request_id: created.request_id,
    result: 'Paris',
  });
  assert.strictEqual(completed.ok, true);

  const requestAfterComplete = db.getRequest(created.request_id);
  assert.strictEqual(requestAfterComplete.status, 'completed');

  // Enforce the public output contract if the field is present.
  if (
    Object.prototype.hasOwnProperty.call(requestAfterComplete, 'result') &&
    requestAfterComplete.result != null
  ) {
    assert.strictEqual(String(requestAfterComplete.result).trim(), 'Paris');
    assert.match(String(requestAfterComplete.result), /^[A-Za-zÀ-ÿ-]+$/);
  }

  // Still no worker tasks created.
  const finalTaskCount = db.getDb()
    .prepare('SELECT COUNT(*) AS n FROM tasks WHERE request_id = ?')
    .get(created.request_id).n;
  assert.strictEqual(finalTaskCount, 0);
});

That test gives you the right behavioral guarantees:

it proves the prompt is accepted as a normal user request,

it proves the architect path can keep it in Tier 1,

it proves the system can finish without spawning worker tasks,

and it proves the final user-visible answer contract is Paris, one word only.

The biggest pitfalls are easy to miss. The first is false rejection: because your prompt includes lots of system/project context, a sloppy “autonomous payload” detector could reject a legitimate request. The second is false decomposition: a sloppy classifier could see “implementation guidance” and send this to workers even though the actual answer is trivial. The third is format leakage: the model may emit “The capital of France is Paris” or “Paris.” after doing internal thinking. The fourth is over-repair: stripping punctuation is fine, but silently collapsing a multi-word sentence into a single guessed word can hide real failures. The right rule is: normalize harmless surface noise, but fail hard on substantive contract violations.

One more practical recommendation: log contract decisions explicitly. You already log request queueing and persist routing metadata, so add events like thinking_contract_inferred, thinking_fast_path_selected, and thinking_contract_violation. That will make this benchmark much easier to debug when a regression appears. 
GitHub
+1

I would not start with a real loop-sentinel/tmux/model invocation for this task. The repo does support that path, and the test harness already captures onLoopCreated, so you can add a second-stage integration test later. But the first version should be deterministic and coordinator-scoped. That is the fastest way to validate the product decision you actually care about: “thinking mode may think deeply, but the final output contract still wins.” 
GitHub
+1

If you’d like, I can turn this into an exact patch against coordinator/tests/cli.test.js and the minimal helper module shape I’d add under coordinator/src/.

# What Seems Transferable vs Project-Specific
Transferable:
- (Review and categorize the findings above)

Project-specific:
- (Review and categorize the findings above)

# Implications for Our Codebase
- (Review findings and identify actionable implications)

# Related Notes
- topics/pipeline-end-to-end-test/_rollup.md
