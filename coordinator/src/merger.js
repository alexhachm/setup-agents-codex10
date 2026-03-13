'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const BRANCH_RE = /^[a-zA-Z0-9._\/-]+$/;
const PR_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/pull\/\d+$/;
const MERGE_TIMEOUT_ERROR_PREFIX = 'Merge timed out after';

function validateEntry(entry) {
  if (entry.branch && !BRANCH_RE.test(entry.branch)) {
    throw new Error(`Invalid branch name: ${entry.branch}`);
  }
  if (entry.pr_url && !PR_URL_RE.test(entry.pr_url)) {
    throw new Error(`Invalid PR URL: ${entry.pr_url}`);
  }
}

function safeExec(file, args, cwd) {
  return execFileSync(file, args, { encoding: 'utf8', cwd, timeout: 60000 }).trim();
}

let processing = false;
let processingStartedAt = 0;
const PROCESSING_TIMEOUT_MS = 300000; // 5 minutes — reset flag if stuck
let mergerIntervalId = null;
const assignmentPriorityDeferralsByMergeId = new Map();
const ASSIGNMENT_PRIORITY_DEFAULT_MAX_CONSECUTIVE_DEFERRALS = 3;
const ASSIGNMENT_PRIORITY_DEFAULT_MAX_DEFER_AGE_MS = 120000;
const ASSIGNMENT_PRIORITY_ENABLED_CONFIG_KEY = 'prioritize_assignment_over_merge';
const ASSIGNMENT_PRIORITY_MAX_CONSECUTIVE_DEFERRALS_CONFIG_KEY = 'assignment_priority_merge_max_deferrals';
const ASSIGNMENT_PRIORITY_MAX_DEFER_AGE_MS_CONFIG_KEY = 'assignment_priority_merge_max_age_ms';

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

  if (!thresholdBreachedByCount && !thresholdBreachedByAge) {
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

    // Check if there are any pending merges to process
    const pendingMerges = db.getDb().prepare(
      "SELECT COUNT(*) as cnt FROM merge_queue WHERE request_id = ? AND status IN ('pending', 'merging')"
    ).get(task.request_id);

    if (pendingMerges.cnt > 0) {
      // Has PRs to merge — mark as integrating, merger will handle it
      db.updateRequest(task.request_id, { status: 'integrating' });
      db.log('coordinator', 'request_ready_for_merge', { request_id: task.request_id });
    } else {
      if (failedTasks.length > 0) {
        return;
      }
      // No PRs to merge — complete immediately (e.g. verification tasks, already-merged)
      const result = `All ${allTasks.length} task(s) completed (no PRs to merge)`;
      completeRequestIfTransition(task.request_id, result);
    }
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

      // Check if entire request is now complete
      checkRequestCompletion(entry.request_id);
    } else if (result.functional_conflict) {
      db.updateMerge(entry.id, { status: 'failed', error: `functional_conflict: ${result.error}` });
      db.log('coordinator', 'functional_conflict', {
        merge_id: entry.id,
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
  if (tier2.success) {
    // Post-rebase validation if overlapping tasks exist
    const postValidation = runOverlapValidation(entry, projectDir);
    if (postValidation && !postValidation.passed) {
      escalateToAllocator(entry, postValidation.error, true);
      return { success: false, functional_conflict: true, error: postValidation.error, tier: 'validation' };
    }
    // Rebase succeeded, try clean merge again
    const retry = tryCleanMerge(entry, projectDir);
    if (retry.success) return { success: true, tier: 2 };
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

function tryRebase(entry, projectDir) {
  const wtPath = findWorktreePath(entry, projectDir);
  const rebaseDir = wtPath || projectDir;

  try {
    safeExec('git', ['fetch', 'origin'], rebaseDir);

    if (wtPath) {
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
  if (typeof command !== 'string' || !command.trim()) return null;
  const parts = command.trim().split(/\s+/);
  if (parts.length === 0) return null;
  return { file: parts[0], args: parts.slice(1) };
}

function getTaskValidationCommands(taskValidation) {
  if (!taskValidation) return [];

  let parsedValidation = taskValidation;
  if (typeof taskValidation === 'string') {
    try {
      parsedValidation = JSON.parse(taskValidation);
    } catch {
      parsedValidation = taskValidation;
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
  if (typeof scripts.build === 'string' && scripts.build.trim()) {
    return { command: { file: 'npm', args: ['run', 'build'] }, reason: null, source: 'scripts.build' };
  }
  if (typeof scripts.test === 'string' && scripts.test.trim()) {
    return { command: { file: 'npm', args: ['run', 'test'] }, reason: null, source: 'scripts.test' };
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

  try {
    safeExec('git', ['fetch', 'origin'], validationDir);

    if (wtPath) {
      // Validate directly in worktree (branch already checked out)
      if (defaultValidation.command) {
        safeExec(defaultValidation.command.file, defaultValidation.command.args, wtPath);
      }
    } else {
      // Fallback: old behavior
      safeExec('git', ['checkout', entry.branch], projectDir);
      if (defaultValidation.command) {
        safeExec(defaultValidation.command.file, defaultValidation.command.args, projectDir);
      }
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

    for (const command of taskValidationCommands) {
      safeExec(command.file, command.args, validationDir);
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
    const allTasksCompletedSuccessfully = taskCompletion.all_completed && taskCompletion.failed === 0;
    if (!allTasksCompletedSuccessfully) {
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

module.exports = { start, stop, onTaskCompleted, processQueue, attemptMerge };
