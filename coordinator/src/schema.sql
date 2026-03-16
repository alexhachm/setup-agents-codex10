-- mac10 coordinator schema
-- SQLite WAL mode for concurrent reads, serialized writes

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

-- User requests (replaces handoff.json)
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  tier INTEGER,  -- 1, 2, or 3 (set after triage)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','triaging','executing_tier1','decomposed','in_progress','integrating','completed','failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  result TEXT,  -- summary of outcome
  loop_id INTEGER REFERENCES loops(id)
);

-- Tasks decomposed from requests (replaces task-queue.json + worker-N.json)
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  domain TEXT,
  files TEXT,  -- JSON array of file paths
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),
  tier INTEGER NOT NULL DEFAULT 3,
  depends_on TEXT,  -- JSON array of task IDs
  assigned_to INTEGER REFERENCES workers(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','assigned','in_progress','completed','failed','blocked')),
  pr_url TEXT,
  branch TEXT,
  validation TEXT,  -- JSON: what checks to run
  overlap_with TEXT,  -- JSON array of task IDs sharing files
  routing_class TEXT,
  routed_model TEXT,
  model_source TEXT,
  reasoning_effort TEXT,
  browser_offload_status TEXT NOT NULL DEFAULT 'not_requested'
    CHECK (browser_offload_status IN (
      'not_requested',
      'requested',
      'queued',
      'launching',
      'attached',
      'running',
      'awaiting_callback',
      'completed',
      'failed',
      'cancelled'
    )),
  browser_session_id TEXT,
  browser_channel TEXT,
  browser_offload_payload TEXT,
  browser_offload_result TEXT,
  browser_offload_error TEXT,
  browser_offload_updated_at TEXT,
  usage_model TEXT,
  usage_payload_json TEXT,
  usage_input_tokens INTEGER,
  usage_output_tokens INTEGER,
  usage_input_audio_tokens INTEGER,
  usage_output_audio_tokens INTEGER,
  usage_reasoning_tokens INTEGER,
  usage_accepted_prediction_tokens INTEGER,
  usage_rejected_prediction_tokens INTEGER,
  usage_cached_tokens INTEGER,
  usage_cache_creation_tokens INTEGER,
  usage_cache_creation_ephemeral_5m_input_tokens INTEGER,
  usage_cache_creation_ephemeral_1h_input_tokens INTEGER,
  usage_total_tokens INTEGER,
  usage_cost_usd REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  result TEXT  -- outcome summary
);

-- Browser research batching: intents, staged plans, and per-intent fan-out
CREATE TABLE IF NOT EXISTS research_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT REFERENCES requests(id),
  task_id INTEGER REFERENCES tasks(id),
  intent_type TEXT NOT NULL DEFAULT 'browser_research',
  intent_payload TEXT NOT NULL,
  dedupe_fingerprint TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 500,
  batch_size_cap INTEGER NOT NULL DEFAULT 5 CHECK (batch_size_cap > 0),
  timeout_window_ms INTEGER NOT NULL DEFAULT 120000 CHECK (timeout_window_ms > 0),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','planned','running','completed','partial_failed','failed','cancelled')),
  latest_batch_id INTEGER REFERENCES research_batches(id),
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS research_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planner_key TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','running','completed','partial_failed','failed','timed_out','cancelled')),
  max_batch_size INTEGER NOT NULL CHECK (max_batch_size > 0),
  timeout_window_ms INTEGER NOT NULL CHECK (timeout_window_ms > 0),
  planned_intent_count INTEGER NOT NULL DEFAULT 0,
  sequence_cursor TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS research_batch_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES research_batches(id) ON DELETE CASCADE,
  intent_id INTEGER NOT NULL REFERENCES research_intents(id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL DEFAULT 'intent_execution',
  stage_order INTEGER NOT NULL DEFAULT 1,
  execution_order INTEGER NOT NULL,
  dedupe_fingerprint TEXT NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0,
  timeout_window_ms INTEGER NOT NULL CHECK (timeout_window_ms > 0),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','running','completed','partial_failed','failed','cancelled')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(batch_id, intent_id, stage_order)
);

CREATE TABLE IF NOT EXISTS research_intent_fanout (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id INTEGER NOT NULL REFERENCES research_intents(id) ON DELETE CASCADE,
  fanout_key TEXT NOT NULL,
  fanout_payload TEXT,
  planned_batch_id INTEGER REFERENCES research_batches(id) ON DELETE SET NULL,
  planned_stage_id INTEGER REFERENCES research_batch_stages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','planned','running','completed','partial_failed','failed','cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(intent_id, fanout_key)
);

