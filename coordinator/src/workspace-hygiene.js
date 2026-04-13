'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function sanitizeNamespace(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'mac10-project';
}

function deriveNamespace(projectDir) {
  if (process.env.MAC10_NAMESPACE) return sanitizeNamespace(process.env.MAC10_NAMESPACE);
  const base = path.basename(path.resolve(projectDir || process.cwd())) || 'project';
  return sanitizeNamespace(`mac10-${base}`);
}

function getReportPath(projectDir, namespace = deriveNamespace(projectDir)) {
  return path.join(projectDir, '.claude', 'state', `${namespace}.workspace-hygiene.json`);
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function runGit(args, cwd, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function parseGitCount(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function getSourceRevision(cwd) {
  const revision = {
    current_branch: null,
    head_commit: null,
    origin_main_commit: null,
    ahead_count: null,
    behind_count: null,
    dirty_worktree: null,
  };

  const currentBranch = runGit(['branch', '--show-current'], cwd, { allowFailure: true });
  if (currentBranch) revision.current_branch = currentBranch;

  const headCommit = runGit(['rev-parse', 'HEAD'], cwd, { allowFailure: true });
  if (headCommit) revision.head_commit = headCommit;

  const originMainCommit = runGit(['rev-parse', 'origin/main'], cwd, { allowFailure: true });
  if (originMainCommit) revision.origin_main_commit = originMainCommit;

  const revisionCounts = runGit(['rev-list', '--left-right', '--count', 'HEAD...origin/main'], cwd, { allowFailure: true });
  if (revisionCounts) {
    const [aheadRaw, behindRaw] = revisionCounts.split(/\s+/).filter(Boolean);
    revision.ahead_count = parseGitCount(aheadRaw);
    revision.behind_count = parseGitCount(behindRaw);
  }

  const porcelain = runGit(['status', '--porcelain'], cwd, { allowFailure: true });
  if (porcelain !== null) revision.dirty_worktree = porcelain.length > 0;

  return revision;
}

function parseStatusEntries(cwd) {
  let output = null;
  try {
    output = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return [];
  }
  if (!output) return [];
  return output
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2);
      let filePath = line.slice(3);
      if (filePath.includes(' -> ')) filePath = filePath.split(' -> ').pop();
      return {
        status,
        path: String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, ''),
      };
    });
}

function classifyRelativePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const base = path.posix.basename(normalized);

  if (normalized.startsWith('.claude/state/')) return 'ephemeral_runtime';
  if (normalized.startsWith('.claude/signals/')) return 'ephemeral_runtime';

  if (normalized.startsWith('.claude/knowledge/')) return 'managed_generated';

  if (normalized.startsWith('.live-e2e-workspaces/')) return 'generated_artifact';
  if (normalized.startsWith('status/live-')) return 'generated_artifact';
  if (normalized.includes('/__pycache__/') || normalized.startsWith('__pycache__/')) return 'generated_artifact';
  if (base === '__pycache__') return 'generated_artifact';
  if (/\.py[cod]$/.test(base)) return 'generated_artifact';
  if (/\.(db|db-shm|db-wal|db\.bak|db\.corrupt\.bak)$/.test(base)) return 'generated_artifact';

  return 'operator_source';
}

function classifyEntries(entries) {
  const buckets = {
    ephemeral_runtime: [],
    generated_artifact: [],
    managed_generated: [],
    operator_source: [],
    unknown: [],
  };
  for (const entry of entries) {
    const bucket = classifyRelativePath(entry.path);
    if (Object.prototype.hasOwnProperty.call(buckets, bucket)) {
      buckets[bucket].push(entry);
    } else {
      buckets.unknown.push(entry);
    }
  }
  return buckets;
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function cleanupEphemeralEntries(projectDir, entries) {
  const trackedPaths = [];
  const untrackedPaths = [];

  for (const entry of entries) {
    if (entry.status === '??') untrackedPaths.push(entry.path);
    else trackedPaths.push(entry.path);
  }

  const cleaned = {
    tracked_restored: [],
    untracked_removed: [],
  };

  const uniqueTracked = uniq(trackedPaths);
  if (uniqueTracked.length) {
    runGit(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...uniqueTracked], projectDir);
    cleaned.tracked_restored.push(...uniqueTracked);
  }

  const uniqueUntracked = uniq(untrackedPaths);
  for (const relativePath of uniqueUntracked) {
    removePath(path.join(projectDir, relativePath));
    cleaned.untracked_removed.push(relativePath);
  }

  return cleaned;
}

