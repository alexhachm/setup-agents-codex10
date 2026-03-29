'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const insightIngestion = require('./insight-ingestion');

const BRANCH_RE = /^[a-zA-Z0-9._\/-]+$/;
const PR_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/pull\/\d+$/;

function validateEntry(entry) {
  if (entry.branch && !BRANCH_RE.test(entry.branch)) {
    throw new Error(`Invalid branch name: ${entry.branch}`);
  }
  if (entry.pr_url && !PR_URL_RE.test(entry.pr_url)) {
    throw new Error(`Invalid PR URL: ${entry.pr_url}`);
  }
}

function safeExec(file, args, cwd) {
  const home = process.env.HOME || '';
  const env = {
    ...process.env,
    PATH: `${home}/.local/bin:${home}/bin:/snap/bin:${process.env.PATH || ''}`,
  };
  return execFileSync(file, args, { encoding: 'utf8', cwd, timeout: 60000, env }).trim();
}

let processing = false;
let processingStartedAt = 0;
const PROCESSING_TIMEOUT_MS = 300000; // 5 minutes — reset flag if stuck
let mergerIntervalId = null;

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
  const task = db.getTask(taskId);
  if (!task) return;

  const allTasks = db.listTasks({ request_id: task.request_id });
  const incomplete = allTasks.filter(t => t.status !== 'completed' && t.status !== 'failed');
  const failedTasks = allTasks.filter(t => t.status === 'failed');

  if (incomplete.length === 0) {
    // Check for conflict merges that should be retried — fix tasks may have resolved them.
    const recoverableMerges = db.getDb().prepare(
      `SELECT id FROM merge_queue WHERE request_id = ? AND status = 'conflict'`
    ).all(task.request_id);

    if (recoverableMerges.length > 0) {
      for (const m of recoverableMerges) {
        db.updateMerge(m.id, { status: 'pending', error: null });
      }
      db.updateRequest(task.request_id, { status: 'integrating' });
      db.log('coordinator', 'recoverable_merges_retried', {
        request_id: task.request_id,
        merge_ids: recoverableMerges.map(m => m.id),
      });
      return;
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

      // Fetch merged changes (fetch-only avoids dirty-worktree failures)
      try {
        safeExec('git', ['fetch', 'origin', 'main'], projectDir);
      } catch (fetchErr) {
        db.log('coordinator', 'post_merge_fetch_failed', {
          merge_id: entry.id,
          error: fetchErr.message,
        });
      }

      checkRequestCompletion(entry.request_id);
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

  // Tier 1: Clean merge via gh CLI
  const tier1 = tryCleanMerge(entry, projectDir);
  if (tier1.success) return { success: true, tier: 1 };

  // Tier 2: Rebase and retry
  const tier2 = tryRebase(entry, projectDir);
  if (tier2.success) {
    const retry = tryCleanMerge(entry, projectDir);
    if (retry.success) return { success: true, tier: 2 };
  }

  // Both failed — mark conflict and notify allocator
  escalateToAllocator(entry, tier2.error || tier1.error);
  return { success: false, conflict: true, error: tier2.error || tier1.error, tier: 3 };
}

// Find the worktree path for a merge entry's branch.
function findWorktreePath(entry, projectDir) {
  try {
    const task = db.getTask(entry.task_id);
    if (task && task.assigned_to) {
      const worker = db.getWorker(task.assigned_to);
      if (worker && worker.worktree_path && fs.existsSync(worker.worktree_path)) {
        return worker.worktree_path;
      }
    }
  } catch {}

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
      if (isWorktreeDirty(wtPath)) {
        safeExec('git', ['checkout', '.'], wtPath);
        safeExec('git', ['clean', '-fd'], wtPath);
        db.log('coordinator', 'dirty_worktree_reset', {
          branch: entry.branch,
          reason: 'dirty_worktree_before_rebase',
          path: 'worktree',
        });
      }

      safeExec('git', ['rebase', 'origin/main'], wtPath);
      try {
        safeExec('git', ['push', '--force-with-lease', 'origin', entry.branch], wtPath);
      } catch (pushErr) {
        db.log('coordinator', 'rebase_push_failed', {
          branch: entry.branch,
          error: pushErr.message,
        });
        throw pushErr;
      }
    } else {
      safeExec('git', ['checkout', entry.branch], projectDir);

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

function escalateToAllocator(entry, error) {
  const fresh = db.getMerge(entry.id);
  const count = (fresh && fresh.escalation_count) || 0;
  if (count >= 2) {
    db.log('coordinator', 'merge_escalation_capped', { merge_id: entry.id, count, error });
    return;
  }
  db.updateMerge(entry.id, { escalation_count: count + 1 });

  const task = db.getTask(entry.task_id);
  db.sendMail('allocator', 'merge_failed', {
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
  });
}

function isBranchInWorktree(branch, projectDir) {
  try {
    const output = safeExec('git', ['worktree', 'list', '--porcelain'], projectDir);
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
  const skipDeleteBranch = entry.branch && isBranchInWorktree(entry.branch, projectDir);
  const mergeArgs = ['pr', 'merge', entry.pr_url, '--merge'];
  if (!skipDeleteBranch) {
    mergeArgs.push('--delete-branch');
  }

  try {
    safeExec('gh', mergeArgs, projectDir);
    return { success: true };
  } catch (e) {
    if (isPrMerged(entry.pr_url, projectDir)) {
      db.log('coordinator', 'merge_post_cleanup_warning', {
        merge_id: entry.id,
        branch: entry.branch,
        warning: e.message,
      });
      return { success: true };
    }
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
    completeRequestIfTransition(requestId, result);
  }
}

function stop() {
  if (mergerIntervalId) { clearInterval(mergerIntervalId); mergerIntervalId = null; }
}

module.exports = { start, stop, onTaskCompleted, processQueue, attemptMerge, tryRebase };
