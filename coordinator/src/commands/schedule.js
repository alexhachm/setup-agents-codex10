'use strict';

/**
 * CLI commands: mac10 schedule, mac10 schedule-once
 *
 * mac10 schedule <name> <cron> <command>       — create recurring task
 * mac10 schedule list                          — list scheduled tasks
 * mac10 schedule delete <id>                   — delete a task
 * mac10 schedule-once <name> <minutes> <command> — run once after delay
 */

const cronScheduler = require('../cron-scheduler');

function run(args, projectDir) {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list':
      return listTasks();
    case 'delete':
      return deleteTask(args[1]);
    case 'enable':
      return enableTask(args[1], true);
    case 'disable':
      return enableTask(args[1], false);
    default:
      // Create: mac10 schedule <name> <cron> <command...>
      return createTask(args);
  }
}

function runOnce(args, projectDir) {
  if (args.length < 3) {
    return { error: 'Usage: mac10 schedule-once <name> <minutes> <command...>' };
  }

  const name = args[0];
  const minutes = parseInt(args[1], 10);
  const command = args.slice(2).join(' ');

  if (isNaN(minutes)) {
    return { error: 'Minutes must be a number' };
  }

  // Calculate the cron expression for a specific time
  const runAt = new Date(Date.now() + minutes * 60000);
  const cron = `${runAt.getMinutes()} ${runAt.getHours()} ${runAt.getDate()} ${runAt.getMonth() + 1} *`;

  const id = cronScheduler.createScheduledTask({
    name: `once:${name}`,
    cron_expression: cron,
    command,
    metadata: { once: true, scheduled_for: runAt.toISOString() },
  });

  return {
    id,
    name: `once:${name}`,
    command,
    run_at: runAt.toISOString(),
  };
}

function createTask(args) {
  if (args.length < 3) {
    return { error: 'Usage: mac10 schedule <name> <cron_expression> <command...>' };
  }

  const name = args[0];
  const cronExpr = args[1];
  const command = args.slice(2).join(' ');

  const id = cronScheduler.createScheduledTask({
    name,
    cron_expression: cronExpr,
    command,
  });

  const nextRun = cronScheduler.getNextRunTime(cronExpr);

  return {
    id,
    name,
    cron_expression: cronExpr,
    command,
    next_run: nextRun ? nextRun.toISOString() : null,
  };
}

function listTasks() {
  const tasks = cronScheduler.listScheduledTasks();
  return {
    tasks: tasks.map(t => ({
      id: t.id,
      name: t.name,
      cron: t.cron_expression,
      command: t.command,
      enabled: !!t.enabled,
      run_count: t.run_count,
      last_run_at: t.last_run_at,
      next_run_at: t.next_run_at,
    })),
  };
}

function deleteTask(id) {
  if (!id) return { error: 'Usage: mac10 schedule delete <id>' };
  const success = cronScheduler.deleteScheduledTask(parseInt(id, 10));
  return success ? { deleted: parseInt(id, 10) } : { error: `Task ${id} not found` };
}

function enableTask(id, enabled) {
  if (!id) return { error: `Usage: mac10 schedule ${enabled ? 'enable' : 'disable'} <id>` };
  cronScheduler.updateScheduledTask(parseInt(id, 10), { enabled: enabled ? 1 : 0 });
  return { id: parseInt(id, 10), enabled };
}

module.exports = { run, runOnce };
