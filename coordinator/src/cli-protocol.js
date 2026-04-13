'use strict';

const COMMAND_SCHEMAS = {
  'request':           { required: ['description'], types: { description: 'string' } },
  'fix':               { required: ['description'], types: { description: 'string' } },
  'status':            { required: [], types: {} },
  'clarify':           { required: ['request_id', 'message'], types: { request_id: 'string', message: 'string' } },
  'log':               { required: [], types: { limit: 'number', actor: 'string' } },
  'request-history':   { required: ['request_id'], types: { request_id: 'string', limit: 'number' } },
  'triage':            { required: ['request_id', 'tier'], types: { request_id: 'string', tier: 'number', reasoning: 'string' } },
  'create-task':       {
    required: ['request_id', 'subject', 'description'],
    types: { request_id: 'string', subject: 'string', description: 'string', domain: 'string', priority: 'string', tier: 'number', needs_sandbox: 'number' },
    allowed: ['request_id', 'subject', 'description', 'domain', 'files', 'priority', 'tier', 'depends_on', 'validation', 'needs_sandbox'],
  },
  'tier1-complete':    { required: ['request_id', 'result'], types: { request_id: 'string', result: 'string' } },
  'ask-clarification': { required: ['request_id', 'question'], types: { request_id: 'string', question: 'string' } },
  'my-task':           { required: ['worker_id'], types: { worker_id: 'string' } },
  'task-context':      { required: ['task_id'], types: { task_id: 'number' } },
  'context-bundle':    { required: ['task_id'], types: { task_id: 'number' } },
  'start-task':        { required: ['worker_id', 'task_id'], types: { worker_id: 'string' } },
  'heartbeat':         { required: ['worker_id'], types: { worker_id: 'string' } },
  'complete-task':     { required: ['worker_id', 'task_id'], types: { worker_id: 'string', usage: 'object' } },
  'fail-task':         { required: ['worker_id', 'task_id', 'error'], types: { worker_id: 'string', error: 'string', usage: 'object' } },
  'browser-create-session': {
    required: ['task_id', 'workflow_url', 'idempotency_key'],
    types: { task_id: 'number', workflow_url: 'string', idempotency_key: 'string', channel: 'string' },
  },
  'browser-attach-session': {
    required: ['task_id', 'session_id', 'idempotency_key'],
    types: { task_id: 'number', session_id: 'string', idempotency_key: 'string', channel: 'string' },
  },
  'browser-start-job': {
    required: ['task_id', 'session_id', 'workflow_url', 'guidance', 'idempotency_key'],
    types: {
      task_id: 'number',
      session_id: 'string',
      workflow_url: 'string',
      guidance: 'string',
      idempotency_key: 'string',
    },
  },
  'browser-callback-chunk': {
    required: ['task_id', 'session_id', 'job_id', 'callback_token', 'idempotency_key', 'chunk_index', 'chunk'],
    types: {
      task_id: 'number',
      session_id: 'string',
      job_id: 'string',
      callback_token: 'string',
      idempotency_key: 'string',
      chunk_index: 'number',
      chunk: 'string',
    },
  },
  'browser-complete-job': {
    required: ['task_id', 'session_id', 'job_id', 'callback_token', 'idempotency_key'],
    types: {
      task_id: 'number',
      session_id: 'string',
      job_id: 'string',
      callback_token: 'string',
      idempotency_key: 'string',
    },
  },
  'browser-fail-job': {
    required: ['task_id', 'session_id', 'job_id', 'callback_token', 'idempotency_key', 'error'],
    types: {
      task_id: 'number',
      session_id: 'string',
      job_id: 'string',
      callback_token: 'string',
      idempotency_key: 'string',
      error: 'string',
    },
  },
  'browser-job-status': {
    required: ['task_id', 'session_id', 'job_id'],
    types: { task_id: 'number', session_id: 'string', job_id: 'string' },
  },
  'distill':           { required: ['worker_id'], types: { worker_id: 'string' } },
  'inbox':             { required: ['recipient'], types: { recipient: 'string', peek: 'boolean', type: 'string', request_id: 'string' } },
  'inbox-block':       { required: ['recipient'], types: { recipient: 'string', timeout: 'number', peek: 'boolean', type: 'string', request_id: 'string' } },
  'ready-tasks':       { required: [], types: {} },
  'assign-task':       { required: ['task_id', 'worker_id'], types: { task_id: 'number', worker_id: 'number' } },
  'claim-worker':      { required: ['worker_id', 'claimer'], types: { worker_id: 'number', claimer: 'string' } },
  'release-worker':    { required: ['worker_id'], types: { worker_id: 'number' } },
  'worker-status':     { required: [], types: {} },
  'check-completion':  { required: ['request_id'], types: { request_id: 'string' } },
  'replan-dependency': { required: ['from_task_id', 'to_task_id'], types: { from_task_id: 'number', to_task_id: 'number', request_id: 'string' } },
  'task-sandbox-create': {
    required: ['task_id'],
    types: {
      task_id: 'number',
      worker_id: 'number',
      backend: 'string',
      sandbox_name: 'string',
      sandbox_path: 'string',
      worktree_path: 'string',
      branch: 'string',
      metadata: 'object',
    },
  },
  'task-sandbox-status': {
    required: [],
    types: { id: 'number', task_id: 'number', worker_id: 'number', status: 'string' },
  },
  'task-sandbox-ready': {
    required: ['id'],
    types: { id: 'number', backend: 'string', sandbox_name: 'string', sandbox_path: 'string', worktree_path: 'string', branch: 'string', metadata: 'object' },
  },
  'task-sandbox-start': {
    required: ['id'],
    types: { id: 'number', backend: 'string', sandbox_name: 'string', sandbox_path: 'string', worktree_path: 'string', branch: 'string', metadata: 'object' },
  },
  'task-sandbox-stop': {
    required: ['id'],
    types: { id: 'number', error: 'string', metadata: 'object' },
  },
  'task-sandbox-fail': {
    required: ['id', 'error'],
    types: { id: 'number', error: 'string', metadata: 'object' },
  },
  'task-sandbox-clean': {
    required: ['id'],
    types: { id: 'number', metadata: 'object' },
  },
  'task-sandbox-cleanup': {
    required: [],
    types: { max_age_minutes: 'number', dry_run: 'boolean' },
  },
  'register-worker':   { required: ['worker_id'], types: { worker_id: 'string', worktree_path: 'string', branch: 'string' } },
  'repair':            { required: [], types: {} },
  'purge-tasks':       { required: [], types: { status: 'string' } },
  'ping':              { required: [], types: {} },
  'health-check':      { required: [], types: {} },
  'add-worker':        { required: [], types: {} },
  'merge-status':      { required: [], types: { request_id: 'string' } },
  'reset-worker':      { required: ['worker_id'], types: { worker_id: 'string' } },
  'check-overlaps':    { required: ['request_id'], types: { request_id: 'string' } },
  'log-change':        {
    required: ['description'],
    types: { description: 'string', domain: 'string', file_path: 'string', function_name: 'string', tooltip: 'string', status: 'string' },
    allowed: ['description', 'domain', 'file_path', 'function_name', 'tooltip', 'status'],
  },
  'list-changes':      { required: [], types: { domain: 'string', status: 'string' } },
  'update-change':     { required: ['id'], types: { id: 'number' } },
  'integrate':         { required: ['request_id'], types: { request_id: 'string', retry_terminal: 'boolean', force_retry: 'boolean' } },
  'loop':              { required: ['prompt'], types: { prompt: 'string' } },
  'stop-loop':         { required: ['loop_id'], types: { loop_id: 'number' } },
  'loop-status':       { required: [], types: {} },
  'loop-checkpoint':   { required: ['loop_id', 'summary'], types: { loop_id: 'number', summary: 'string' } },
  'loop-heartbeat':    { required: ['loop_id'], types: { loop_id: 'number' } },
  'set-config':        { required: ['key', 'value'], types: { key: 'string', value: 'string' } },
  'loop-prompt':       { required: ['loop_id'], types: { loop_id: 'number' } },
  'loop-refresh-prompt': { required: ['loop_id', 'prompt'], types: { loop_id: 'number', prompt: 'string' } },
  'loop-set-prompt':   { required: ['loop_id', 'prompt'], types: { loop_id: 'number', prompt: 'string' } },
  'loop-request':      { required: ['loop_id', 'description'], types: { loop_id: 'number', description: 'string' } },
  'loop-requests':     { required: ['loop_id'], types: { loop_id: 'number' } },
  'queue-research':      {
    required: ['topic', 'question'],
    types: { topic: 'string', question: 'string', mode: 'string', priority: 'string', context: 'string', source_agent: 'string', source_task_id: 'number' },
  },
  'sandbox-provider-smoke': {
    required: [],
    types: { provider: 'string', run_actual: 'boolean', build: 'boolean' },
  },
  'research-status':     { required: [], types: { topic: 'string', status: 'string', limit: 'number' } },
  'research-requeue-stale': { required: [], types: { max_age_minutes: 'number' } },
  'research-start':      { required: ['id'], types: { id: 'number' } },
  'research-complete':   { required: ['intent_id'], types: { intent_id: 'number', note_path: 'string' } },
  'research-fail':       { required: ['intent_id'], types: { intent_id: 'number', error: 'string' } },
  'research-next':       { required: [], types: {} },
  'research-gaps':       { required: [], types: {} },
  'research-retry-failed': { required: [], types: { topic: 'string', include_running: 'boolean' } },
  'fill-knowledge':      { required: [], types: {} },
  'analyze-domain':        { required: ['domain'], types: { domain: 'string' } },
  'domain-analysis':       { required: ['id'], types: { id: 'number' } },
  'domain-analyses':       { required: [], types: { domain: 'string', status: 'string', limit: 'number' } },
  'approve-domain':        { required: ['id'], types: { id: 'number', feedback: 'string' } },
  'reject-domain':         { required: ['id'], types: { id: 'number', feedback: 'string' } },
  'submit-domain-draft':   { required: ['id'], types: { id: 'number', review_sheet: 'string', draft_payload: 'string', analyzed_files: 'string' } },
  'create-research-topic': { required: ['title', 'description'], types: { title: 'string', description: 'string', category: 'string', discovery_source: 'string', loop_id: 'number', tags: 'string' } },
  'research-topic':        { required: ['id'], types: { id: 'number' } },
  'research-topics':       { required: [], types: { review_status: 'string', category: 'string', loop_id: 'number', limit: 'number' } },
  'review-research-topic': { required: ['id', 'review_status'], types: { id: 'number', review_status: 'string', notes: 'string' } },
  'pending-reviews':       { required: [], types: { limit: 'number' } },
  'memory-snapshots': {
    required: [],
    types: {
      project_context_key: 'string',
      request_id: 'string',
      task_id: 'number',
      run_id: 'string',
      validation_status: 'string',
      min_relevance_score: 'number',
      limit: 'number',
      offset: 'number',
    },
  },
  'memory-snapshot': {
    required: ['id'],
    types: { id: 'number', include_lineage: 'boolean' },
  },
  'memory-insights': {
    required: [],
    types: {
      project_context_key: 'string',
      snapshot_id: 'number',
      artifact_type: 'string',
      request_id: 'string',
      task_id: 'number',
      run_id: 'string',
      validation_status: 'string',
      min_relevance_score: 'number',
      limit: 'number',
      offset: 'number',
    },
  },
  'memory-insight': {
    required: ['id'],
    types: { id: 'number', include_lineage: 'boolean' },
  },
  'memory-lineage': {
    required: [],
    types: {
      snapshot_id: 'number',
      insight_artifact_id: 'number',
      request_id: 'string',
      task_id: 'number',
      run_id: 'string',
      lineage_type: 'string',
      limit: 'number',
      offset: 'number',
    },
  },
};