function hasOriginRemote(projectDir) {
  return runGit(['remote', 'get-url', 'origin'], projectDir, { allowFailure: true }) !== null;
}

function fetchOrigin(projectDir) {
  if (!hasOriginRemote(projectDir)) {
    return { attempted: false, succeeded: false, error: null };
  }
  try {
    runGit(['fetch', 'origin', '--prune'], projectDir);
    return { attempted: true, succeeded: true, error: null };
  } catch (error) {
    return {
      attempted: true,
      succeeded: false,
      error: error && error.message ? error.message : String(error),
    };
  }
}

function tryFastForwardMain(projectDir, sourceRevisionBefore) {
  const branch = sourceRevisionBefore.current_branch;
  const ahead = sourceRevisionBefore.ahead_count || 0;
  const behind = sourceRevisionBefore.behind_count || 0;

  if (branch !== 'main') {
    return { attempted: false, succeeded: false, reason: 'not_on_main' };
  }
  if (ahead > 0) {
    return { attempted: false, succeeded: false, reason: 'local_branch_ahead' };
  }
  if (behind <= 0) {
    return { attempted: false, succeeded: false, reason: 'already_up_to_date' };
  }
  try {
    runGit(['merge', '--ff-only', 'origin/main'], projectDir);
    return { attempted: true, succeeded: true, reason: null };
  } catch (error) {
    return {
      attempted: true,
      succeeded: false,
      reason: error && error.message ? error.message : 'fast_forward_failed',
    };
  }
}

function summarizeBuckets(buckets) {
  return {
    ephemeral_runtime: buckets.ephemeral_runtime.map((entry) => entry.path),
    generated_artifact: buckets.generated_artifact.map((entry) => entry.path),
    managed_generated: buckets.managed_generated.map((entry) => entry.path),
    operator_source: buckets.operator_source.map((entry) => entry.path),
    unknown: buckets.unknown.map((entry) => entry.path),
  };
}

