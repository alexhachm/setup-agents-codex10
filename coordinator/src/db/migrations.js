'use strict';

const fs = require('fs');
const path = require('path');

function getTableNames(database) {
  return database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((table) => table.name);
}

function getColumnNames(database, tableName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

function ensureMergeQueueColumns(database) {
  const mergeCols = database.prepare("PRAGMA table_info(merge_queue)").all().map((column) => column.name);
  if (mergeCols.length === 0) return;

  if (!mergeCols.includes('updated_at')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN updated_at TEXT");
  }
  if (!mergeCols.includes('completion_checkpoint')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN completion_checkpoint TEXT");
  }

  if (mergeCols.includes('created_at')) {
    database.exec("UPDATE merge_queue SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL");
    database.exec("UPDATE merge_queue SET completion_checkpoint = COALESCE(completion_checkpoint, updated_at, created_at, datetime('now')) WHERE completion_checkpoint IS NULL");
    return;
  }
  database.exec("UPDATE merge_queue SET updated_at = COALESCE(updated_at, datetime('now')) WHERE updated_at IS NULL");
  database.exec("UPDATE merge_queue SET completion_checkpoint = COALESCE(completion_checkpoint, updated_at, datetime('now')) WHERE completion_checkpoint IS NULL");
}

function ensureMergeIdentityColumns(database) {
  const mergeCols = database.prepare("PRAGMA table_info(merge_queue)").all().map((column) => column.name);
  if (mergeCols.length === 0) return;

  if (!mergeCols.includes('head_sha')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN head_sha TEXT");
  }
  if (!mergeCols.includes('worker_id')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN worker_id INTEGER");
  }
  if (!mergeCols.includes('failure_class')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN failure_class TEXT");
  }
  if (!mergeCols.includes('retry_count')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!mergeCols.includes('fingerprint')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN fingerprint TEXT");
  }
  if (!mergeCols.includes('last_fingerprint_at')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN last_fingerprint_at TEXT");
  }
}

function ensureTaskRoutingTelemetryColumns(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('routing_class')) {
    database.exec("ALTER TABLE tasks ADD COLUMN routing_class TEXT");
  }
  if (!taskCols.includes('routed_model')) {
    database.exec("ALTER TABLE tasks ADD COLUMN routed_model TEXT");
  }
  if (!taskCols.includes('model_source')) {
    database.exec("ALTER TABLE tasks ADD COLUMN model_source TEXT");
  }
  if (!taskCols.includes('reasoning_effort')) {
    database.exec("ALTER TABLE tasks ADD COLUMN reasoning_effort TEXT");
  }
}

function ensureTaskLivenessRecoveryColumns(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('liveness_reassign_count')) {
    database.exec("ALTER TABLE tasks ADD COLUMN liveness_reassign_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!taskCols.includes('liveness_last_reassign_at')) {
    database.exec("ALTER TABLE tasks ADD COLUMN liveness_last_reassign_at TEXT");
  }
  if (!taskCols.includes('liveness_last_reassign_reason')) {
    database.exec("ALTER TABLE tasks ADD COLUMN liveness_last_reassign_reason TEXT");
  }
}