function validateCommand(cmd, hooks = {}) {
  const { command, args } = cmd;
  if (typeof command !== 'string') {
    throw new Error('Missing or invalid "command" field');
  }
  const schema = COMMAND_SCHEMAS[command];
  if (!schema) return;

  const a = args || {};
  for (const field of schema.required) {
    if (a[field] === undefined || a[field] === null) {
      throw new Error(`Missing required field "${field}" for command "${command}"`);
    }
  }
  for (const [field, expectedType] of Object.entries(schema.types)) {
    if (a[field] !== undefined && a[field] !== null && typeof a[field] !== expectedType) {
      throw new Error(`Field "${field}" must be of type ${expectedType}`);
    }
  }
  if (schema.allowed && args) {
    for (const key of Object.keys(args)) {
      if (!schema.allowed.includes(key)) {
        delete args[key];
      }
    }
  }

  if (
    command === 'create-task' &&
    Object.prototype.hasOwnProperty.call(a, 'domain') &&
    typeof hooks.normalizeTaskDomain === 'function'
  ) {
    const normalizedDomain = hooks.normalizeTaskDomain(a.domain);
    if (normalizedDomain) a.domain = normalizedDomain;
    else delete a.domain;
  }
  if (
    (command === 'complete-task' || command === 'fail-task') &&
    Object.prototype.hasOwnProperty.call(a, 'usage') &&
    typeof hooks.normalizeCompleteTaskUsagePayload === 'function'
  ) {
    a.usage = hooks.normalizeCompleteTaskUsagePayload(a.usage);
  }
}

module.exports = { COMMAND_SCHEMAS, validateCommand };