function evaluateWorkspace(projectDir, { mode = 'status' } = {}) {
  const resolvedProjectDir = path.resolve(projectDir || process.cwd());
  const namespace = deriveNamespace(resolvedProjectDir);
  const reportPath = getReportPath(resolvedProjectDir, namespace);
  const report = {
    ok: true,
    mode,
    project_dir: resolvedProjectDir,
    namespace,
    report_path: reportPath,
    actions: [],
    classification: {
      ephemeral_runtime: [],
      generated_artifact: [],
      managed_generated: [],
      operator_source: [],
      unknown: [],
    },
    summary: {
      changed_count: 0,
      ephemeral_runtime_count: 0,
      generated_artifact_count: 0,
      managed_generated_count: 0,
      operator_source_count: 0,
      unknown_count: 0,
    },
    result: 'clean',
    display_message: null,
    suppress_drift_warning: false,
    source_revision_before: null,
    source_revision_after: null,
    generated_at: new Date().toISOString(),
  };

  try {
    const fetchResult = fetchOrigin(resolvedProjectDir);
    if (fetchResult.attempted) {
      report.actions.push({
        type: fetchResult.succeeded ? 'fetch_origin' : 'fetch_origin_error',
        error: fetchResult.error || null,
      });
    }

    report.source_revision_before = getSourceRevision(resolvedProjectDir);

    const initialEntries = parseStatusEntries(resolvedProjectDir);
    const initialBuckets = classifyEntries(initialEntries);
    report.classification = summarizeBuckets(initialBuckets);
    report.summary = {
      changed_count: initialEntries.length,
      ephemeral_runtime_count: initialBuckets.ephemeral_runtime.length,
      generated_artifact_count: initialBuckets.generated_artifact.length,
      managed_generated_count: initialBuckets.managed_generated.length,
      operator_source_count: initialBuckets.operator_source.length,
      unknown_count: initialBuckets.unknown.length,
    };

    if (initialBuckets.ephemeral_runtime.length) {
      const cleanup = cleanupEphemeralEntries(resolvedProjectDir, initialBuckets.ephemeral_runtime);
      report.actions.push({
        type: 'cleanup_ephemeral_runtime',
        tracked_restored: cleanup.tracked_restored,
        untracked_removed: cleanup.untracked_removed,
      });
    }

    let postCleanupEntries = parseStatusEntries(resolvedProjectDir);
    let postCleanupBuckets = classifyEntries(postCleanupEntries);

    const onlyManagedGeneratedRemain = postCleanupEntries.length > 0
      && postCleanupBuckets.managed_generated.length === postCleanupEntries.length;
    const onlyGeneratedArtifactsRemain = postCleanupEntries.length > 0
      && postCleanupBuckets.generated_artifact.length === postCleanupEntries.length;

    const hasBlockingSourceEdits = postCleanupBuckets.operator_source.length > 0;
    const hasUnknownEdits = postCleanupBuckets.unknown.length > 0;

    if (!postCleanupEntries.length) {
      const ffResult = tryFastForwardMain(resolvedProjectDir, report.source_revision_before);
      if (ffResult.attempted || ffResult.reason !== 'already_up_to_date') {
        report.actions.push({
          type: ffResult.succeeded ? 'fast_forward_main' : 'fast_forward_skipped',
          reason: ffResult.reason,
        });
      }
      postCleanupEntries = parseStatusEntries(resolvedProjectDir);
      postCleanupBuckets = classifyEntries(postCleanupEntries);
      if (ffResult.succeeded) {
        report.result = 'fast_forwarded';
        report.display_message = 'Workspace auto-synced to origin/main.';
        report.suppress_drift_warning = true;
      } else if (report.actions.some((action) => action.type === 'cleanup_ephemeral_runtime')) {
        report.result = 'cleaned_ephemeral_runtime';
        report.display_message = 'Workspace hygiene auto-cleaned ephemeral runtime files.';
        report.suppress_drift_warning = true;
      }
    } else if (hasBlockingSourceEdits) {
      report.result = 'blocked_source_edits';
      report.display_message = `Workspace sync deferred due to local source edits (${postCleanupBuckets.operator_source.length} path(s)).`;
      report.suppress_drift_warning = true;
    } else if (hasUnknownEdits) {
      report.result = 'blocked_unknown_edits';
      report.display_message = `Workspace sync deferred due to unclassified local changes (${postCleanupBuckets.unknown.length} path(s)).`;
      report.suppress_drift_warning = true;
    } else if (onlyManagedGeneratedRemain) {
      report.result = 'deferred_managed_generated';
      report.display_message = `Workspace sync deferred because managed knowledge outputs are dirty (${postCleanupBuckets.managed_generated.length} path(s)).`;
      report.suppress_drift_warning = true;
    } else if (onlyGeneratedArtifactsRemain) {
      report.result = 'deferred_generated_artifacts';
      report.display_message = `Workspace sync deferred because generated artifacts are dirty (${postCleanupBuckets.generated_artifact.length} path(s)).`;
      report.suppress_drift_warning = true;
    } else if (postCleanupEntries.length && report.actions.some((action) => action.type === 'cleanup_ephemeral_runtime')) {
      report.result = 'cleaned_ephemeral_runtime';
      report.display_message = 'Workspace hygiene auto-cleaned ephemeral runtime files.';
      report.suppress_drift_warning = true;
    }

    report.source_revision_after = getSourceRevision(resolvedProjectDir);
    report.classification = summarizeBuckets(postCleanupBuckets);
    report.summary = {
      changed_count: postCleanupEntries.length,
      ephemeral_runtime_count: postCleanupBuckets.ephemeral_runtime.length,
      generated_artifact_count: postCleanupBuckets.generated_artifact.length,
      managed_generated_count: postCleanupBuckets.managed_generated.length,
      operator_source_count: postCleanupBuckets.operator_source.length,
      unknown_count: postCleanupBuckets.unknown.length,
    };

    if (
      report.result === 'clean'
      && report.source_revision_after
      && report.source_revision_after.dirty_worktree === false
      && (report.source_revision_after.behind_count || 0) === 0
    ) {
      report.suppress_drift_warning = true;
    }
  } catch (error) {
    report.ok = false;
    report.result = 'error';
    report.display_message = `Workspace hygiene error: ${error && error.message ? error.message : String(error)}`;
    report.suppress_drift_warning = false;
    report.error = error && error.message ? error.message : String(error);
  }

  writeJsonAtomic(reportPath, report);
  return report;
}

function parseArgs(argv) {
  const parsed = {
    project: process.cwd(),
    mode: 'status',
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project' && argv[i + 1]) parsed.project = argv[++i];
    else if (arg === '--mode' && argv[i + 1]) parsed.mode = argv[++i];
    else if (arg === '--quiet') parsed.quiet = true;
  }
  return parsed;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const report = evaluateWorkspace(args.project, { mode: args.mode });
  if (!args.quiet) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  classifyRelativePath,
  deriveNamespace,
  evaluateWorkspace,
  getReportPath,
  getSourceRevision,
  parseStatusEntries,
  sanitizeNamespace,
};
