'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const browserEngine = require('../src/browser-engine');
const browserAgent = require('../src/browser-agent');
const browserWorkflow = require('../src/browser-workflow');
const confirmations = require('../src/db/confirmations');
const confirmCmd = require('../src/commands/confirm');
const settingsManager = require('../src/settings-manager');
const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-browser-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
  db.init(tmpDir);
  confirmations.init(db);
});

afterEach(() => {
  confirmations.reset();
  settingsManager.reset();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('BrowserEngine', () => {
  describe('isPlaywrightAvailable', () => {
    it('should detect Playwright availability', () => {
      const result = browserEngine.isPlaywrightAvailable();
      assert.strictEqual(typeof result, 'boolean');
    });
  });

  describe('getActiveBrowser', () => {
    it('should return null when no browser launched', () => {
      assert.strictEqual(browserEngine.getActiveBrowser(), null);
    });
  });
});

describe('BrowserAgent', () => {
  describe('ACTION_TYPES', () => {
    it('should include all expected action types', () => {
      assert.ok(browserAgent.ACTION_TYPES.includes('click'));
      assert.ok(browserAgent.ACTION_TYPES.includes('type'));
      assert.ok(browserAgent.ACTION_TYPES.includes('navigate'));
      assert.ok(browserAgent.ACTION_TYPES.includes('done'));
      assert.ok(browserAgent.ACTION_TYPES.includes('error'));
    });
  });

  describe('MAX_STEPS', () => {
    it('should be a reasonable number', () => {
      assert.ok(browserAgent.MAX_STEPS >= 10);
      assert.ok(browserAgent.MAX_STEPS <= 100);
    });
  });

  describe('selectAction', () => {
    it('should return done in dev mode', async () => {
      const result = await browserAgent.selectAction(
        'test task',
        { url: 'https://example.com', title: 'Test', elements: [], bodyText: 'Hello' },
        []
      );
      assert.strictEqual(result.action, 'done');
    });
  });

  describe('executeAction', () => {
    it('should handle done action', async () => {
      const result = await browserAgent.executeAction(null, { action: 'done', result: 'finished' });
      assert.strictEqual(result.done, true);
      assert.strictEqual(result.result, 'finished');
    });

    it('should handle error action', async () => {
      const result = await browserAgent.executeAction(null, { action: 'error', reason: 'test error' });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'test error');
    });

    it('should handle unknown action', async () => {
      const result = await browserAgent.executeAction(null, { action: 'unknown_action' });
      assert.strictEqual(result.success, false);
    });
  });
});

describe('BrowserWorkflow', () => {
  describe('constructor', () => {
    it('should create workflow with defaults', () => {
      const wf = new browserWorkflow.BrowserWorkflow();
      assert.ok(wf.id.startsWith('wf-'));
      assert.strictEqual(wf.status, 'pending');
      assert.strictEqual(wf.steps.length, 0);
    });
  });

  describe('addStep', () => {
    it('should add steps fluently', () => {
      const wf = new browserWorkflow.BrowserWorkflow();
      wf.addStep({ name: 'Step 1', type: 'navigate', config: { url: 'https://example.com' } })
        .addStep({ name: 'Step 2', type: 'extract', config: { selector: 'h1' } });
      assert.strictEqual(wf.steps.length, 2);
    });
  });

  describe('getStatus', () => {
    it('should return workflow status', () => {
      const wf = new browserWorkflow.BrowserWorkflow({ id: 'test-wf' });
      wf.addStep({ name: 'S1', type: 'navigate' });
      const status = wf.getStatus();
      assert.strictEqual(status.id, 'test-wf');
      assert.strictEqual(status.totalSteps, 1);
    });
  });

  describe('registry', () => {
    it('should create and retrieve workflows', () => {
      const wf = browserWorkflow.createWorkflow({ id: 'test-1' });
      assert.ok(wf);
      const retrieved = browserWorkflow.getWorkflow('test-1');
      assert.strictEqual(retrieved.id, 'test-1');
    });

    it('should list all workflows', () => {
      browserWorkflow.createWorkflow({ id: 'list-1' });
      browserWorkflow.createWorkflow({ id: 'list-2' });
      const list = browserWorkflow.listWorkflows();
      assert.ok(list.length >= 2);
    });

    it('should remove workflows', () => {
      browserWorkflow.createWorkflow({ id: 'remove-1' });
      assert.ok(browserWorkflow.removeWorkflow('remove-1'));
      assert.strictEqual(browserWorkflow.getWorkflow('remove-1'), null);
    });
  });

  describe('WORKFLOW_STATUS', () => {
    it('should include all statuses', () => {
      assert.ok(browserWorkflow.WORKFLOW_STATUS.includes('pending'));
      assert.ok(browserWorkflow.WORKFLOW_STATUS.includes('running'));
      assert.ok(browserWorkflow.WORKFLOW_STATUS.includes('completed'));
      assert.ok(browserWorkflow.WORKFLOW_STATUS.includes('failed'));
    });
  });
});

describe('Confirmations', () => {
  describe('createConfirmation', () => {
    it('should create a pending confirmation', () => {
      const id = confirmations.createConfirmation({
        action_type: 'delete',
        action_description: 'Delete user account',
        requester: 'worker-1',
      });
      assert.ok(id > 0);
      const c = confirmations.getConfirmation(id);
      assert.strictEqual(c.status, 'pending');
      assert.strictEqual(c.action_type, 'delete');
    });

    it('should set expiration', () => {
      const id = confirmations.createConfirmation({
        action_type: 'purchase',
        action_description: 'Buy item',
        requester: 'worker-1',
        expires_minutes: 30,
      });
      const c = confirmations.getConfirmation(id);
      assert.ok(c.expires_at);
    });
  });

  describe('approveConfirmation', () => {
    it('should approve pending confirmation', () => {
      const id = confirmations.createConfirmation({
        action_type: 'delete',
        action_description: 'Delete file',
        requester: 'worker-1',
      });
      const success = confirmations.approveConfirmation(id, 'user', 'Looks good');
      assert.strictEqual(success, true);
      const c = confirmations.getConfirmation(id);
      assert.strictEqual(c.status, 'approved');
    });

    it('should not approve non-pending confirmation', () => {
      const id = confirmations.createConfirmation({
        action_type: 'delete',
        action_description: 'Delete file',
        requester: 'worker-1',
      });
      confirmations.approveConfirmation(id, 'user');
      const success = confirmations.approveConfirmation(id, 'user'); // Already approved
      assert.strictEqual(success, false);
    });
  });

  describe('denyConfirmation', () => {
    it('should deny pending confirmation', () => {
      const id = confirmations.createConfirmation({
        action_type: 'send_email',
        action_description: 'Send email to all users',
        requester: 'worker-2',
      });
      const success = confirmations.denyConfirmation(id, 'user', 'Too risky');
      assert.strictEqual(success, true);
      const c = confirmations.getConfirmation(id);
      assert.strictEqual(c.status, 'denied');
    });
  });

  describe('getPendingConfirmations', () => {
    it('should list pending confirmations', () => {
      confirmations.createConfirmation({
        action_type: 'delete',
        action_description: 'Delete 1',
        requester: 'worker-1',
      });
      confirmations.createConfirmation({
        action_type: 'purchase',
        action_description: 'Buy 1',
        requester: 'worker-2',
      });
      const pending = confirmations.getPendingConfirmations();
      assert.strictEqual(pending.length, 2);
    });

    it('should filter by requester', () => {
      confirmations.createConfirmation({
        action_type: 'delete',
        action_description: 'Delete',
        requester: 'worker-1',
      });
      confirmations.createConfirmation({
        action_type: 'delete',
        action_description: 'Delete 2',
        requester: 'worker-2',
      });
      const pending = confirmations.getPendingConfirmations('worker-1');
      assert.strictEqual(pending.length, 1);
    });
  });

  describe('requestConfirmation', () => {
    it('should auto-approve non-restricted actions', () => {
      // 'test_action' is not in require_confirmation list
      const result = confirmations.requestConfirmation({
        action_type: 'test_action',
        action_description: 'Test',
        requester: 'worker-1',
      });
      assert.strictEqual(result.auto_approved, true);
    });

    it('should require approval for restricted actions', () => {
      const result = confirmations.requestConfirmation({
        action_type: 'delete',
        action_description: 'Delete something',
        requester: 'worker-1',
      });
      assert.strictEqual(result.auto_approved, false);
      assert.strictEqual(result.status, 'pending');
    });
  });
});

describe('Confirm Commands', () => {
  describe('runApprove', () => {
    it('should approve confirmation by ID', () => {
      const id = confirmations.createConfirmation({
        action_type: 'delete',
        action_description: 'Delete file',
        requester: 'worker-1',
      });
      const result = confirmCmd.runApprove([String(id)], tmpDir);
      assert.strictEqual(result.status, 'approved');
    });

    it('should error on missing ID', () => {
      const result = confirmCmd.runApprove([], tmpDir);
      assert.ok(result.error);
    });
  });

  describe('runDeny', () => {
    it('should deny confirmation by ID', () => {
      const id = confirmations.createConfirmation({
        action_type: 'purchase',
        action_description: 'Buy item',
        requester: 'worker-1',
      });
      const result = confirmCmd.runDeny([String(id), '--reason', 'Too expensive'], tmpDir);
      assert.strictEqual(result.status, 'denied');
      assert.strictEqual(result.reason, 'Too expensive');
    });
  });

  describe('runTodo', () => {
    it('should list pending items', () => {
      confirmations.createConfirmation({
        action_type: 'deploy',
        action_description: 'Deploy to prod',
        requester: 'worker-1',
      });
      const result = confirmCmd.runTodo([], tmpDir);
      assert.ok(result.confirmations);
      assert.strictEqual(result.confirmations.length, 1);
    });
  });

  describe('runEmergencyStop', () => {
    it('should stop all workers', () => {
      db.registerWorker(1, '/wt-1', 'branch-1');
      db.updateWorker(1, { status: 'running' });
      const result = confirmCmd.runEmergencyStop([], tmpDir);
      assert.ok(result.message.includes('Emergency stop'));
      const worker = db.getWorker(1);
      assert.strictEqual(worker.status, 'idle');
    });
  });
});