-- Workers (replaces worker-status.json)
CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY,  -- worker number (1-8)
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle','assigned','running','busy','completed_task','resetting')),
  domain TEXT,
  worktree_path TEXT,
  branch TEXT,
  tmux_session TEXT,
  tmux_window TEXT,
  pid INTEGER,
  current_task_id INTEGER REFERENCES tasks(id),
  claimed_by TEXT,  -- 'architect' or NULL; prevents allocator race
  last_heartbeat TEXT,
  launched_at TEXT,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mail (replaces ALL signal files + IPC)
CREATE TABLE IF NOT EXISTS mail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,  -- 'architect', 'worker-N', 'coordinator', 'all'
  type TEXT NOT NULL,  -- 'new_request','triage_result','task_assigned','task_completed','heartbeat','clarification_ask','clarification_reply','nudge','terminate'
  payload TEXT NOT NULL DEFAULT '{}',  -- JSON
  consumed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Merge queue (new in mac10)
CREATE TABLE IF NOT EXISTS merge_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id),
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  pr_url TEXT NOT NULL,
  branch TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','merging','merged','conflict','failed')),
  priority INTEGER NOT NULL DEFAULT 0,  -- higher = merge first
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completion_checkpoint TEXT,
  merged_at TEXT,
  error TEXT
);

-- Activity log (replaces activity.log)
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,  -- 'coordinator','architect','worker-N','user'
  action TEXT NOT NULL,
  details TEXT,  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Config (coordinator settings)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Presets (saved project+repo combos)
CREATE TABLE IF NOT EXISTS presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  project_dir TEXT NOT NULL,
  github_repo TEXT NOT NULL DEFAULT '',
  num_workers INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Changes tracking (toggleable changelog items)
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  domain TEXT,            -- coordinator, gui, cli, infra, etc.
  file_path TEXT,         -- file that was modified
  function_name TEXT,     -- function that was improved
  tooltip TEXT,           -- detailed explanation of the change
  enabled INTEGER NOT NULL DEFAULT 1,  -- toggle on/off (1=on, 0=off)
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','pending_user_action')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Persistent autonomous loops
CREATE TABLE IF NOT EXISTS loops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','stopped','failed')),
  iteration_count INTEGER NOT NULL DEFAULT 0,
  last_checkpoint TEXT,
  tmux_session TEXT,
  tmux_window TEXT,
  pid INTEGER,
  last_heartbeat TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  stopped_at TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_request ON tasks(request_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_request_status ON tasks(request_id, status);
CREATE INDEX IF NOT EXISTS idx_research_intents_status_score
  ON research_intents(status, priority_score DESC, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_research_intents_active_dedupe
  ON research_intents(dedupe_fingerprint, intent_type)
  WHERE status IN ('queued','planned','running','partial_failed');
CREATE INDEX IF NOT EXISTS idx_research_batches_status
  ON research_batches(status, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_research_batch_stages_batch_status
  ON research_batch_stages(batch_id, status, execution_order ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_research_batch_stages_execution
  ON research_batch_stages(status, execution_order ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_research_intent_fanout_intent_status
  ON research_intent_fanout(intent_id, status, fanout_key);
CREATE INDEX IF NOT EXISTS idx_research_intent_fanout_retry
  ON research_intent_fanout(status, updated_at ASC, id ASC)
  WHERE status IN ('partial_failed','failed');
CREATE INDEX IF NOT EXISTS idx_mail_recipient ON mail(recipient, consumed);
CREATE INDEX IF NOT EXISTS idx_mail_type ON mail(type);
CREATE INDEX IF NOT EXISTS idx_mail_created ON mail(created_at);
CREATE INDEX IF NOT EXISTS idx_merge_queue_status ON merge_queue(status);
CREATE INDEX IF NOT EXISTS idx_merge_queue_request ON merge_queue(request_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_loop ON requests(loop_id) WHERE loop_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_overlap ON tasks(overlap_with) WHERE overlap_with IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_changes_domain ON changes(domain);
CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(status);
CREATE INDEX IF NOT EXISTS idx_loops_status ON loops(status);

-- Default config
INSERT OR IGNORE INTO config (key, value) VALUES
  ('max_workers', '8'),
  ('heartbeat_timeout_s', '60'),
  ('watchdog_interval_ms', '10000'),
  ('allocator_interval_ms', '2000'),
  ('research_planner_interval_ms', '5000'),
  ('research_batch_max_size', '5'),
  ('research_batch_timeout_ms', '120000'),
  ('research_batch_candidate_limit', '200'),
  ('merge_validation', 'true'),
  ('project_dir', ''),
  ('coordinator_version', '1.0.0');
