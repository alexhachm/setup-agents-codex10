'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const insightIngestion = require('./insight-ingestion');

const BRANCH_RE = /^[a-zA-Z0-9._\/-]+$/;
const PR_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/pull\/\d+$/;
// Ref: coordinator rollup — 4-tier merge strategy: clean → rebase → AI-resolve → redo.
const MERGE_TIMEOUT_ERROR_PREFIX = 'Merge timed out after';
const WINDOWS_EXECUTABLE_EXTENSIONS = new Set(['.exe', '.cmd', '.bat', '.com']);

function validateEntry(entry) {
  if (entry.branch && !BRANCH_RE.test(entry.branch)) {
    throw new Error(`Invalid branch name: ${entry.branch}`);
  }
  if (entry.pr_url && !PR_URL_RE.test(entry.pr_url)) {
    throw new Error(`Invalid PR URL: ${entry.pr_url}`);
  }
}

function getPathDirectories() {
  const rawPath = process.env.PATH || '';
  return rawPath
    .split(path.delimiter)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function escapeBashArg(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function toWslPath(inputPath) {
  const resolved = path.resolve(inputPath).replace(/\\/g, '/');
  const driveMatch = resolved.match(/^([A-Za-z]):\/(.*)$/);
  if (driveMatch) {
    return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
  }
  return resolved;
}

function normalizePosixShellArg(value) {
  if (typeof value !== 'string') return String(value);
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return toWslPath(value);
  }
  return value;
}

function getShebang(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(256);
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      const firstLine = buffer.toString('utf8', 0, bytesRead).split(/\r?\n/, 1)[0].trim();
      return firstLine.startsWith('#!') ? firstLine.slice(2).trim() : null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function resolveCommandOnPath(commandName) {
  const hasPathSegment = /[\\/]/.test(commandName);
  const candidatePaths = [];

  if (path.isAbsolute(commandName) || hasPathSegment) {
    candidatePaths.push(commandName);
  } else {
    for (const dir of getPathDirectories()) {
      candidatePaths.push(path.join(dir, commandName));
    }
  }

  const pathext = process.platform === 'win32'
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
        .split(';')
        .map((ext) => ext.trim().toLowerCase())
        .filter(Boolean)
    : [];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }

    if (process.platform !== 'win32') {
      continue;
    }

    for (const ext of pathext) {
      const extCandidate = `${candidate}${ext}`;
      if (fs.existsSync(extCandidate) && fs.statSync(extCandidate).isFile()) {
        return extCandidate;
      }
    }
  }

  return null;
}

function resolveWindowsPosixShell() {
  const gitBashCandidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files\\Git\\bin\\sh.exe',
    'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
  ];
  for (const candidate of gitBashCandidates) {
    if (fs.existsSync(candidate)) {
      return {
        kind: candidate.toLowerCase().endsWith('sh.exe') ? 'sh' : 'bash',
        file: candidate,
      };
    }
  }

  const bashPath = resolveCommandOnPath('bash');
  if (bashPath) {
    return { kind: 'bash', file: bashPath };
  }

  const shPath = resolveCommandOnPath('sh');
  if (shPath) {
    return { kind: 'sh', file: shPath };
  }

  const wslPath = resolveCommandOnPath('wsl.exe');
  if (wslPath) {
    return { kind: 'wsl', file: wslPath };
  }

  return null;
}

function buildPosixShellInvocation(command, cwd) {
  if (process.platform !== 'win32') {
    return { file: 'sh', args: ['-c', command], cwd };
  }

  const shell = resolveWindowsPosixShell();
  if (!shell) {
    return null;
  }

  if (shell.kind === 'wsl') {
    return {
      file: shell.file,
      args: ['bash', '-lc', `cd ${escapeBashArg(toWslPath(cwd))} && ${command}`],
      cwd,
    };
  }

  return {
    file: shell.file,
    args: [shell.kind === 'bash' ? '-lc' : '-c', command],
    cwd,
  };
}

