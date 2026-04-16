'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const auditExport = require('../src/audit-export');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-audit-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);

  // Seed some activity logs
  db.log('coordinator', 'started', { project: '/test' });
  db.log('worker-1', 'task_completed', { task_id: 1 });
  db.log('architect', 'triage_done', { request_id: 'r1' });
  db.log('coordinator', 'stopped', {});
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Audit Export', () => {
  describe('exportJson', () => {
    it('should export all logs as JSON', () => {
      const outputPath = path.join(tmpDir, 'audit.json');
      const result = auditExport.exportJson(outputPath);
      assert.strictEqual(result.format, 'json');
      assert.strictEqual(result.record_count, 4);
      assert.ok(fs.existsSync(outputPath));

      const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      assert.strictEqual(data.length, 4);
    });

    it('should filter by actor', () => {
      const outputPath = path.join(tmpDir, 'coord.json');
      const result = auditExport.exportJson(outputPath, { actor: 'coordinator' });
      assert.strictEqual(result.record_count, 2);
    });

    it('should respect limit', () => {
      const outputPath = path.join(tmpDir, 'limited.json');
      const result = auditExport.exportJson(outputPath, { limit: 2 });
      assert.strictEqual(result.record_count, 2);
    });

    it('should record export in audit_exports table', () => {
      const outputPath = path.join(tmpDir, 'tracked.json');
      auditExport.exportJson(outputPath);
      const exports = auditExport.listExports();
      assert.ok(exports.length > 0);
      assert.strictEqual(exports[0].export_format, 'json');
    });
  });

  describe('exportCsv', () => {
    it('should export all logs as CSV', () => {
      const outputPath = path.join(tmpDir, 'audit.csv');
      const result = auditExport.exportCsv(outputPath);
      assert.strictEqual(result.format, 'csv');
      assert.strictEqual(result.record_count, 4);
      assert.ok(fs.existsSync(outputPath));

      const content = fs.readFileSync(outputPath, 'utf-8');
      const lines = content.trim().split('\n');
      assert.strictEqual(lines[0], 'id,actor,action,details,created_at');
      assert.strictEqual(lines.length, 5); // header + 4 rows
    });

    it('should filter by actor', () => {
      const outputPath = path.join(tmpDir, 'worker.csv');
      const result = auditExport.exportCsv(outputPath, { actor: 'worker-1' });
      assert.strictEqual(result.record_count, 1);
    });
  });

  describe('listExports', () => {
    it('should list all exports', () => {
      auditExport.exportJson(path.join(tmpDir, 'a.json'));
      auditExport.exportCsv(path.join(tmpDir, 'b.csv'));
      const exports = auditExport.listExports();
      assert.strictEqual(exports.length, 2);
    });

    it('should return empty when no exports', () => {
      const exports = auditExport.listExports();
      assert.deepStrictEqual(exports, []);
    });
  });
});