function ensureTaskUsageTelemetryColumns(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('usage_model')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_model TEXT");
  }
  if (!taskCols.includes('usage_payload_json')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_payload_json TEXT");
  }
  if (!taskCols.includes('usage_input_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_input_tokens INTEGER");
  }
  if (!taskCols.includes('usage_output_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_output_tokens INTEGER");
  }
  if (!taskCols.includes('usage_input_audio_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_input_audio_tokens INTEGER");
  }
  if (!taskCols.includes('usage_output_audio_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_output_audio_tokens INTEGER");
  }
  if (!taskCols.includes('usage_reasoning_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_reasoning_tokens INTEGER");
  }
  if (!taskCols.includes('usage_accepted_prediction_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_accepted_prediction_tokens INTEGER");
  }
  if (!taskCols.includes('usage_rejected_prediction_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_rejected_prediction_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cached_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cached_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cache_creation_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cache_creation_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cache_creation_ephemeral_5m_input_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cache_creation_ephemeral_5m_input_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cache_creation_ephemeral_1h_input_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cache_creation_ephemeral_1h_input_tokens INTEGER");
  }
  if (!taskCols.includes('usage_total_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_total_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cost_usd')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cost_usd REAL");
  }
}

function ensureTaskExtendedStatuses(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('blocking')) {
    database.exec("ALTER TABLE tasks ADD COLUMN blocking INTEGER NOT NULL DEFAULT 1");
  }

  const schemaSql = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'"
  ).get();
  if (!schemaSql || !schemaSql.sql) return;
  if (schemaSql.sql.includes('superseded')) return;

  const colDefs = database.prepare("PRAGMA table_info(tasks)").all();
  const colNames = colDefs.map(c => c.name);

  const newCheck = "('pending','ready','assigned','in_progress','completed','failed','blocked','superseded','failed_needs_reroute','failed_final')";
  database.exec('PRAGMA foreign_keys = OFF');
  const tx = database.transaction(() => {
    database.exec(`CREATE TABLE tasks_migrate AS SELECT ${colNames.map(c => '"' + c + '"').join(', ')} FROM tasks`);
    database.exec('DROP TABLE tasks');

    let newSql = schemaSql.sql.replace(
      /CHECK\s*\(\s*status\s+IN\s*\([^)]+\)\s*\)/i,
      `CHECK (status IN ${newCheck})`
    );
    if (!newSql.includes('blocking')) {
      newSql = newSql.replace(/needs_sandbox\s+INTEGER[^,)]*/, '$&,\n  blocking INTEGER NOT NULL DEFAULT 1');
    }
    database.exec(newSql);
    database.exec(`INSERT INTO tasks SELECT ${colNames.map(c => '"' + c + '"').join(', ')} FROM tasks_migrate`);
    database.exec('DROP TABLE tasks_migrate');
  });
  tx();
  database.exec('PRAGMA foreign_keys = ON');
}

function ensureTaskBrowserOffloadColumns(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('browser_offload_status')) {
    database.exec(`
      ALTER TABLE tasks ADD COLUMN browser_offload_status TEXT
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
      ))
      DEFAULT 'not_requested'
    `);
  }
  if (!taskCols.includes('browser_session_id')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_session_id TEXT");
  }
  if (!taskCols.includes('browser_channel')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_channel TEXT");
  }
  if (!taskCols.includes('browser_offload_payload')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_offload_payload TEXT");
  }
  if (!taskCols.includes('browser_offload_result')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_offload_result TEXT");
  }
  if (!taskCols.includes('browser_offload_error')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_offload_error TEXT");
  }
  if (!taskCols.includes('browser_offload_updated_at')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_offload_updated_at TEXT");
  }

  database.exec(`
    UPDATE tasks
    SET browser_offload_status = COALESCE(browser_offload_status, 'not_requested')
    WHERE browser_offload_status IS NULL
  `);
}

function ensureTaskMergeHistoryColumn(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;
  if (!taskCols.includes('merge_history')) {
    database.exec("ALTER TABLE tasks ADD COLUMN merge_history TEXT");
  }
}

function ensureTaskSandboxLifecycleSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS task_sandboxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      request_id TEXT REFERENCES requests(id),
      worker_id INTEGER REFERENCES workers(id),
      backend TEXT NOT NULL DEFAULT 'pending'
        CHECK (backend IN ('pending','tmux','docker','sandbox','none')),
      status TEXT NOT NULL DEFAULT 'allocated'
        CHECK (status IN ('allocated','preparing','ready','running','stopped','failed','cleaned')),
      sandbox_name TEXT,
      sandbox_path TEXT,
      worktree_path TEXT,
      branch TEXT,
      metadata TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      stopped_at TEXT,
      cleaned_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_sandboxes_task
      ON task_sandboxes(task_id, status);
    CREATE INDEX IF NOT EXISTS idx_task_sandboxes_worker
      ON task_sandboxes(worker_id, status) WHERE worker_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_task_sandboxes_one_active_task
      ON task_sandboxes(task_id)
      WHERE status NOT IN ('failed','cleaned');
  `);
}

function ensureResearchBatchingSchema(database, defaults = {}) {
  const {
    researchBatchSizeCap = 5,
    researchTimeoutWindowMs = 120000,
    researchCandidateLimit = 200,
  } = defaults;
  database.exec(`
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
  `);

  database.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run(
    'research_planner_interval_ms',
    '5000'
  );
  database.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run(
    'research_batch_max_size',
    String(researchBatchSizeCap)
  );
  database.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run(
    'research_batch_timeout_ms',
    String(researchTimeoutWindowMs)
  );
  database.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run(
    'research_batch_candidate_limit',
    String(researchCandidateLimit)
  );
}

function ensureProjectMemoryPersistenceSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_memory_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_context_key TEXT NOT NULL,
      snapshot_version INTEGER NOT NULL CHECK (snapshot_version > 0),
      iteration INTEGER NOT NULL DEFAULT 1 CHECK (iteration > 0),
      parent_snapshot_id INTEGER REFERENCES project_memory_snapshots(id) ON DELETE SET NULL,
      snapshot_payload TEXT NOT NULL,
      dedupe_fingerprint TEXT NOT NULL,
      relevance_score REAL NOT NULL DEFAULT 0,
      request_id TEXT REFERENCES requests(id),
      task_id INTEGER REFERENCES tasks(id),
      run_id TEXT,
      source TEXT,
      confidence_score REAL CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
      validation_status TEXT NOT NULL DEFAULT 'unvalidated'
        CHECK (validation_status IN ('unvalidated','pending','validated','rejected','superseded')),
      retention_policy TEXT NOT NULL DEFAULT 'retain',
      retention_until TEXT,
      governance_metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_context_key, snapshot_version)
    );

    CREATE TABLE IF NOT EXISTS project_memory_snapshot_index (
      project_context_key TEXT PRIMARY KEY,
      latest_snapshot_id INTEGER NOT NULL REFERENCES project_memory_snapshots(id) ON DELETE CASCADE,
      latest_snapshot_version INTEGER NOT NULL CHECK (latest_snapshot_version > 0),
      latest_iteration INTEGER NOT NULL DEFAULT 1 CHECK (latest_iteration > 0),
      latest_snapshot_created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insight_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_context_key TEXT NOT NULL,
      snapshot_id INTEGER REFERENCES project_memory_snapshots(id) ON DELETE SET NULL,
      artifact_type TEXT NOT NULL DEFAULT 'research_insight',
      artifact_key TEXT,
      artifact_version INTEGER NOT NULL DEFAULT 1 CHECK (artifact_version > 0),
      artifact_payload TEXT NOT NULL,
      dedupe_fingerprint TEXT NOT NULL,
      relevance_score REAL NOT NULL DEFAULT 0,
      request_id TEXT REFERENCES requests(id),
      task_id INTEGER REFERENCES tasks(id),
      run_id TEXT,
      source TEXT,
      confidence_score REAL CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
      validation_status TEXT NOT NULL DEFAULT 'unvalidated'
        CHECK (validation_status IN ('unvalidated','pending','validated','rejected','superseded')),
      retention_policy TEXT NOT NULL DEFAULT 'retain',
      retention_until TEXT,
      governance_metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_context_key, artifact_type, dedupe_fingerprint, artifact_version)
    );

    CREATE TABLE IF NOT EXISTS project_memory_lineage_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER REFERENCES project_memory_snapshots(id) ON DELETE CASCADE,
      insight_artifact_id INTEGER REFERENCES insight_artifacts(id) ON DELETE CASCADE,
      request_id TEXT REFERENCES requests(id),
      task_id INTEGER REFERENCES tasks(id),
      run_id TEXT,
      lineage_type TEXT NOT NULL DEFAULT 'origin'
        CHECK (lineage_type IN ('origin','derived_from','supports','supersedes','validated_by','consumed_by')),
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (snapshot_id IS NOT NULL OR insight_artifact_id IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_project_memory_snapshots_context_version
      ON project_memory_snapshots(project_context_key, snapshot_version DESC, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_project_memory_snapshots_dedupe
      ON project_memory_snapshots(project_context_key, dedupe_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_project_memory_snapshots_lineage
      ON project_memory_snapshots(request_id, task_id, run_id);
    CREATE INDEX IF NOT EXISTS idx_insight_artifacts_context_relevance
      ON insight_artifacts(project_context_key, relevance_score DESC, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_insight_artifacts_dedupe
      ON insight_artifacts(project_context_key, artifact_type, dedupe_fingerprint, artifact_version DESC);
    CREATE INDEX IF NOT EXISTS idx_insight_artifacts_lineage
      ON insight_artifacts(request_id, task_id, run_id, validation_status);
    CREATE INDEX IF NOT EXISTS idx_project_memory_lineage_snapshot
      ON project_memory_lineage_links(snapshot_id, created_at DESC, id DESC)
      WHERE snapshot_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_project_memory_lineage_insight
      ON project_memory_lineage_links(insight_artifact_id, created_at DESC, id DESC)
      WHERE insight_artifact_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_project_memory_lineage_request_task_run
      ON project_memory_lineage_links(request_id, task_id, run_id, lineage_type);
  `);
}

function ensureBrowserOffloadPersistenceSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS browser_sessions (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'initializing'
        CHECK (status IN ('initializing','active','idle','expiring','expired','terminated')),
      auth_token TEXT,
      session_token TEXT,
      auth_expires_at TEXT,
      session_expires_at TEXT,
      safety_policy TEXT NOT NULL DEFAULT 'standard'
        CHECK (safety_policy IN ('standard','restricted','permissive')),
      safety_policy_state TEXT,
      task_id INTEGER REFERENCES tasks(id),
      request_id TEXT REFERENCES requests(id),
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      terminated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS browser_research_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES browser_sessions(id),
      task_id INTEGER REFERENCES tasks(id),
      request_id TEXT REFERENCES requests(id),
      job_type TEXT NOT NULL DEFAULT 'research'
        CHECK (job_type IN ('research','navigation','extraction')),
      query TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','queued','running','awaiting_callback','completed','failed','cancelled')),
      result_payload TEXT,
      error TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS browser_callback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES browser_research_jobs(id),
      session_id TEXT REFERENCES browser_sessions(id),
      event_type TEXT NOT NULL
        CHECK (event_type IN ('result','progress','error','heartbeat')),
      event_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_browser_sessions_owner
      ON browser_sessions(owner, status);
    CREATE INDEX IF NOT EXISTS idx_browser_sessions_task
      ON browser_sessions(task_id) WHERE task_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_browser_research_jobs_session
      ON browser_research_jobs(session_id, status);
    CREATE INDEX IF NOT EXISTS idx_browser_research_jobs_task
      ON browser_research_jobs(task_id) WHERE task_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_browser_research_jobs_status
      ON browser_research_jobs(status, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_browser_callback_events_job
      ON browser_callback_events(job_id, id ASC);
    CREATE INDEX IF NOT EXISTS idx_browser_callback_events_cursor
      ON browser_callback_events(job_id, id ASC, event_type);
  `);
}

function ensurePresetModelColumns(database) {
  const presetCols = database.prepare("PRAGMA table_info(presets)").all().map((c) => c.name);
  if (presetCols.length === 0) return;
  if (!presetCols.includes('provider')) {
    database.exec("ALTER TABLE presets ADD COLUMN provider TEXT");
  }
  if (!presetCols.includes('fast_model')) {
    database.exec("ALTER TABLE presets ADD COLUMN fast_model TEXT");
  }
  if (!presetCols.includes('deep_model')) {
    database.exec("ALTER TABLE presets ADD COLUMN deep_model TEXT");
  }
  if (!presetCols.includes('economy_model')) {
    database.exec("ALTER TABLE presets ADD COLUMN economy_model TEXT");
  }
}

function runPreSchemaMigrations(database) {
  const existingTables = getTableNames(database);
  if (existingTables.includes('workers')) {
    const cols = getColumnNames(database, 'workers');
    if (!cols.includes('claimed_by')) {
      database.exec("ALTER TABLE workers ADD COLUMN claimed_by TEXT");
    }
    if (!cols.includes('claimed_at')) {
      database.exec("ALTER TABLE workers ADD COLUMN claimed_at TEXT");
    }
    database.exec("UPDATE workers SET claimed_at = NULL WHERE claimed_by IS NULL AND claimed_at IS NOT NULL");
    database.exec("UPDATE workers SET claimed_at = COALESCE(claimed_at, datetime('now')) WHERE claimed_by IS NOT NULL");
    if (!cols.includes('backend')) {
      database.exec("ALTER TABLE workers ADD COLUMN backend TEXT NOT NULL DEFAULT 'tmux'");
    }
  }
  if (existingTables.includes('tasks')) {
    const taskCols = getColumnNames(database, 'tasks');
    if (!taskCols.includes('overlap_with')) {
      database.exec("ALTER TABLE tasks ADD COLUMN overlap_with TEXT");
    }
    if (!taskCols.includes('needs_sandbox')) {
      database.exec("ALTER TABLE tasks ADD COLUMN needs_sandbox INTEGER NOT NULL DEFAULT 0");
    }
    ensureTaskExtendedStatuses(database);
    ensureTaskLivenessRecoveryColumns(database);
    ensureTaskRoutingTelemetryColumns(database);
    ensureTaskBrowserOffloadColumns(database);
    ensureTaskUsageTelemetryColumns(database);
    ensureTaskMergeHistoryColumn(database);
  }
  if (existingTables.includes('requests')) {
    const reqCols = getColumnNames(database, 'requests');
    if (!reqCols.includes('loop_id')) {
      database.exec("ALTER TABLE requests ADD COLUMN loop_id INTEGER REFERENCES loops(id)");
    }
    if (!reqCols.includes('previous_status')) {
      database.exec("ALTER TABLE requests ADD COLUMN previous_status TEXT");
    }
    if (!reqCols.includes('status_cause')) {
      database.exec("ALTER TABLE requests ADD COLUMN status_cause TEXT");
    }
  }
  if (existingTables.includes('merge_queue')) {
    ensureMergeQueueColumns(database);
    ensureMergeIdentityColumns(database);
  }
  if (existingTables.includes('loops')) {
    const loopCols = getColumnNames(database, 'loops');
    if (!loopCols.includes('namespace')) {
      database.exec("ALTER TABLE loops ADD COLUMN namespace TEXT");
    }
  }
  if (existingTables.includes('presets')) ensurePresetModelColumns(database);
}

function applySchema(database, schemaPath = path.join(__dirname, '..', 'schema.sql')) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  database.exec(schema);
}

function runPostSchemaMigrations(database, options = {}) {
  ensureMergeQueueColumns(database);
  ensureMergeIdentityColumns(database);
  ensureTaskExtendedStatuses(database);
  ensureTaskLivenessRecoveryColumns(database);
  ensureTaskRoutingTelemetryColumns(database);
  ensureTaskBrowserOffloadColumns(database);
  ensureTaskUsageTelemetryColumns(database);
  ensureTaskMergeHistoryColumn(database);
  ensureTaskSandboxLifecycleSchema(database);
  ensureResearchBatchingSchema(database, options.researchDefaults);
  ensureProjectMemoryPersistenceSchema(database);
  ensureBrowserOffloadPersistenceSchema(database);
  ensurePresetModelColumns(database);
}

module.exports = {
  applySchema,
  runPreSchemaMigrations,
  runPostSchemaMigrations,
  ensureMergeQueueColumns,
  ensureMergeIdentityColumns,
  ensureTaskRoutingTelemetryColumns,
  ensureTaskLivenessRecoveryColumns,
  ensureTaskUsageTelemetryColumns,
  ensureTaskExtendedStatuses,
  ensureTaskBrowserOffloadColumns,
  ensureTaskMergeHistoryColumn,
  ensureTaskSandboxLifecycleSchema,
  ensureResearchBatchingSchema,
  ensureProjectMemoryPersistenceSchema,
  ensureBrowserOffloadPersistenceSchema,
  ensurePresetModelColumns,
};
