'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * Handle system / worker-admin CLI commands.
 *
 * All dependencies are injected so this module stays framework-free and
 * unit-testable. Side-effectful helpers (fs, git) are injected via overrides
 * for tests that need to stub them.
 */
function handleSystemCommand(command, args, deps) {
  const {
    db,
    projectDir,
    collectCoordinatorHealth,
    backfillSupersededLoopRequestsSafe,
    parseResetOwnership,
    getWorkerActiveAssignment,
    // Optional overrides (mostly for tests).
    fsImpl = fs,
    pathImpl = path,
    execFileSyncImpl = execFileSync,
  } = deps;

  switch (command) {
    case 'register-worker': {
      const { worker_id, worktree_path, branch } = args;
      db.registerWorker(worker_id, worktree_path || '', branch || '');
      db.log('coordinator', 'worker_registered', { worker_id });
      return { ok: true, worker_id };
    }

    case 'repair': {
      // Reset stuck states using the freshest lifecycle timestamp so newly assigned workers
      // are not treated as stale when they still carry an older heartbeat value.
      const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const dbConn = db.getDb();
      const staleWorkers = dbConn.prepare(`
          SELECT id
          FROM workers
          WHERE status IN ('assigned', 'running', 'busy')
            AND datetime(
              CASE
                WHEN last_heartbeat IS NULL AND launched_at IS NULL THEN created_at
                WHEN last_heartbeat IS NULL THEN launched_at
                WHEN launched_at IS NULL THEN last_heartbeat
                WHEN datetime(last_heartbeat) >= datetime(launched_at) THEN last_heartbeat
                ELSE launched_at
              END
            ) < datetime(?)
        `).all(cutoff);

      let stuck = { changes: 0 };
      let orphaned = { changes: 0 };

      if (staleWorkers.length > 0) {
        const staleIds = staleWorkers.map((row) => row.id);
        const placeholders = staleIds.map(() => '?').join(', ');
        const updateTasks = dbConn.prepare(`
            UPDATE tasks
            SET status = 'ready',
                assigned_to = NULL
            WHERE status IN ('assigned', 'in_progress')
              AND assigned_to IN (${placeholders})
          `);
        const updateWorkers = dbConn.prepare(`
            UPDATE workers
            SET status = 'idle',
                current_task_id = NULL,
                claimed_by = NULL,
                claimed_at = NULL
            WHERE id IN (${placeholders})
          `);
        const tx = dbConn.transaction((ids) => {
          const orphanedResult = updateTasks.run(...ids);
          const stuckResult = updateWorkers.run(...ids);
          return { stuckResult, orphanedResult };
        });
        const txResult = tx(staleIds);
        stuck = txResult.stuckResult;
        orphaned = txResult.orphanedResult;
      }

      const supersessionBackfill = backfillSupersededLoopRequestsSafe();
      db.log('coordinator', 'repair', {
        reset_workers: stuck.changes,
        orphaned_tasks: orphaned.changes,
        supersession_backfill: supersessionBackfill,
      });
      return {
        ok: true,
        reset_workers: stuck.changes,
        orphaned_tasks: orphaned.changes,
        supersession_backfill: supersessionBackfill,
      };
    }

    case 'purge-tasks': {
      const purgeStatus = args.status || 'failed';
      const dbConn = db.getDb();
      const deleteMerges = dbConn.prepare(`
          DELETE FROM merge_queue
          WHERE task_id IN (SELECT id FROM tasks WHERE status = ?)
            AND status IN ('failed', 'conflict')
        `);
      const deleteTasks = dbConn.prepare(`
          DELETE FROM tasks WHERE status = ?
        `);
      const tx = dbConn.transaction((s) => {
        const mergesResult = deleteMerges.run(s);
        const tasksResult = deleteTasks.run(s);
        return { purged_merges: mergesResult.changes, purged_tasks: tasksResult.changes };
      });
      const result = tx(purgeStatus);
      db.log('coordinator', 'purge-tasks', { status: purgeStatus, ...result });
      return { ok: true, ...result };
    }

    case 'ping': {
      return { ok: true, ts: Date.now() };
    }

    case 'health-check': {
      return { ok: true, ...collectCoordinatorHealth(projectDir || process.cwd()) };
    }

    case 'add-worker': {
      const maxWorkers = parseInt(db.getConfig('max_workers')) || 8;
      const allWorkers = db.getAllWorkers();
      if (allWorkers.length >= maxWorkers) {
        return { ok: false, error: `Already at max workers (${maxWorkers})` };
      }
      const nextId = allWorkers.length > 0
        ? Math.max(...allWorkers.map(w => typeof w.id === 'number' ? w.id : parseInt(w.id))) + 1
        : 1;
      if (nextId > maxWorkers) {
        return { ok: false, error: `Next worker ID ${nextId} exceeds max_workers (${maxWorkers})` };
      }
      const projDir = db.getConfig('project_dir');
      if (!projDir) {
        return { ok: false, error: 'project_dir not set in config' };
      }
      const wtDir = pathImpl.join(projDir, '.worktrees');
      const wtPath = pathImpl.join(wtDir, `wt-${nextId}`);
      const branchName = `agent-${nextId}`;
      try {
        fsImpl.mkdirSync(wtDir, { recursive: true });
        // Create branch from configured/default branch (not current checked-out feature branch).
        const mainBranch = (() => {
          const configuredPrimary = (db.getConfig('primary_branch') || '').trim();
          if (configuredPrimary) return configuredPrimary;

          try {
            const remoteHead = execFileSyncImpl(
              'git',
              ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
              { cwd: projDir, encoding: 'utf8' },
            ).trim();
            if (remoteHead.startsWith('origin/')) {
              return remoteHead.slice('origin/'.length);
            }
          } catch {}

          try {
            const abbrevRemoteHead = execFileSyncImpl(
              'git',
              ['rev-parse', '--abbrev-ref', 'origin/HEAD'],
              { cwd: projDir, encoding: 'utf8' },
            ).trim();
            if (abbrevRemoteHead.startsWith('origin/')) {
              return abbrevRemoteHead.slice('origin/'.length);
            }
          } catch {}

          return 'main';
        })();
        try {
          execFileSyncImpl('git', ['branch', branchName, mainBranch], { cwd: projDir, encoding: 'utf8' });
        } catch (branchError) {
          const stderr = String(branchError?.stderr || '').trim();
          const stdout = String(branchError?.stdout || '').trim();
          const details = [stderr, stdout].filter(Boolean).join(' ').trim();
          const message = String(branchError?.message || '').trim();
          const combined = [message, details].filter(Boolean).join(' ').trim();

          if (/already exists/i.test(combined)) {
            // Existing branch is expected during retries/restarts.
          } else if (
            /not a commit/i.test(combined) ||
            /not a valid object name/i.test(combined) ||
            /unknown revision/i.test(combined) ||
            /ambiguous argument/i.test(combined) ||
            /bad revision/i.test(combined)
          ) {
            throw new Error(
              `Cannot create worker branch '${branchName}' from base '${mainBranch}': base ref is invalid or cannot be resolved. ` +
              `Set 'primary_branch' to a valid ref (for example: main) and retry.`
            );
          } else {
            throw branchError;
          }
        }
        execFileSyncImpl('git', ['worktree', 'add', wtPath, branchName], { cwd: projDir, encoding: 'utf8' });

        // Copy only source/config assets into the worker worktree. Runtime
        // state such as .claude/state, .claude/logs, and .claude/signals
        // must stay local to the main coordinator process.
        const srcClaude = pathImpl.join(projDir, '.claude');
        const dstClaude = pathImpl.join(wtPath, '.claude');
        const copyDir = (rel) => {
          const src = pathImpl.join(srcClaude, rel);
          const dst = pathImpl.join(dstClaude, rel);
          if (!fsImpl.existsSync(src)) return;
          fsImpl.mkdirSync(dst, { recursive: true });
          for (const f of fsImpl.readdirSync(src)) {
            const srcF = pathImpl.join(src, f);
            if (fsImpl.statSync(srcF).isFile()) fsImpl.copyFileSync(srcF, pathImpl.join(dst, f));
          }
        };
        copyDir('commands');
        copyDir('knowledge');
        copyDir('knowledge/domain');
        copyDir('scripts');
        copyDir('agents');
        copyDir('hooks');
        const workerAgents = pathImpl.join(srcClaude, 'worker-agents.md');
        const workerClaude = pathImpl.join(srcClaude, 'worker-claude.md');
        const workerInstructions = fsImpl.existsSync(workerAgents) ? workerAgents : workerClaude;
        // AGENTS.md is canonical; CLAUDE.md is kept as a compatibility copy
        // for Claude Code until all providers consume AGENTS.md directly.
        if (fsImpl.existsSync(workerInstructions)) {
          fsImpl.copyFileSync(workerInstructions, pathImpl.join(wtPath, 'AGENTS.md'));
          fsImpl.copyFileSync(workerInstructions, pathImpl.join(wtPath, 'CLAUDE.md'));
        }
        // Copy settings.json
        const settingsFile = pathImpl.join(srcClaude, 'settings.json');
        if (fsImpl.existsSync(settingsFile)) {
          fsImpl.copyFileSync(settingsFile, pathImpl.join(dstClaude, 'settings.json'));
        }
        // Make hook scripts executable
        try {
          const hookDir = pathImpl.join(dstClaude, 'hooks');
          if (fsImpl.existsSync(hookDir)) {
            for (const f of fsImpl.readdirSync(hookDir)) {
              if (f.endsWith('.sh')) fsImpl.chmodSync(pathImpl.join(hookDir, f), 0o755);
            }
          }
        } catch {}

        db.registerWorker(nextId, wtPath, branchName);
        db.log('coordinator', 'worker_added', { worker_id: nextId, worktree_path: wtPath, branch: branchName });
        return { ok: true, worker_id: nextId, worktree_path: wtPath, branch: branchName };
      } catch (e) {
        return { ok: false, error: `Failed to create worker: ${e.message}` };
      }
    }

    case 'reset-worker': {
      // Called by sentinel when Claude exits — ownership checks prevent stale
      // sentinels from clearing a newer assignment.
      const { worker_id: resetWid, expected_task_id: expectedTaskId, expected_assignment_token: expectedToken } = parseResetOwnership(args);
      if (!resetWid) {
        return { ok: false, error: 'Missing worker_id' };
      }
      const resetWorker = db.getWorker(resetWid);
      if (!resetWorker) {
        return { ok: false, error: 'Worker not found' };
      }
      const activeAssignment = getWorkerActiveAssignment(resetWid);
      const observedTaskId = resetWorker.current_task_id || (activeAssignment ? activeAssignment.id : null);
      const hasOwnershipContext = expectedTaskId !== null || Boolean(expectedToken);

      if (!hasOwnershipContext && (observedTaskId !== null || resetWorker.status !== 'idle')) {
        db.log(`worker-${resetWid}`, 'sentinel_reset_skipped', {
          reason: 'missing_ownership_context',
          worker_status: resetWorker.status,
          current_task_id: resetWorker.current_task_id,
          active_task_id: activeAssignment ? activeAssignment.id : null,
        });
        return { ok: true, skipped: true, reason: 'missing_ownership_context' };
      }

      if (
        expectedTaskId !== null &&
        observedTaskId !== null &&
        observedTaskId !== expectedTaskId
      ) {
        db.log(`worker-${resetWid}`, 'sentinel_reset_skipped', {
          reason: 'task_mismatch',
          expected_task_id: expectedTaskId,
          current_task_id: resetWorker.current_task_id,
          active_task_id: activeAssignment ? activeAssignment.id : null,
          observed_task_id: observedTaskId,
        });
        return { ok: true, skipped: true, reason: 'task_mismatch' };
      }

      if (
        expectedToken &&
        resetWorker.launched_at &&
        resetWorker.launched_at !== expectedToken
      ) {
        db.log(`worker-${resetWid}`, 'sentinel_reset_skipped', {
          reason: 'assignment_mismatch',
          expected_assignment_token: expectedToken,
          current_assignment_token: resetWorker.launched_at,
        });
        return { ok: true, skipped: true, reason: 'assignment_mismatch' };
      }

      // Only reset if worker isn't already idle (avoid clobbering a fresh assignment)
      if (resetWorker.status !== 'idle') {
        db.updateWorker(resetWid, {
          status: 'idle',
          current_task_id: null,
          claimed_by: null,
          claimed_at: null,
          last_heartbeat: new Date().toISOString(),
        });
        db.log(`worker-${resetWid}`, 'sentinel_reset', {
          previous_status: resetWorker.status,
          expected_task_id: expectedTaskId,
          expected_assignment_token: expectedToken,
        });
      }
      return { ok: true };
    }

    default:
      throw new Error(`Unknown system command: ${command}`);
  }
}

module.exports = {
  handleSystemCommand,
};