function resolveExecInvocation(file, args, cwd) {
  if (process.platform !== 'win32') {
    return { file, args, cwd };
  }

  const resolvedPath = resolveCommandOnPath(file);
  if (!resolvedPath) {
    return { file, args, cwd };
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (WINDOWS_EXECUTABLE_EXTENSIONS.has(ext)) {
    return { file: resolvedPath, args, cwd };
  }

  const shebang = getShebang(resolvedPath);
  if (shebang) {
    const normalized = shebang.toLowerCase();
    if (normalized.includes('bash') || normalized.includes('/sh') || normalized.endsWith(' sh')) {
      const shell = resolveWindowsPosixShell();
      const normalizeArg = shell && shell.kind === 'wsl'
        ? (value) => normalizePosixShellArg(value)
        : (value) => String(value);
      const scriptCommand = [resolvedPath, ...args]
        .map((value) => escapeBashArg(normalizeArg(value)))
        .join(' ');
      const posixShellInvocation = buildPosixShellInvocation(scriptCommand, cwd);
      if (posixShellInvocation) {
        return posixShellInvocation;
      }
    }
  }

  return { file: resolvedPath, args, cwd };
}

function safeExec(file, args, cwd) {
  const invocation = resolveExecInvocation(file, args, cwd);
  return execFileSync(invocation.file, invocation.args, {
    encoding: 'utf8',
    cwd: invocation.cwd,
    timeout: 60000,
  }).trim();
}

function safeShellExec(command, cwd) {
  const posixShellInvocation = buildPosixShellInvocation(command, cwd);
  if (posixShellInvocation) {
    return execFileSync(posixShellInvocation.file, posixShellInvocation.args, {
      encoding: 'utf8',
      cwd: posixShellInvocation.cwd,
      timeout: 60000,
    }).trim();
  }

  if (process.platform === 'win32') {
    return execFileSync('cmd.exe', ['/d', '/s', '/c', command], {
      encoding: 'utf8',
      cwd,
      timeout: 60000,
    }).trim();
  }

  return execFileSync('sh', ['-c', command], { encoding: 'utf8', cwd, timeout: 60000 }).trim();
}

let processing = false;
let processingStartedAt = 0;
const PROCESSING_TIMEOUT_MS = 300000; // 5 minutes — reset flag if stuck
let mergerIntervalId = null;
const assignmentPriorityDeferralsByMergeId = new Map();
const ASSIGNMENT_PRIORITY_DEFAULT_MAX_CONSECUTIVE_DEFERRALS = 3;
const ASSIGNMENT_PRIORITY_DEFAULT_MAX_DEFER_AGE_MS = 120000;
const ASSIGNMENT_PRIORITY_DEFAULT_ALLOCATOR_LOOP_STALE_MS = 300000;
const ASSIGNMENT_PRIORITY_ENABLED_CONFIG_KEY = 'prioritize_assignment_over_merge';
const ASSIGNMENT_PRIORITY_MAX_CONSECUTIVE_DEFERRALS_CONFIG_KEY = 'assignment_priority_merge_max_deferrals';
const ASSIGNMENT_PRIORITY_MAX_DEFER_AGE_MS_CONFIG_KEY = 'assignment_priority_merge_max_age_ms';
const ASSIGNMENT_PRIORITY_ALLOCATOR_LOOP_STALE_MS_CONFIG_KEY = 'assignment_priority_allocator_loop_stale_ms';
// Matches allocator loops regardless of whether the prompt is the short slash-command
// form ("/allocate-loop") or the full expanded skill content (which contains role
// markers like "Master-3", "Allocator agent", and mailbox cues like "mac10 inbox allocator").
const ALLOCATOR_LOOP_PROMPT_RE = /\/allocate-loop\b|\bMaster-3\b|\bAllocator\s+agent\b|\bmac10\s+inbox\s+allocator\b/i;

function parseBooleanConfig(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parsePositiveIntegerConfig(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getMergeQueueAgeMs(entry) {
  const createdAtMs = Date.parse(entry && entry.created_at ? entry.created_at : '');
  if (!Number.isFinite(createdAtMs)) return 0;
  const ageMs = Date.now() - createdAtMs;
  return ageMs > 0 ? ageMs : 0;
}

function getTimestampAgeMs(value) {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return null;
  const ageMs = Date.now() - parsed;
  return ageMs > 0 ? ageMs : 0;
}

function getAllocatorLoopHeartbeatState() {
  const maxHeartbeatAgeMs = parsePositiveIntegerConfig(
    db.getConfig(ASSIGNMENT_PRIORITY_ALLOCATOR_LOOP_STALE_MS_CONFIG_KEY),
    ASSIGNMENT_PRIORITY_DEFAULT_ALLOCATOR_LOOP_STALE_MS
  );

  const activeLoops = db.listLoops('active');
  const allocatorLoop = Array.isArray(activeLoops)
    ? activeLoops.find((loop) => typeof loop.prompt === 'string' && ALLOCATOR_LOOP_PROMPT_RE.test(loop.prompt))
    : null;

  if (!allocatorLoop) {
    return {
      present: false,
      loop_id: null,
      heartbeat_age_ms: null,
      max_heartbeat_age_ms: maxHeartbeatAgeMs,
      stale: false,
    };
  }

  const heartbeatReference = allocatorLoop.last_heartbeat || allocatorLoop.updated_at || allocatorLoop.created_at;
  const heartbeatAgeMs = getTimestampAgeMs(heartbeatReference);
  const stale = heartbeatAgeMs === null || heartbeatAgeMs >= maxHeartbeatAgeMs;
  return {
    present: true,
    loop_id: allocatorLoop.id,
    heartbeat_age_ms: heartbeatAgeMs,
    max_heartbeat_age_ms: maxHeartbeatAgeMs,
    stale,
  };
}

function shouldDeferMergeForAssignmentPriority(entry) {
  const prioritizeAssignments = parseBooleanConfig(db.getConfig(ASSIGNMENT_PRIORITY_ENABLED_CONFIG_KEY));
  if (!prioritizeAssignments) {
    assignmentPriorityDeferralsByMergeId.delete(entry.id);
    return false;
  }

  const readyTasks = db.getReadyTasks();
  const readyTaskCount = Array.isArray(readyTasks) ? readyTasks.length : 0;
  if (readyTaskCount === 0) {
    assignmentPriorityDeferralsByMergeId.delete(entry.id);
    return false;
  }

  const maxConsecutiveDeferrals = parsePositiveIntegerConfig(
    db.getConfig(ASSIGNMENT_PRIORITY_MAX_CONSECUTIVE_DEFERRALS_CONFIG_KEY),
    ASSIGNMENT_PRIORITY_DEFAULT_MAX_CONSECUTIVE_DEFERRALS
  );
  const maxDeferralAgeMs = parsePositiveIntegerConfig(
    db.getConfig(ASSIGNMENT_PRIORITY_MAX_DEFER_AGE_MS_CONFIG_KEY),
    ASSIGNMENT_PRIORITY_DEFAULT_MAX_DEFER_AGE_MS
  );
  const deferredCount = (assignmentPriorityDeferralsByMergeId.get(entry.id) || 0) + 1;
  const pendingAgeMs = getMergeQueueAgeMs(entry);
  const thresholdBreachedByCount = deferredCount >= maxConsecutiveDeferrals;
  const thresholdBreachedByAge = pendingAgeMs >= maxDeferralAgeMs;
  const allocatorLoopHeartbeatState = getAllocatorLoopHeartbeatState();
  const thresholdBreachedByAllocatorLoopStale = allocatorLoopHeartbeatState.stale;

  if (!thresholdBreachedByCount && !thresholdBreachedByAge && !thresholdBreachedByAllocatorLoopStale) {
    assignmentPriorityDeferralsByMergeId.set(entry.id, deferredCount);
    db.log('coordinator', 'merge_deferred_assignment_priority', {
      merge_id: entry.id,
      request_id: entry.request_id,
      task_id: entry.task_id,
      ready_task_count: readyTaskCount,
      consecutive_deferrals: deferredCount,
      max_consecutive_deferrals: maxConsecutiveDeferrals,
      pending_age_ms: pendingAgeMs,
      max_pending_age_ms: maxDeferralAgeMs,
      allocator_loop_present: allocatorLoopHeartbeatState.present,
      allocator_loop_id: allocatorLoopHeartbeatState.loop_id,
      allocator_loop_heartbeat_age_ms: allocatorLoopHeartbeatState.heartbeat_age_ms,
      allocator_loop_max_heartbeat_age_ms: allocatorLoopHeartbeatState.max_heartbeat_age_ms,
    });
    return true;
  }

  assignmentPriorityDeferralsByMergeId.delete(entry.id);
  db.log('coordinator', 'merge_assignment_priority_starvation_escape', {
    merge_id: entry.id,
    request_id: entry.request_id,
    task_id: entry.task_id,
    ready_task_count: readyTaskCount,
    consecutive_deferrals: deferredCount,
    max_consecutive_deferrals: maxConsecutiveDeferrals,
    pending_age_ms: pendingAgeMs,
    max_pending_age_ms: maxDeferralAgeMs,
    breached_by_count: thresholdBreachedByCount,
    breached_by_age: thresholdBreachedByAge,
    breached_by_allocator_loop_stale: thresholdBreachedByAllocatorLoopStale,
    allocator_loop_present: allocatorLoopHeartbeatState.present,
    allocator_loop_id: allocatorLoopHeartbeatState.loop_id,
    allocator_loop_heartbeat_age_ms: allocatorLoopHeartbeatState.heartbeat_age_ms,
    allocator_loop_max_heartbeat_age_ms: allocatorLoopHeartbeatState.max_heartbeat_age_ms,
  });
  return false;
}

function completeRequestIfTransition(requestId, result) {
  const completionTimestamp = new Date().toISOString();
  const updateResult = db.getDb().prepare(`
    UPDATE requests
    SET status = 'completed',
        completed_at = ?,
        result = ?,
        updated_at = datetime('now')
    WHERE id = ?
      AND status != 'completed'
  `).run(completionTimestamp, result, requestId);

  if (updateResult.changes === 0) {
    return false;
  }

  db.sendMail('master-1', 'request_completed', { request_id: requestId, result });
  db.log('coordinator', 'request_completed', { request_id: requestId });
  insightIngestion.ingestMergeEvent('request_completed', { request_id: requestId, result });
  return true;
}

function start(projectDir) {
  // Merger is triggered by task completions, but also runs periodic checks
  mergerIntervalId = setInterval(() => {
    try {
      processQueue(projectDir);
    } catch (e) {
      db.log('coordinator', 'merger_error', { error: e.message });
    }
  }, 5000);
  db.log('coordinator', 'merger_started');
}

function onTaskCompleted(taskId) {
  // Check if all tasks for this request are done
  const task = db.getTask(taskId);
  if (!task) return;

  const allTasks = db.listTasks({ request_id: task.request_id });
  const incomplete = allTasks.filter(t => t.status !== 'completed' && t.status !== 'failed');
  const failedTasks = allTasks.filter(t => t.status === 'failed');

  if (incomplete.length === 0) {
    // Check for recoverable merges that should be retried — fix tasks may have resolved them.
    // Include legacy timeout rows that were previously marked as failed.
    const recoverableMerges = db.getDb().prepare(
      `SELECT id
         FROM merge_queue
        WHERE request_id = ?
          AND (
            status = 'conflict'
            OR (status = 'failed' AND error LIKE '${MERGE_TIMEOUT_ERROR_PREFIX}%')
            OR (status = 'failed' AND error LIKE 'functional_conflict:%')
          )`
    ).all(task.request_id);

    if (recoverableMerges.length > 0) {
      // Reset recoverable merges to pending so the merger retries them
      for (const m of recoverableMerges) {
        db.updateMerge(m.id, { status: 'pending', error: null });
      }
      db.updateRequest(task.request_id, { status: 'integrating' });
      db.log('coordinator', 'recoverable_merges_retried', {
        request_id: task.request_id,
        merge_ids: recoverableMerges.map(m => m.id),
      });
      return; // Let merger retry — don't complete yet
    }

    // Completion is blocked by any non-merged merge queue row for this request.
    const unresolvedMerges = db.getDb().prepare(
      "SELECT id, status FROM merge_queue WHERE request_id = ? AND status IN ('pending', 'ready', 'merging', 'conflict', 'failed')"
    ).all(task.request_id);

    if (unresolvedMerges.length > 0) {
      db.updateRequest(task.request_id, { status: 'integrating' });

      const hasTerminalFailure = unresolvedMerges.some((row) => row.status === 'failed' || row.status === 'conflict');
      if (hasTerminalFailure) {
        db.log('coordinator', 'request_completion_blocked_by_merge', {
          request_id: task.request_id,
          blocking_statuses: unresolvedMerges.map((row) => row.status),
          blocking_merge_ids: unresolvedMerges.map((row) => row.id),
        });
      } else {
        db.log('coordinator', 'request_ready_for_merge', { request_id: task.request_id });
      }
      return;
    }

    if (failedTasks.length > 0) {
      return;
    }
    // No PRs to merge (or all merged) — complete immediately
    const result = `All ${allTasks.length} task(s) completed (no PRs to merge)`;
    completeRequestIfTransition(task.request_id, result);
  }
}

function processQueue(projectDir, mergeExecutor = attemptMerge) {
  // Reset processing flag if stuck beyond timeout
  if (processing && processingStartedAt > 0 && (Date.now() - processingStartedAt) > PROCESSING_TIMEOUT_MS) {
    db.log('coordinator', 'merger_processing_timeout', { stuck_ms: Date.now() - processingStartedAt });
    processing = false;
  }
  if (processing) return;
  processing = true;
  processingStartedAt = Date.now();

  try {
    // Recovery sweep: reset stale conflict/functional_conflict entries on integrating requests older than 5 min
    const staleConflictRecovery = db.getDb().prepare(`
      SELECT mq.id
        FROM merge_queue mq
        JOIN requests r ON r.id = mq.request_id
       WHERE (mq.status = 'conflict' OR (mq.status = 'failed' AND mq.error LIKE 'functional_conflict:%'))
         AND r.status = 'integrating'
         AND mq.updated_at <= datetime('now', '-5 minutes')
    `).all();
    if (staleConflictRecovery.length > 0) {
      for (const m of staleConflictRecovery) {
        db.updateMerge(m.id, { status: 'pending', error: null });
      }
      db.log('coordinator', 'stale_conflict_recovery_sweep', {
        merge_ids: staleConflictRecovery.map((m) => m.id),
      });
    }

    // Purge stale terminal entries (failed/conflict) older than 600 minutes
    const stalePurgeResult = db.getDb().prepare(`
      DELETE FROM merge_queue
       WHERE status IN ('failed', 'conflict')
         AND updated_at <= datetime('now', '-600 minutes')
    `).run();
    if (stalePurgeResult.changes > 0) {
      db.log('coordinator', 'stale_merge_entries_purged', {
        count: stalePurgeResult.changes,
      });
    }

    const entry = db.getNextMerge();
    if (!entry) { processing = false; return; }
    if (shouldDeferMergeForAssignmentPriority(entry)) { processing = false; return; }

    assignmentPriorityDeferralsByMergeId.delete(entry.id);

    db.updateMerge(entry.id, { status: 'merging' });
    db.log('coordinator', 'merge_start', { merge_id: entry.id, branch: entry.branch, pr: entry.pr_url });

    const result = mergeExecutor(entry, projectDir);

    if (result.success) {
      db.updateMerge(entry.id, { status: 'merged', merged_at: new Date().toISOString() });
      db.log('coordinator', 'merge_success', { merge_id: entry.id, branch: entry.branch });
      insightIngestion.ingestMergeEvent('merge_success', {
        merge_id: entry.id,
        request_id: entry.request_id,
        task_id: entry.task_id,
        branch: entry.branch,
      });

      // Check if entire request is now complete
      checkRequestCompletion(entry.request_id);
    } else if (result.functional_conflict) {
      db.updateMerge(entry.id, { status: 'conflict', error: `functional_conflict: ${result.error}` });
      db.log('coordinator', 'functional_conflict', {
        merge_id: entry.id,
        branch: entry.branch,
        error: result.error,
      });
      insightIngestion.ingestMergeEvent('functional_conflict', {
        merge_id: entry.id,
        request_id: entry.request_id,
        task_id: entry.task_id,
        branch: entry.branch,
        error: result.error,
      });
    } else {
      db.updateMerge(entry.id, {
        status: result.conflict ? 'conflict' : 'failed',
        error: result.error,
      });
      db.log('coordinator', 'merge_failed', {
        merge_id: entry.id,
        branch: entry.branch,
        error: result.error,
        tier: result.tier,
      });
      insightIngestion.ingestMergeEvent('merge_failed', {
        merge_id: entry.id,
        request_id: entry.request_id,
        task_id: entry.task_id,
        branch: entry.branch,
        error: result.error,
        tier: result.tier,
      });
    }
  } finally {
    processing = false;
  }
}

function attemptMerge(entry, projectDir) {
  validateEntry(entry);

  // Pre-merge: check if overlapping tasks were already merged → run validation
  const preValidation = runOverlapValidation(entry, projectDir);
  if (preValidation && !preValidation.passed) {
    escalateToAllocator(entry, preValidation.error, true);
    return { success: false, functional_conflict: true, error: preValidation.error, tier: 'validation' };
  }

  // Tier 1: Clean merge via gh CLI
  const tier1 = tryCleanMerge(entry, projectDir);
  if (tier1.success) return { success: true, tier: 1 };

  // Tier 2: Auto-resolve (rebase and retry)
  const tier2 = tryRebase(entry, projectDir);
  let retryResult = null;
  if (tier2.success) {
    // Post-rebase validation if overlapping tasks exist
    const postValidation = runOverlapValidation(entry, projectDir);
    if (postValidation && !postValidation.passed) {
      escalateToAllocator(entry, postValidation.error, true);
      return { success: false, functional_conflict: true, error: postValidation.error, tier: 'validation' };
    }
    // Rebase succeeded, try clean merge again
    retryResult = tryCleanMerge(entry, projectDir);
    if (retryResult.success) return { success: true, tier: 2 };
  }

  // Tier 3: Direct git merge fallback when gh CLI is unavailable (ENOENT)
  const ghMissing = tier1.ghMissing || (retryResult && retryResult.ghMissing);
  if (ghMissing) {
    const tier3 = tryDirectGitMerge(entry, projectDir);
    if (tier3.success) return { success: true, tier: 3 };
    escalateToAllocator(entry, tier3.error, false);
    return { success: false, conflict: true, error: tier3.error, tier: 3 };
  }

  // Tiers 1 & 2 failed — escalate to allocator
  escalateToAllocator(entry, tier2.error || tier1.error, false);
  return { success: false, conflict: true, error: tier2.error || tier1.error, tier: 3 };
}

// Find the worktree path for a merge entry's branch.
// Worktrees already have the branch checked out, so we can rebase/validate
// in-place without `git checkout` (which fails when a worktree holds the branch).
function findWorktreePath(entry, projectDir) {
  // Try DB: merge entry → task → worker → worktree_path
  try {
    const task = db.getTask(entry.task_id);
    if (task && task.assigned_to) {
      const worker = db.getWorker(task.assigned_to);
      if (worker && worker.worktree_path && fs.existsSync(worker.worktree_path)) {
        return worker.worktree_path;
      }
    }
  } catch {}

  // Fallback: derive from branch name (agent-N → .worktrees/wt-N)
  const match = entry.branch && entry.branch.match(/^agent-(\d+)$/);
  if (match) {
    const wtPath = path.join(projectDir, '.worktrees', `wt-${match[1]}`);
    if (fs.existsSync(wtPath)) return wtPath;
  }

  return null;
}

function isWorktreeDirty(dir) {
  try {
    const status = safeExec('git', ['status', '--porcelain'], dir);
    return status.length > 0;
  } catch {
    return false;
  }
}

function tryRebase(entry, projectDir) {
  const wtPath = findWorktreePath(entry, projectDir);
  const rebaseDir = wtPath || projectDir;

  try {
    safeExec('git', ['fetch', 'origin'], rebaseDir);

    if (wtPath) {
      // Preflight: hard-reset dirty worktree to avoid "cannot rebase: You have unstaged changes"
      if (isWorktreeDirty(wtPath)) {
        safeExec('git', ['checkout', '.'], wtPath);
        safeExec('git', ['clean', '-fd'], wtPath);
        db.log('coordinator', 'dirty_worktree_reset', {
          branch: entry.branch,
          reason: 'dirty_worktree_before_rebase',
          path: 'worktree',
        });
      }

      // Rebase directly in worktree (branch already checked out)
      safeExec('git', ['rebase', 'origin/main'], wtPath);
      try {
        safeExec('git', ['push', '--force-with-lease', 'origin', entry.branch], wtPath);
      } catch (pushErr) {
        // Rebase succeeded but push failed — log for diagnosis
        db.log('coordinator', 'rebase_push_failed', {
          branch: entry.branch,
          error: pushErr.message,
        });
        throw pushErr;
      }
    } else {
      // Fallback: old behavior (will fail if worktree holds the branch)
      safeExec('git', ['checkout', entry.branch], projectDir);

      // Preflight: hard-reset dirty projectDir to avoid "cannot rebase: You have unstaged changes"
      if (isWorktreeDirty(projectDir)) {
        safeExec('git', ['checkout', '.'], projectDir);
        safeExec('git', ['clean', '-fd'], projectDir);
        db.log('coordinator', 'dirty_worktree_reset', {
          branch: entry.branch,
          reason: 'dirty_worktree_before_rebase',
          path: 'projectDir',
        });
      }

      safeExec('git', ['rebase', 'origin/main'], projectDir);
      safeExec('git', ['push', '--force-with-lease', 'origin', entry.branch], projectDir);
      safeExec('git', ['checkout', 'main'], projectDir);
    }
    return { success: true };
  } catch (e) {
    try { safeExec('git', ['rebase', '--abort'], rebaseDir); } catch {}
    if (!wtPath) {
      try { safeExec('git', ['checkout', 'main'], projectDir); } catch {}
    }
    return { success: false, error: e.message };
  }
}

function parseValidationCommand(command) {
  if (typeof command === 'string') {
    const trimmed = command.trim();
    if (!trimmed) return null;
    return { shell: trimmed };
  }

  if (!command || typeof command !== 'object') return null;
  if (typeof command.file !== 'string' || !command.file.trim()) return null;
  if (command.args !== undefined && !Array.isArray(command.args)) return null;

  const args = Array.isArray(command.args)
    ? command.args.filter((arg) => typeof arg === 'string')
    : [];
  return { file: command.file.trim(), args };
}

function runValidationCommand(command, cwd) {
  if (command.shell) {
    safeShellExec(command.shell, cwd);
    return;
  }
  safeExec(command.file, command.args, cwd);
}

function getTaskValidationCommands(taskValidation) {
  if (!taskValidation) return [];

  let parsedValidation = taskValidation;
  if (typeof parsedValidation === 'string') {
    for (let i = 0; i < 3; i += 1) {
      const trimmed = parsedValidation.trim();
      if (!trimmed) break;
      try {
        const next = JSON.parse(trimmed);
        if (next === parsedValidation) break;
        parsedValidation = next;
        if (typeof parsedValidation !== 'string') break;
      } catch {
        break;
      }
    }
  }

  const commands = [];
  if (typeof parsedValidation === 'string') {
    const cmd = parseValidationCommand(parsedValidation);
    if (cmd) commands.push(cmd);
    return commands;
  }

  if (!parsedValidation || typeof parsedValidation !== 'object') {
    return commands;
  }

  for (const key of ['build_cmd', 'test_cmd', 'lint_cmd']) {
    const cmd = parseValidationCommand(parsedValidation[key]);
    if (cmd) commands.push(cmd);
  }
  return commands;
}

function getDefaultValidationCommand(validationDir) {
  const packageJsonPath = path.join(validationDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { command: null, reason: 'package_json_missing' };
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return { command: null, reason: 'package_json_parse_error' };
  }

  const scripts = packageJson && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};
  if (typeof scripts.test === 'string' && scripts.test.trim()) {
    return { command: { file: 'npm', args: ['test'] }, reason: null, source: 'scripts.test' };
  }
  if (typeof scripts.build === 'string' && scripts.build.trim()) {
    return { command: { file: 'npm', args: ['run', 'build'] }, reason: null, source: 'scripts.build' };
  }
  return { command: null, reason: 'no_build_or_test_script' };
}

function runOverlapValidation(entry, projectDir) {
  // Only validate when merge_validation config is enabled
  const mergeValidation = db.getConfig('merge_validation');
  if (mergeValidation !== 'true') return null;

  // Check if any overlapping tasks were already merged
  const mergedOverlaps = db.hasOverlappingMergedTasks(entry.task_id);
  if (mergedOverlaps.length === 0) return null;

  db.log('coordinator', 'overlap_validation_start', {
    merge_id: entry.id,
    task_id: entry.task_id,
    overlapping_merged: mergedOverlaps.map(m => m.id),
  });

  const wtPath = findWorktreePath(entry, projectDir);
  const validationDir = wtPath || projectDir;
  const task = db.getTask(entry.task_id);
  const taskValidationCommands = getTaskValidationCommands(task && task.validation);
  const defaultValidation = getDefaultValidationCommand(validationDir);

  // Task-specific commands take priority: when provided, skip the generic default
  const useTaskValidation = taskValidationCommands.length > 0;

  try {
    safeExec('git', ['fetch', 'origin'], validationDir);

    if (!wtPath) {
      // Ensure we're on the task's branch before running validation in the project dir
      safeExec('git', ['checkout', entry.branch], projectDir);
    }

    if (useTaskValidation) {
      // Task commands provided — run them exclusively instead of the generic default
      for (const command of taskValidationCommands) {
        runValidationCommand(command, validationDir);
      }
    } else {
      // No task commands — fall back to package.json default (if available)
      if (defaultValidation.command) {
        runValidationCommand(defaultValidation.command, validationDir);
      }

      if (!defaultValidation.command) {
        db.log('coordinator', 'overlap_validation_default_skipped', {
          merge_id: entry.id,
          task_id: entry.task_id,
          reason: defaultValidation.reason,
        });
      } else {
        db.log('coordinator', 'overlap_validation_default_selected', {
          merge_id: entry.id,
          task_id: entry.task_id,
          source: defaultValidation.source,
        });
      }
    }

    if (!wtPath) {
      safeExec('git', ['checkout', 'main'], projectDir);
    }
    db.log('coordinator', 'overlap_validation_passed', { merge_id: entry.id, task_id: entry.task_id });
    return { passed: true };
  } catch (e) {
    if (!wtPath) {
      try { safeExec('git', ['checkout', 'main'], projectDir); } catch {}
    }
    db.log('coordinator', 'overlap_validation_failed', {
      merge_id: entry.id,
      task_id: entry.task_id,
      error: e.message,
    });
    return { passed: false, error: e.message };
  }
}

function escalateToAllocator(entry, error, isFunctional) {
  const task = db.getTask(entry.task_id);
  const mailType = isFunctional ? 'functional_conflict' : 'merge_failed';
  db.sendMail('allocator', mailType, {
    request_id: entry.request_id,
    task_id: entry.task_id,
    merge_id: entry.id,
    branch: entry.branch,
    pr_url: entry.pr_url,
    error,
    original_task: task ? {
      subject: task.subject,
      description: task.description,
      domain: task.domain,
      files: task.files,
      assigned_to: task.assigned_to,
    } : null,
    overlapping_merged: isFunctional ? db.hasOverlappingMergedTasks(entry.task_id) : undefined,
  });
}

function isBranchInWorktree(branch, projectDir) {
  try {
    const output = safeExec('git', ['worktree', 'list', '--porcelain'], projectDir);
    // Porcelain format has "branch refs/heads/<name>" lines
    return output.includes(`branch refs/heads/${branch}`);
  } catch {
    return false;
  }
}

function isPrMerged(prUrl, projectDir) {
  try {
    const state = safeExec('gh', ['pr', 'view', prUrl, '--json', 'state', '--jq', '.state'], projectDir);
    return state === 'MERGED';
  } catch {
    return false;
  }
}

function tryCleanMerge(entry, projectDir) {
  // Skip --delete-branch if the branch is checked out in a worktree
  const skipDeleteBranch = entry.branch && isBranchInWorktree(entry.branch, projectDir);
  const mergeArgs = ['pr', 'merge', entry.pr_url, '--merge'];
  if (!skipDeleteBranch) {
    mergeArgs.push('--delete-branch');
  }

  try {
    safeExec('gh', mergeArgs, projectDir);
    return { success: true };
  } catch (e) {
    // gh pr merge can fail on post-merge cleanup (e.g. branch deletion)
    // even though the PR was actually merged. Check the real state.
    if (isPrMerged(entry.pr_url, projectDir)) {
      db.log('coordinator', 'merge_post_cleanup_warning', {
        merge_id: entry.id,
        branch: entry.branch,
        warning: e.message,
      });
      return { success: true };
    }
    // Detect missing gh CLI (ENOENT) and propagate ghMissing flag
    if (e.code === 'ENOENT' || (e.message && e.message.includes('ENOENT'))) {
      return { success: false, ghMissing: true, error: e.message };
    }
    return { success: false, error: e.message };
  }
}

function tryDirectGitMerge(entry, projectDir) {
  db.log('coordinator', 'merge_tier3_gh_fallback_start', {
    merge_id: entry.id,
    branch: entry.branch,
  });
  try {
    safeExec('git', ['fetch', 'origin'], projectDir);
    safeExec('git', ['checkout', 'main'], projectDir);
    safeExec(
      'git',
      ['merge', '--no-ff', entry.branch, '-m', `Merge branch ${entry.branch} into main (gh unavailable fallback)`],
      projectDir
    );
    safeExec('git', ['push', 'origin', 'main'], projectDir);
    // Restore worktree checkout best-effort
    try { safeExec('git', ['checkout', entry.branch], projectDir); } catch {}
    db.log('coordinator', 'merge_tier3_gh_fallback_success', {
      merge_id: entry.id,
      branch: entry.branch,
    });
    return { success: true };
  } catch (e) {
    try { safeExec('git', ['checkout', 'main'], projectDir); } catch {}
    db.log('coordinator', 'merge_tier3_gh_fallback_failed', {
      merge_id: entry.id,
      branch: entry.branch,
      error: e.message,
    });
    return { success: false, error: e.message };
  }
}


function checkRequestCompletion(requestId) {
  const allMerges = db.getDb().prepare(
    "SELECT * FROM merge_queue WHERE request_id = ?"
  ).all(requestId);

  const allMerged = allMerges.every(m => m.status === 'merged');
  if (allMerged && allMerges.length > 0) {
    const taskCompletion = db.checkRequestCompletion(requestId);
    const allTasksDone = taskCompletion.all_done === true && taskCompletion.failed === 0;
    if (!allTasksDone) {
      const request = db.getRequest(requestId);
      if (request && request.status !== 'integrating' && request.status !== 'in_progress') {
        db.updateRequest(requestId, { status: 'integrating' });
      }
      return;
    }

    const result = `All ${allMerges.length} PR(s) merged successfully`;
    // Notify Master-1 only on a real transition into completed.
    completeRequestIfTransition(requestId, result);
  }
}

function stop() {
  if (mergerIntervalId) { clearInterval(mergerIntervalId); mergerIntervalId = null; }
}

module.exports = { start, stop, onTaskCompleted, processQueue, attemptMerge, tryRebase };
