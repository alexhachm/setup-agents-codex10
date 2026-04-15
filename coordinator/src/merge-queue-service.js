'use strict';

const { execFileSync } = require('child_process');

const BRANCH_RE = /^[a-zA-Z0-9._\/-]+$/;
const PR_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/pull\/\d+$/;
const PR_NUMBER_RE = /^#?(\d+)$/;
const PR_REFERENCE_RE = /^(pull request|pull|pr)\s*#?(\d+)$/i;
const WORKER_BRANCH_RE = /^agent-\d+$/;
const PR_RESOLVE_ERROR_RE = /Could not resolve to a PullRequest/i;

function sanitizeBranchName(rawBranch) {
  if (typeof rawBranch !== 'string') return '';
  const trimmed = rawBranch.trim();
  if (!trimmed || !BRANCH_RE.test(trimmed)) return '';
  return trimmed;
}

function parseGitHubRepoFromRemoteUrl(remoteUrl) {
  const trimmed = String(remoteUrl || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const host = (parsed.hostname || '').toLowerCase();
    if (!host.endsWith('github.com')) return '';
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return '';
    return `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`;
  } catch {
    const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
    return '';
  }
}

function getProjectGitHubRepoPath(cwd = process.cwd()) {
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return parseGitHubRepoFromRemoteUrl(remoteUrl);
  } catch {
    return '';
  }
}

function extractPrNumber(rawPrUrl) {
  if (typeof rawPrUrl !== 'string') return '';
  const trimmed = rawPrUrl.trim();
  if (!trimmed) return '';
  const match = trimmed.match(PR_NUMBER_RE);
  if (match) return match[1];
  const refMatch = trimmed.match(PR_REFERENCE_RE);
  if (refMatch) return refMatch[2];
  return '';
}

function normalizePrUrl(rawPrUrl, cwd = process.cwd()) {
  if (typeof rawPrUrl !== 'string') return '';
  const trimmed = rawPrUrl.trim();
  if (!trimmed) return '';
  if (PR_URL_RE.test(trimmed)) return trimmed;

  const normalizedMatch = extractPrNumber(trimmed);
  if (!normalizedMatch) return trimmed;

  const repoPath = getProjectGitHubRepoPath(cwd);
  if (!repoPath) return trimmed;
  return `https://github.com/${repoPath}/pull/${normalizedMatch}`;
}

function isValidGitHubPrUrl(value) {
  return typeof value === 'string' && PR_URL_RE.test(value);
}

function isResolvableGitHubPrUrl(prUrl, cwd = process.cwd()) {
  if (!isValidGitHubPrUrl(prUrl)) return false;
  try {
    execFileSync('gh', ['pr', 'view', prUrl, '--json', 'state'], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 12000,
    });
    return true;
  } catch (e) {
    const errorText = String(e.message || '') + String(e.stderr || '') + String(e.stdout || '');
    if (PR_RESOLVE_ERROR_RE.test(errorText)) return false;
    return true;
  }
}

function findOpenPrUrlForBranch(rawBranch, cwd = process.cwd()) {
  const branch = sanitizeBranchName(rawBranch);
  if (!branch) return '';
  try {
    const prUrl = execFileSync('gh', ['pr', 'list', '--state', 'open', '--head', branch, '--json', 'url', '--jq', '.[0].url'], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 12000,
    }).trim();
    if (!isValidGitHubPrUrl(prUrl)) return '';
    return prUrl;
  } catch {
    return '';
  }
}

function resolveQueuePrTarget(prUrl, branch, cwd = process.cwd(), options = {}) {
  const normalizedPrUrl = normalizePrUrl(prUrl, cwd);
  if (isValidGitHubPrUrl(normalizedPrUrl) && isResolvableGitHubPrUrl(normalizedPrUrl, cwd)) {
    const original = typeof prUrl === 'string' ? prUrl.trim() : '';
    return {
      pr_url: normalizedPrUrl,
      source: normalizedPrUrl === original ? 'provided' : 'normalized',
      resolvable: true,
    };
  }

  if (options.allowBranchFallback === true) {
    const branchPrUrl = findOpenPrUrlForBranch(branch, cwd);
    if (branchPrUrl) {
      return {
        pr_url: branchPrUrl,
        source: 'branch_fallback',
        resolvable: true,
      };
    }
  }

  return {
    pr_url: normalizedPrUrl,
    source: 'unresolved',
    resolvable: false,
  };
}

