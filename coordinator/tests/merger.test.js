'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const db = require('../src/db');
const merger = require('../src/merger');

let tmpDir;

function getCoordinatorDbPath() {
  const rows = db.getDb().prepare('PRAGMA database_list').all();
  const main = rows.find((row) => row.name === 'main');
  return main && main.file ? main.file : path.join(tmpDir, '.claude', 'state', 'mac10.db');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-merge-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Merge queue', () => {
  it('should enqueue and dequeue merges in FIFO order', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const t2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    db.enqueueMerge({ request_id: reqId, task_id: t1, pr_url: 'https://gh/pr/1', branch: 'agent-1' });
    db.enqueueMerge({ request_id: reqId, task_id: t2, pr_url: 'https://gh/pr/2', branch: 'agent-2' });

    const first = db.getNextMerge();
    assert.strictEqual(first.task_id, t1);
    assert.strictEqual(first.status, 'pending');
  });

  it('should respect priority', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'Normal' });
    const t2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'Urgent' });

    db.enqueueMerge({ request_id: reqId, task_id: t1, pr_url: 'https://gh/pr/1', branch: 'agent-1', priority: 0 });
    db.enqueueMerge({ request_id: reqId, task_id: t2, pr_url: 'https://gh/pr/2', branch: 'agent-2', priority: 10 });

    const first = db.getNextMerge();
    assert.strictEqual(first.task_id, t2); // higher priority first
  });

  it('should track merge status', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.enqueueMerge({ request_id: reqId, task_id: t1, pr_url: 'https://gh/pr/1', branch: 'agent-1' });

    const entry = db.getNextMerge();
    db.updateMerge(entry.id, { status: 'merging' });

    // Should not return merging entry
    const next = db.getNextMerge();
    assert.strictEqual(next, undefined);

    // Mark merged
    db.updateMerge(entry.id, { status: 'merged', merged_at: new Date().toISOString() });
  });

  it('should handle conflict status', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.enqueueMerge({ request_id: reqId, task_id: t1, pr_url: 'https://gh/pr/1', branch: 'agent-1' });

    const entry = db.getNextMerge();
    db.updateMerge(entry.id, { status: 'conflict', error: 'CONFLICT in file.js' });

    // Conflict entries are not retried automatically
    const next = db.getNextMerge();
    assert.strictEqual(next, undefined);
  });

  it('should self-heal legacy merge_queue without updated_at during init', () => {
    const dbPath = getCoordinatorDbPath();
    db.close();
    fs.rmSync(dbPath, { force: true });

    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE merge_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        task_id INTEGER NOT NULL,
        pr_url TEXT NOT NULL,
        branch TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        merged_at TEXT,
        error TEXT
      );
      CREATE TABLE config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const createdAt = '2024-01-02 03:04:05';
    const insert = legacyDb.prepare(`
      INSERT INTO merge_queue (request_id, task_id, pr_url, branch, status, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('req-legacy', 1, 'https://github.com/org/repo/pull/123', 'agent-1', 'pending', 0, createdAt);
    legacyDb.close();

    db.init(tmpDir);

    const cols = db.getDb().prepare("PRAGMA table_info(merge_queue)").all();
    assert.ok(cols.some((col) => col.name === 'updated_at'));

    const row = db.getDb().prepare('SELECT created_at, updated_at FROM merge_queue ORDER BY id ASC LIMIT 1').get();
    assert.ok(row, 'expected legacy merge row to remain after init migration');
    assert.strictEqual(row.updated_at, createdAt);

    // Idempotency: repeated guard-triggering paths should not error on already-correct schema.
    assert.doesNotThrow(() => db.getDb());
    assert.doesNotThrow(() => db.updateMerge(row.id || 1, { status: 'merging' }));
  });

  it('should backfill updated_at with current time when created_at is absent', () => {
    const dbPath = getCoordinatorDbPath();
    db.close();
    fs.rmSync(dbPath, { force: true });

    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE merge_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        task_id INTEGER NOT NULL,
        pr_url TEXT NOT NULL,
        branch TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 0,
        merged_at TEXT,
        error TEXT
      );
      CREATE TABLE config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const insert = legacyDb.prepare(`
      INSERT INTO merge_queue (request_id, task_id, pr_url, branch, status, priority)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('req-legacy-no-created', 2, 'https://github.com/org/repo/pull/456', 'agent-2', 'pending', 0);
    legacyDb.close();

    db.init(tmpDir);

    const row = db.getDb().prepare('SELECT id, updated_at FROM merge_queue ORDER BY id ASC LIMIT 1').get();
    assert.ok(row, 'expected legacy merge row to remain after init migration');
    assert.ok(typeof row.updated_at === 'string' && row.updated_at.length > 0);
  });

  it('should terminalize malformed merge rows instead of leaving them in merging', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.enqueueMerge({ request_id: reqId, task_id: taskId, pr_url: 'pending', branch: 'agent-1' });

    merger.processQueue(tmpDir);

    const row = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE task_id = ?').get(taskId);
    assert.strictEqual(row.status, 'failed');
    assert.match(row.error, /attempt_merge_exception/);
    assert.match(row.error, /Invalid PR URL/);
  });
});

describe('Request completion tracking', () => {
  it('should detect when all tasks for a request are completed', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const t2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    db.updateTask(t1, { status: 'completed' });

    // Not all done yet
    const tasks = db.listTasks({ request_id: reqId });
    const incomplete = tasks.filter(t => t.status !== 'completed' && t.status !== 'failed');
    assert.strictEqual(incomplete.length, 1);

    // Complete the other
    db.updateTask(t2, { status: 'completed' });
    const tasksAfter = db.listTasks({ request_id: reqId });
    const incompleteAfter = tasksAfter.filter(t => t.status !== 'completed' && t.status !== 'failed');
    assert.strictEqual(incompleteAfter.length, 0);
  });
});
