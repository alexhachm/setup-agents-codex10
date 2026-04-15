'use strict';

function createTaskRepository(context) {
  const {
    getDb,
    validateColumns,
    buildSqlInClause,
    log,
    getWorker,
    REQUEST_TERMINAL_STATUSES,
    TASK_PRIORITY_RANK,
    PRIORITY_OVERRIDE_MARKER_RE,
    REQUEST_ID_TOKEN_RE,
    TASK_SANDBOX_STATUSES,
    TASK_SANDBOX_BACKENDS,
    TASK_SANDBOX_ALLOWED_TRANSITIONS,
  } = context;

  function createTask({ request_id, subject, description, domain, files, priority, tier, depends_on, validation, needs_sandbox }) {
    const result = getDb().prepare(`
      INSERT INTO tasks (request_id, subject, description, domain, files, priority, tier, depends_on, validation, needs_sandbox)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request_id, subject, description,
      domain || null,
      files ? JSON.stringify(files) : null,
      priority || 'normal',
      tier || 3,
      depends_on ? JSON.stringify(depends_on) : null,
      validation ? JSON.stringify(validation) : null,
      needs_sandbox ? 1 : 0
    );
    log('coordinator', 'task_created', { task_id: result.lastInsertRowid, request_id, subject });
    return result.lastInsertRowid;
  }
  
  function getTask(id) {
    return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  }
  
  function updateTask(id, fields) {
    validateColumns('tasks', fields);
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    getDb().prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  
  function normalizeTaskSandboxBackend(value) {
    const backend = String(value || 'pending').trim().toLowerCase() || 'pending';
    if (!TASK_SANDBOX_BACKENDS.has(backend)) {
      throw new Error(`Invalid task sandbox backend: ${backend}`);
    }
    return backend;
  }
  
  function normalizeTaskSandboxStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    if (!TASK_SANDBOX_STATUSES.has(status)) {
      throw new Error(`Invalid task sandbox status: ${status}`);
    }
    return status;
  }
  
  function normalizeTaskSandboxMetadata(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }
  
  function defaultTaskSandboxName(taskId, workerId) {
    return workerId ? `task-${taskId}-worker-${workerId}` : `task-${taskId}`;
  }
  
  function getTaskSandbox(id) {
    return getDb().prepare('SELECT * FROM task_sandboxes WHERE id = ?').get(id);
  }
  
  function getActiveTaskSandboxForTask(taskId) {
    return getDb().prepare(`
      SELECT *
      FROM task_sandboxes
      WHERE task_id = ?
        AND status NOT IN ('failed','cleaned')
      ORDER BY id DESC
      LIMIT 1
    `).get(taskId);
  }
  
  function createTaskSandbox({
    task_id,
    worker_id = null,
    backend = 'pending',
    sandbox_name = null,
    sandbox_path = null,
    worktree_path = null,
    branch = null,
    metadata = null,
  } = {}) {
    const taskId = Number.parseInt(task_id, 10);
    if (!Number.isInteger(taskId) || taskId <= 0) throw new Error('Invalid task_id');
    const task = getTask(taskId);
    if (!task) throw new Error('Task not found');
  
    const existing = getActiveTaskSandboxForTask(taskId);
    if (existing) throw new Error(`active_task_sandbox_exists:${existing.id}`);
  
    const parsedWorkerId = worker_id === null || worker_id === undefined
      ? (task.assigned_to || null)
      : Number.parseInt(worker_id, 10);
    if (parsedWorkerId !== null && (!Number.isInteger(parsedWorkerId) || parsedWorkerId <= 0)) {
      throw new Error('Invalid worker_id');
    }
    const worker = parsedWorkerId ? getWorker(parsedWorkerId) : null;
    if (parsedWorkerId && !worker) throw new Error('Worker not found');
  
    const effectiveBackend = normalizeTaskSandboxBackend(backend);
    const effectiveName = sandbox_name || defaultTaskSandboxName(taskId, parsedWorkerId);
    const result = getDb().prepare(`
      INSERT INTO task_sandboxes (
        task_id, request_id, worker_id, backend, status, sandbox_name,
        sandbox_path, worktree_path, branch, metadata
      )
      VALUES (?, ?, ?, ?, 'allocated', ?, ?, ?, ?, ?)
    `).run(
      taskId,
      task.request_id,
      parsedWorkerId,
      effectiveBackend,
      effectiveName,
      sandbox_path || null,
      worktree_path || (worker && worker.worktree_path) || null,
      branch || task.branch || (worker && worker.branch) || null,
      normalizeTaskSandboxMetadata(metadata)
    );
    const sandbox = getTaskSandbox(result.lastInsertRowid);
    log('coordinator', 'task_sandbox_created', {
      sandbox_id: sandbox.id,
      task_id: taskId,
      worker_id: parsedWorkerId,
      backend: effectiveBackend,
      sandbox_name: effectiveName,
    });
    return sandbox;
  }
  
  function updateTaskSandbox(id, fields) {
    validateColumns('task_sandboxes', fields);
    const sandboxId = Number.parseInt(id, 10);
    if (!Number.isInteger(sandboxId) || sandboxId <= 0) throw new Error('Invalid sandbox id');
    if (Object.keys(fields).length === 0) return getTaskSandbox(sandboxId);
    const normalizedFields = { ...fields };
    if (Object.prototype.hasOwnProperty.call(normalizedFields, 'backend')) {
      normalizedFields.backend = normalizeTaskSandboxBackend(normalizedFields.backend);
    }
    if (Object.prototype.hasOwnProperty.call(normalizedFields, 'status')) {
      normalizedFields.status = normalizeTaskSandboxStatus(normalizedFields.status);
    }
    if (Object.prototype.hasOwnProperty.call(normalizedFields, 'metadata')) {
      normalizedFields.metadata = normalizeTaskSandboxMetadata(normalizedFields.metadata);
    }
  
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(normalizedFields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    sets.push("updated_at = datetime('now')");
    vals.push(sandboxId);
    const result = getDb().prepare(`UPDATE task_sandboxes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    if (result.changes !== 1) throw new Error('Task sandbox not found');
    return getTaskSandbox(sandboxId);
  }
  
  function transitionTaskSandbox(id, status, fields = {}) {
    const sandbox = getTaskSandbox(id);
    if (!sandbox) throw new Error('Task sandbox not found');
    const nextStatus = normalizeTaskSandboxStatus(status);
    if (sandbox.status !== nextStatus) {
      const allowed = TASK_SANDBOX_ALLOWED_TRANSITIONS[sandbox.status] || new Set();
      if (!allowed.has(nextStatus)) {
        throw new Error(`invalid_task_sandbox_transition:${sandbox.status}->${nextStatus}`);
      }
    }
  
    const now = new Date().toISOString();
    const updateFields = { ...fields, status: nextStatus };
    if (nextStatus === 'running' && !sandbox.started_at && !updateFields.started_at) {
      updateFields.started_at = now;
    }
    if ((nextStatus === 'stopped' || nextStatus === 'failed') && !sandbox.stopped_at && !updateFields.stopped_at) {
      updateFields.stopped_at = now;
    }
    if (nextStatus === 'cleaned' && !sandbox.cleaned_at && !updateFields.cleaned_at) {
      updateFields.cleaned_at = now;
    }
    const updated = updateTaskSandbox(id, updateFields);
    log('coordinator', 'task_sandbox_transitioned', {
      sandbox_id: updated.id,
      task_id: updated.task_id,
      from_status: sandbox.status,
      to_status: nextStatus,
    });
    return updated;
  }
  
  function listTaskSandboxes(filters = {}) {
    let sql = 'SELECT * FROM task_sandboxes WHERE 1=1';
    const vals = [];
    if (filters.id !== undefined && filters.id !== null) {
      sql += ' AND id = ?';
      vals.push(filters.id);
    }
    if (filters.task_id !== undefined && filters.task_id !== null) {
      sql += ' AND task_id = ?';
      vals.push(filters.task_id);
    }
    if (filters.worker_id !== undefined && filters.worker_id !== null) {
      sql += ' AND worker_id = ?';
      vals.push(filters.worker_id);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      vals.push(filters.status);
    }
    sql += ' ORDER BY id ASC';
    return getDb().prepare(sql).all(...vals);
  }
  
  function cleanupTaskSandboxes({ max_age_minutes = 60, dry_run = false } = {}) {
    const parsedAge = Number.parseInt(max_age_minutes, 10);
    const ageMinutes = Number.isInteger(parsedAge) && parsedAge >= 0 ? parsedAge : 60;
    const cutoff = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString();
    const candidates = getDb().prepare(`
      SELECT *
      FROM task_sandboxes
      WHERE status IN ('stopped','failed')
        AND datetime(COALESCE(stopped_at, updated_at, created_at)) <= datetime(?)
      ORDER BY id ASC
    `).all(cutoff);
    if (dry_run || candidates.length === 0) {
      return {
        dry_run: dry_run === true,
        cleaned_count: 0,
        candidate_count: candidates.length,
        ids: candidates.map((sandbox) => sandbox.id),
        candidates,
      };
    }
  
    const now = new Date().toISOString();
    const ids = candidates.map((sandbox) => sandbox.id);
    const placeholders = buildSqlInClause(ids);
    getDb().prepare(`
      UPDATE task_sandboxes
      SET status = 'cleaned',
          cleaned_at = ?,
          updated_at = datetime('now')
      WHERE id IN (${placeholders})
    `).run(now, ...ids);
    log('coordinator', 'task_sandbox_cleanup', {
      cleaned_count: ids.length,
      ids,
      max_age_minutes: ageMinutes,
    });
    return {
      dry_run: false,
      cleaned_count: ids.length,
      candidate_count: ids.length,
      ids,
      candidates: ids.map((id) => getTaskSandbox(id)),
    };
  }
  
  function appendTaskMergeHistory(taskId, entry) {
    const task = getDb().prepare('SELECT merge_history FROM tasks WHERE id = ?').get(taskId);
    if (!task) return;
    let history;
    try {
      history = task.merge_history ? JSON.parse(task.merge_history) : [];
    } catch {
      history = [];
    }
    history.push({ ...entry, recorded_at: new Date().toISOString() });
    getDb().prepare("UPDATE tasks SET merge_history = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(history), taskId);
  }
  
  function getRequestMergeHistory(requestId) {
    const rows = getDb().prepare(
      'SELECT id, merge_history FROM tasks WHERE request_id = ? AND merge_history IS NOT NULL'
    ).all(requestId);
    const result = [];
    for (const row of rows) {
      let entries;
      try { entries = JSON.parse(row.merge_history); } catch { continue; }
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          result.push({ task_id: row.id, ...entry });
        }
      }
    }
    result.sort((a, b) => (a.recorded_at || '').localeCompare(b.recorded_at || ''));
    return result;
  }
  
  function listTasks(filters = {}) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const vals = [];
    if (filters.status) { sql += ' AND status = ?'; vals.push(filters.status); }
    if (filters.request_id) { sql += ' AND request_id = ?'; vals.push(filters.request_id); }
    if (filters.assigned_to) { sql += ' AND assigned_to = ?'; vals.push(filters.assigned_to); }
    sql += ' ORDER BY CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 WHEN \'low\' THEN 3 END, id';
    return getDb().prepare(sql).all(...vals);
  }
  
  function getTaskPriorityRank(priority) {
    return Object.prototype.hasOwnProperty.call(TASK_PRIORITY_RANK, priority)
      ? TASK_PRIORITY_RANK[priority]
      : Number.MAX_SAFE_INTEGER;
  }
  
  function extractPriorityOverrideTargetRequestId(description, sourceRequestId = null) {
    const text = String(description || '');
    if (!PRIORITY_OVERRIDE_MARKER_RE.test(text)) return null;
  
    const sourceId = typeof sourceRequestId === 'string' ? sourceRequestId.toLowerCase() : null;
    const requestIds = text.match(REQUEST_ID_TOKEN_RE) || [];
    for (const requestId of requestIds) {
      const normalizedId = requestId.toLowerCase();
      if (!sourceId || normalizedId !== sourceId) return normalizedId;
    }
    return null;
  }
  
  function getActivePriorityOverrideTargetRequestIds() {
    const requests = getDb().prepare(`
      SELECT id, description, status, created_at
      FROM requests
      ORDER BY datetime(created_at) DESC, id DESC
    `).all();
    if (!requests.length) return [];
  
    const requestStatusById = new Map();
    for (const request of requests) {
      requestStatusById.set(request.id, String(request.status || '').toLowerCase());
    }
  
    const orderedTargets = [];
    const seenTargets = new Set();
    for (const request of requests) {
      const targetRequestId = extractPriorityOverrideTargetRequestId(request.description, request.id);
      if (!targetRequestId || seenTargets.has(targetRequestId)) continue;
      const targetStatus = requestStatusById.get(targetRequestId);
      if (!targetStatus || REQUEST_TERMINAL_STATUSES.has(targetStatus)) continue;
      seenTargets.add(targetRequestId);
      orderedTargets.push(targetRequestId);
    }
    return orderedTargets;
  }
  
  function getReadyTasks() {
    // Tasks that are ready and have no unfinished dependencies,
    // excluding tasks whose parent request has reached a terminal state.
    const readyTasks = getDb().prepare(`
      SELECT t.* FROM tasks t
      JOIN requests r ON t.request_id = r.id
      WHERE t.status = 'ready' AND t.assigned_to IS NULL
        AND r.status NOT IN ('completed', 'failed')
      ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.id
    `).all();
  
    const priorityOverrideTargetIds = getActivePriorityOverrideTargetRequestIds();
    if (!priorityOverrideTargetIds.length || readyTasks.length <= 1) return readyTasks;
  
    const overrideRankByRequestId = new Map(priorityOverrideTargetIds.map((requestId, index) => [requestId, index]));
    return readyTasks.slice().sort((leftTask, rightTask) => {
      const leftOverrideRank = overrideRankByRequestId.has(leftTask.request_id)
        ? overrideRankByRequestId.get(leftTask.request_id)
        : Number.MAX_SAFE_INTEGER;
      const rightOverrideRank = overrideRankByRequestId.has(rightTask.request_id)
        ? overrideRankByRequestId.get(rightTask.request_id)
        : Number.MAX_SAFE_INTEGER;
      if (leftOverrideRank !== rightOverrideRank) return leftOverrideRank - rightOverrideRank;
  
      const leftPriorityRank = getTaskPriorityRank(leftTask.priority);
      const rightPriorityRank = getTaskPriorityRank(rightTask.priority);
      if (leftPriorityRank !== rightPriorityRank) return leftPriorityRank - rightPriorityRank;
      return leftTask.id - rightTask.id;
    });
  }
  
  function checkAndPromoteTasks() {
    const d = getDb();
    // Batch promote pending tasks with no dependencies in a single SQL statement,
    // but only for tasks whose parent request is still active (not completed or failed).
    d.prepare(`
      UPDATE tasks SET status = 'ready', updated_at = datetime('now')
      WHERE status = 'pending' AND (depends_on IS NULL OR depends_on = '[]')
        AND request_id IN (SELECT id FROM requests WHERE status NOT IN ('completed', 'failed'))
    `).run();
  
    // For tasks with dependencies, check each one (also excluding terminal-request tasks).
    const pending = d.prepare(
      `SELECT id, depends_on FROM tasks
       WHERE status = 'pending' AND depends_on IS NOT NULL AND depends_on != '[]'
         AND request_id IN (SELECT id FROM requests WHERE status NOT IN ('completed', 'failed'))`
    ).all();
    for (const task of pending) {
      let deps;
      try {
        deps = JSON.parse(task.depends_on);
      } catch (e) {
        updateTask(task.id, { status: 'failed', result: `Invalid depends_on JSON: ${e.message}` });
        continue;
      }
      if (!Array.isArray(deps)) {
        const msg = `Malformed depends_on for task ${task.id}: expected array, got ${JSON.stringify(deps)}`;
        console.error(`[db] checkAndPromoteTasks: ${msg}`);
        updateTask(task.id, { status: 'failed', result: msg });
        continue;
      }
      if (!deps.length) {
        updateTask(task.id, { status: 'ready' });
        continue;
      }
      const invalidDep = deps.find((d) => typeof d !== 'number' || !Number.isInteger(d) || d <= 0);
      if (invalidDep !== undefined) {
        const msg = `Malformed depends_on for task ${task.id}: invalid element ${JSON.stringify(invalidDep)}`;
        console.error(`[db] checkAndPromoteTasks: ${msg}`);
        updateTask(task.id, { status: 'failed', result: msg });
        continue;
      }
      const uniqueDeps = [...new Set(deps)];
      const depRows = d.prepare(
        `SELECT id, status FROM tasks WHERE id IN (${uniqueDeps.map(() => '?').join(',')})`
      ).all(...uniqueDeps);
      const foundIds = new Set(depRows.map((r) => r.id));
      const missingIds = uniqueDeps.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        updateTask(task.id, { status: 'failed', result: `missing_dependency_ids: [${missingIds.join(', ')}]` });
        continue;
      }
      const failedDep = depRows.find((r) => r.status === 'failed');
      if (failedDep) {
        updateTask(task.id, { status: 'failed', result: `blocked by failed dependency task #${failedDep.id}` });
      } else if (depRows.every((r) => r.status === 'completed')) {
        updateTask(task.id, { status: 'ready' });
      }
    }
  }
  
  function replanTaskDependency({ fromTaskId, toTaskId, requestId = null } = {}) {
    const fromId = Number(fromTaskId);
    const toId = Number(toTaskId);
    if (!Number.isInteger(fromId) || fromId <= 0) {
      throw new Error('fromTaskId must be a positive integer');
    }
    if (!Number.isInteger(toId) || toId <= 0) {
      throw new Error('toTaskId must be a positive integer');
    }
    if (fromId === toId) {
      throw new Error('fromTaskId and toTaskId must be different');
    }
  
    const fromTask = getTask(fromId);
    if (!fromTask) {
      throw new Error(`Task ${fromId} not found`);
    }
    const replacementTask = getTask(toId);
    if (!replacementTask) {
      throw new Error(`Task ${toId} not found`);
    }
    if (replacementTask.status === 'failed') {
      throw new Error(`Task ${toId} is failed and cannot be used as a replacement dependency`);
    }
  
    const normalizedRequestId = requestId === null || requestId === undefined
      ? null
      : String(requestId).trim() || null;
    const d = getDb();
    const replanned = d.transaction(() => {
      const queryBase = `
        SELECT id, depends_on
        FROM tasks
        WHERE status = 'pending'
          AND depends_on IS NOT NULL
          AND depends_on != '[]'
      `;
      const scopedSql = normalizedRequestId
        ? `${queryBase} AND request_id = ? ORDER BY id`
        : `${queryBase} ORDER BY id`;
      const rows = normalizedRequestId
        ? d.prepare(scopedSql).all(normalizedRequestId)
        : d.prepare(scopedSql).all();
  
      const updatedTaskIds = [];
      const promotedTaskIds = [];
      for (const row of rows) {
        let deps;
        try {
          deps = JSON.parse(row.depends_on);
        } catch {
          continue;
        }
        if (!Array.isArray(deps) || deps.length === 0) continue;
        const touchesSource = deps.some((dep) => Number(dep) === fromId);
        if (!touchesSource) continue;
  
        const seen = new Set();
        const rewritten = [];
        for (const dep of deps) {
          const candidate = Number(dep) === fromId ? toId : dep;
          const dedupeKey = String(candidate);
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          rewritten.push(candidate);
        }
        updateTask(row.id, { depends_on: rewritten.length ? JSON.stringify(rewritten) : null });
        updatedTaskIds.push(row.id);
      }
  
      checkAndPromoteTasks();
      for (const taskId of updatedTaskIds) {
        const task = getTask(taskId);
        if (task && task.status === 'ready') {
          promotedTaskIds.push(taskId);
        }
      }
      return { updatedTaskIds, promotedTaskIds };
    })();
  
    log('coordinator', 'dependency_replanned', {
      request_id: normalizedRequestId,
      from_task_id: fromId,
      to_task_id: toId,
      updated_task_ids: replanned.updatedTaskIds,
      promoted_task_ids: replanned.promotedTaskIds,
    });
    return {
      request_id: normalizedRequestId,
      from_task_id: fromId,
      to_task_id: toId,
      updated_task_ids: replanned.updatedTaskIds,
      promoted_task_ids: replanned.promotedTaskIds,
      updated_count: replanned.updatedTaskIds.length,
      promoted_count: replanned.promotedTaskIds.length,
    };
  }

  return {
    createTask,
    getTask,
    updateTask,
    createTaskSandbox,
    getTaskSandbox,
    getActiveTaskSandboxForTask,
    updateTaskSandbox,
    transitionTaskSandbox,
    listTaskSandboxes,
    cleanupTaskSandboxes,
    appendTaskMergeHistory,
    getRequestMergeHistory,
    listTasks,
    getReadyTasks,
    checkAndPromoteTasks,
    replanTaskDependency,
  };
}

module.exports = { createTaskRepository };
