'use strict';

/**
 * Cron Scheduler — schedules and executes recurring tasks.
 * Uses the scheduled_tasks table for persistence.
 */

const db = require('./db');

let _interval = null;
const TICK_MS = 60000; // Check every minute

/**
 * Parse a cron expression (minute hour dom month dow).
 * Returns true if the expression matches the given date.
 */
function matchesCron(expression, date) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const checks = [
    { value: date.getMinutes(), field: parts[0] },
    { value: date.getHours(), field: parts[1] },
    { value: date.getDate(), field: parts[2] },
    { value: date.getMonth() + 1, field: parts[3] },
    { value: date.getDay(), field: parts[4] },
  ];

  return checks.every(({ value, field }) => matchesField(value, field));
}

function matchesField(value, field) {
  if (field === '*') return true;

  // Handle step values: */5
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }

  // Handle ranges: 1-5
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }

  // Handle lists: 1,3,5
  if (field.includes(',')) {
    return field.split(',').map(Number).includes(value);
  }

  return parseInt(field, 10) === value;
}

function createScheduledTask(opts) {
  const rawDb = db.getDb();
  const result = rawDb.prepare(`
    INSERT INTO scheduled_tasks (name, cron_expression, command, command_args, enabled, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    opts.name,
    opts.cron_expression,
    opts.command,
    opts.command_args ? JSON.stringify(opts.command_args) : null,
    opts.enabled !== false ? 1 : 0,
    opts.metadata ? JSON.stringify(opts.metadata) : null
  );
  return Number(result.lastInsertRowid);
}

function getScheduledTask(id) {
  const rawDb = db.getDb();
  return rawDb.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id);
}

function listScheduledTasks(enabled) {
  const rawDb = db.getDb();
  if (enabled !== undefined) {
    return rawDb.prepare('SELECT * FROM scheduled_tasks WHERE enabled = ?').all(enabled ? 1 : 0);
  }
  return rawDb.prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC').all();
}

function updateScheduledTask(id, updates) {
  const rawDb = db.getDb();
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'id') continue;
    fields.push(`${key} = ?`);
    values.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  rawDb.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteScheduledTask(id) {
  const rawDb = db.getDb();
  return rawDb.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id).changes > 0;
}

function getNextRunTime(cronExpression, fromDate) {
  const from = fromDate || new Date();
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  // Search up to 7 days ahead
  const maxIter = 7 * 24 * 60;
  for (let i = 0; i < maxIter; i++) {
    if (matchesCron(cronExpression, next)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }
  return null;
}

/**
 * Execute due tasks.
 */
function tick() {
  const now = new Date();
  const tasks = listScheduledTasks(true);

  for (const task of tasks) {
    if (matchesCron(task.cron_expression, now)) {
      try {
        // Send as mail to coordinator for execution
        db.sendMail('coordinator', 'scheduled_task', {
          task_id: task.id,
          command: task.command,
          command_args: task.command_args ? JSON.parse(task.command_args) : null,
        });

        updateScheduledTask(task.id, {
          last_run_at: now.toISOString(),
          run_count: task.run_count + 1,
          next_run_at: getNextRunTime(task.cron_expression, now)?.toISOString(),
        });

        db.log('coordinator', 'scheduled_task_fired', { task_id: task.id, name: task.name });
      } catch (err) {
        updateScheduledTask(task.id, {
          last_error: err.message,
        });
      }
    }
  }
}

function start() {
  if (_interval) return;
  _interval = setInterval(tick, TICK_MS);
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = {
  matchesCron,
  matchesField,
  createScheduledTask,
  getScheduledTask,
  listScheduledTasks,
  updateScheduledTask,
  deleteScheduledTask,
  getNextRunTime,
  tick,
  start,
  stop,
  TICK_MS,
};