function parseWorkerId(rawWorkerId) {
  const parsed = parseInt(rawWorkerId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function canonicalBranchForWorkerId(rawWorkerId) {
  const workerId = parseWorkerId(rawWorkerId);
  if (workerId === null) return '';
  return `agent-${workerId}`;
}

function readWorkerBranchFromWorktree(worker) {
  const worktreePath = worker && worker.worktree_path ? String(worker.worktree_path).trim() : '';
  if (!worktreePath) return '';
  try {
    const branch = sanitizeBranchName(execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
    return WORKER_BRANCH_RE.test(branch) ? branch : '';
  } catch {
    return '';
  }
}

function branchExists(rawBranch, repositoryDir = process.cwd()) {
  const branch = sanitizeBranchName(rawBranch);
  if (!branch) return false;
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      encoding: 'utf8',
      cwd: repositoryDir,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function resolveWorkerBranch(worker, fallbackWorkerId = null) {
  const workerId = worker && worker.id !== undefined && worker.id !== null
    ? worker.id
    : fallbackWorkerId;
  const canonicalBranch = canonicalBranchForWorkerId(workerId);
  const workerBranch = sanitizeBranchName(worker && worker.branch ? String(worker.branch) : '');
  const worktreeBranch = readWorkerBranchFromWorktree(worker);
  const worktreePath = worker && worker.worktree_path ? String(worker.worktree_path).trim() : '';

  if (canonicalBranch && branchExists(canonicalBranch, worktreePath || process.cwd())) {
    return canonicalBranch;
  }

  if (WORKER_BRANCH_RE.test(workerBranch) && branchExists(workerBranch, worktreePath || process.cwd())) return workerBranch;
  if (worktreeBranch && branchExists(worktreeBranch, worktreePath || process.cwd())) return worktreeBranch;
  if (canonicalBranch) return canonicalBranch;
  if (WORKER_BRANCH_RE.test(workerBranch)) return workerBranch;
  if (worktreeBranch) return worktreeBranch;
  return '';
}

function resolveCompletionBranch(worker, reportedBranch, fallbackWorkerId = null) {
  const workerBranch = resolveWorkerBranch(worker, fallbackWorkerId);
  const requestedBranch = sanitizeBranchName(reportedBranch);

  if (!requestedBranch) return { branch: workerBranch || null, mismatch: false, requestedBranch: null, workerBranch };
  if (!workerBranch) {
    return { branch: null, mismatch: true, requestedBranch, workerBranch: null };
  }

  if (requestedBranch !== workerBranch) {
    return { branch: workerBranch, mismatch: true, requestedBranch, workerBranch };
  }

  return { branch: requestedBranch, mismatch: false, requestedBranch, workerBranch };
}

function isMergeOwnershipCollisionReason(reason) {
  return reason === 'existing_pr_owned_by_other_request' || reason === 'duplicate_pr_owned_by_other_request';
}

function preQueueOverlapCheck({ db, taskId, changedFiles }) {
  if (!changedFiles || changedFiles.length === 0) return;

  const normalize = (f) => String(f).replace(/^\.\//, '');
  const normalizedChanged = changedFiles.map(normalize);

  const entries = db.getDb().prepare(
    "SELECT mq.id, mq.request_id, mq.task_id, mq.branch, mq.status, t.files " +
    "FROM merge_queue mq LEFT JOIN tasks t ON t.id = mq.task_id " +
    "WHERE mq.status IN ('pending', 'ready') AND mq.task_id != ?"
  ).all(taskId);

  for (const entry of entries) {
    let entryFiles;
    try {
      entryFiles = entry.files ? JSON.parse(entry.files).map(normalize) : [];
    } catch {
      entryFiles = [];
    }
    if (entryFiles.length === 0) continue;

    const shared = normalizedChanged.filter((f) => entryFiles.includes(f));
    if (shared.length === 0) continue;

    db.updateMerge(entry.id, { status: 'pending', error: null });
    db.incrementMetric('merge_queue_overlap_serializations');
    db.log('coordinator', 'merge_queue_overlap_serialized', {
      completing_task_id: taskId,
      overlapping_merge_id: entry.id,
      overlapping_task_id: entry.task_id,
      overlapping_branch: entry.branch,
      shared_files: shared,
    });
  }
}

function queueMergeWithRecovery({
  db,
  projectDir = process.cwd(),
  request_id,
  task_id,
  pr_url,
  branch,
  priority = 0,
  force_retry = false,
  latest_completion_timestamp = undefined,
  allow_branch_pr_fallback = false,
}) {
  const normalizedPriority = Number.isInteger(priority) ? priority : 0;
  const queueCwd = projectDir || process.cwd();
  const resolvedPr = resolveQueuePrTarget(pr_url, branch, queueCwd, {
    allowBranchFallback: allow_branch_pr_fallback === true,
  });
  const resolvedPrUrl = resolvedPr.pr_url;

  if (resolvedPr.source === 'branch_fallback' && isValidGitHubPrUrl(resolvedPrUrl)) {
    db.updateTask(task_id, { pr_url: resolvedPrUrl });
    db.log('coordinator', 'merge_queue_pr_url_recovered_from_branch', {
      request_id,
      task_id,
      branch,
      original_pr_url: typeof pr_url === 'string' ? pr_url : null,
      resolved_pr_url: resolvedPrUrl,
    });
  }

  if (!resolvedPr.resolvable) {
    const staleEntries = db.getDb().prepare(`
      SELECT id, status
      FROM merge_queue
      WHERE request_id = ?
        AND task_id = ?
        AND status NOT IN ('merged', 'merging')
    `).all(request_id, task_id);
    for (const entry of staleEntries) {
      if (entry.status === 'pending') {
        db.updateMerge(entry.id, { status: 'failed', error: 'invalid_or_missing_pr' });
      }
    }
    return {
      queued: false,
      inserted: false,
      refreshed: false,
      retried: false,
      reason: 'invalid_or_missing_pr',
      resolved_pr_url: isValidGitHubPrUrl(resolvedPrUrl) ? resolvedPrUrl : null,
      pr_resolution_source: resolvedPr.source,
    };
  }

  db.getDb().prepare(`
    DELETE FROM merge_queue
    WHERE request_id = ?
      AND branch = ?
      AND pr_url <> ?
      AND status NOT IN ('merged', 'merging')
  `).run(request_id, branch, resolvedPrUrl);

  const getLatestCheckpoint = () => {
    if (latest_completion_timestamp !== undefined) return latest_completion_timestamp;
    return db.getRequestLatestCompletedTaskCursor(request_id);
  };
  const latestCheckpoint = getLatestCheckpoint();

  const enqueueResult = db.enqueueMerge({
    request_id,
    task_id,
    pr_url: resolvedPrUrl,
    branch,
    priority: normalizedPriority,
    completion_checkpoint: latestCheckpoint,
  });
  if (enqueueResult.inserted) {
    const existingDuplicatePrOwner = db.getDb().prepare(`
      SELECT id, request_id, task_id, branch, status
      FROM merge_queue
      WHERE pr_url = ?
        AND id != ?
        AND (
          request_id != ?
          OR branch != ?
        )
      ORDER BY id DESC
      LIMIT 1
    `).get(resolvedPrUrl, enqueueResult.lastInsertRowid, request_id, branch);
    if (existingDuplicatePrOwner) {
      db.getDb().prepare('DELETE FROM merge_queue WHERE id = ?').run(enqueueResult.lastInsertRowid);
      db.log('coordinator', 'merge_queue_duplicate_pr_ownership_rejected', {
        request_id,
        task_id,
        pr_url: resolvedPrUrl,
        branch,
        duplicate_merge_id: enqueueResult.lastInsertRowid,
        existing_merge_id: existingDuplicatePrOwner.id,
        existing_request_id: existingDuplicatePrOwner.request_id,
        existing_task_id: existingDuplicatePrOwner.task_id,
        existing_branch: existingDuplicatePrOwner.branch,
        existing_status: existingDuplicatePrOwner.status,
      });
      return {
        queued: false,
        inserted: false,
        refreshed: false,
        retried: false,
        reason: 'duplicate_pr_owned_by_other_request',
        merge_id: existingDuplicatePrOwner.id,
        duplicate_merge_id: enqueueResult.lastInsertRowid,
        existing_request_id: existingDuplicatePrOwner.request_id,
        existing_task_id: existingDuplicatePrOwner.task_id,
        existing_branch: existingDuplicatePrOwner.branch,
        existing_status: existingDuplicatePrOwner.status,
        resolved_pr_url: resolvedPrUrl,
        pr_resolution_source: resolvedPr.source,
      };
    }
    return {
      queued: true,
      inserted: true,
      refreshed: false,
      retried: false,
      resolved_pr_url: resolvedPrUrl,
      pr_resolution_source: resolvedPr.source,
    };
  }

  const existing = db.getDb().prepare(`
    SELECT id, request_id, task_id, branch, status, priority, pr_url, updated_at, completion_checkpoint
    FROM merge_queue
    WHERE request_id = ?
      AND pr_url = ?
      AND branch = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(request_id, resolvedPrUrl, branch);

  if (!existing) {
    const existingByPr = db.getDb().prepare(`
      SELECT id, request_id, task_id, branch, status
      FROM merge_queue
      WHERE pr_url = ?
        AND (
          request_id != ?
          OR branch != ?
        )
      ORDER BY id DESC
      LIMIT 1
    `).get(resolvedPrUrl, request_id, branch);
    if (existingByPr) {
      return {
        queued: false,
        inserted: false,
        refreshed: false,
        retried: false,
        reason: 'existing_pr_owned_by_other_request',
        merge_id: existingByPr.id,
        existing_request_id: existingByPr.request_id,
        existing_task_id: existingByPr.task_id,
        existing_branch: existingByPr.branch,
        existing_status: existingByPr.status,
        resolved_pr_url: resolvedPrUrl,
        pr_resolution_source: resolvedPr.source,
      };
    }
    return {
      queued: false,
      inserted: false,
      refreshed: false,
      retried: false,
      reason: 'missing_existing_entry',
      resolved_pr_url: resolvedPrUrl,
      pr_resolution_source: resolvedPr.source,
    };
  }
  if (existing.status === 'merged' || existing.status === 'merging') {
    return {
      queued: false,
      inserted: false,
      refreshed: false,
      retried: false,
      reason: `status_${existing.status}`,
      resolved_pr_url: resolvedPrUrl,
      pr_resolution_source: resolvedPr.source,
    };
  }

  const ownerTaskChanged = Number(existing.task_id) !== Number(task_id);
  const currentPriority = Number.isInteger(existing.priority) ? existing.priority : 0;
  const desiredPriority = Math.max(currentPriority, normalizedPriority);
  const isTerminalRetryStatus = existing.status === 'failed' || existing.status === 'conflict';
  const mergeIdentityChanged =
    existing.branch !== branch ||
    existing.pr_url !== resolvedPrUrl;
  const hasFreshCompletionProgress = isTerminalRetryStatus && db.hasRequestCompletedTaskProgressSince(
    request_id,
    existing.completion_checkpoint,
    latestCheckpoint
  );
  const shouldRetry = isTerminalRetryStatus && (force_retry || hasFreshCompletionProgress || mergeIdentityChanged || ownerTaskChanged);
  const desiredStatus = shouldRetry ? 'pending' : existing.status;
  const needsRefresh =
    mergeIdentityChanged ||
    ownerTaskChanged ||
    currentPriority !== desiredPriority ||
    existing.status !== desiredStatus;

  if (!needsRefresh) {
    if (isTerminalRetryStatus && !shouldRetry) {
      return {
        queued: false,
        inserted: false,
        refreshed: false,
        retried: false,
        reason: 'terminal_without_fresh_progress',
        resolved_pr_url: resolvedPrUrl,
        pr_resolution_source: resolvedPr.source,
      };
    }
    return {
      queued: false,
      inserted: false,
      refreshed: false,
      retried: false,
      reason: 'already_current',
      resolved_pr_url: resolvedPrUrl,
      pr_resolution_source: resolvedPr.source,
    };
  }

  db.getDb().prepare(`
    UPDATE merge_queue
    SET task_id = ?,
        branch = ?,
        pr_url = ?,
        priority = ?,
        status = ?,
        error = CASE WHEN ? = 1 THEN NULL ELSE error END,
        completion_checkpoint = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(
    task_id,
    branch,
    resolvedPrUrl,
    desiredPriority,
    desiredStatus,
    shouldRetry ? 1 : 0,
    shouldRetry ? (latestCheckpoint || null) : existing.completion_checkpoint,
    existing.id
  );

  return {
    queued: shouldRetry,
    inserted: false,
    refreshed: true,
    retried: shouldRetry,
    previous_status: existing.status,
    merge_id: existing.id,
    resolved_pr_url: resolvedPrUrl,
    pr_resolution_source: resolvedPr.source,
  };
}

module.exports = {
  sanitizeBranchName,
  parseGitHubRepoFromRemoteUrl,
  getProjectGitHubRepoPath,
  extractPrNumber,
  normalizePrUrl,
  isValidGitHubPrUrl,
  isResolvableGitHubPrUrl,
  findOpenPrUrlForBranch,
  resolveQueuePrTarget,
  canonicalBranchForWorkerId,
  readWorkerBranchFromWorktree,
  branchExists,
  resolveWorkerBranch,
  resolveCompletionBranch,
  isMergeOwnershipCollisionReason,
  preQueueOverlapCheck,
  queueMergeWithRecovery,
};
