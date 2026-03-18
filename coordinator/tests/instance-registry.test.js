'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

const registry = require('../src/instance-registry');
const {
  REGISTRY_PATH,
  LOCK_PATH,
  acquireLock,
  releaseLock,
  register,
  deregister,
  list,
  _setLockAcquireTimeout,
} = registry;

beforeEach(() => {
  _setLockAcquireTimeout(10000);
  try { fs.unlinkSync(LOCK_PATH); } catch {}
  try { fs.unlinkSync(REGISTRY_PATH); } catch {}
});

afterEach(() => {
  _setLockAcquireTimeout(10000);
  try { fs.unlinkSync(LOCK_PATH); } catch {}
  try { fs.unlinkSync(REGISTRY_PATH); } catch {}
});

describe('acquireLock / releaseLock', () => {
  it('returns a string token when the lock is free', () => {
    const token = acquireLock();
    assert.ok(typeof token === 'string' && token.length > 0, 'expected a non-empty token string');
    releaseLock(token);
    assert.ok(!fs.existsSync(LOCK_PATH), 'lock file should be removed after owner release');
  });

  it('held lock causes timeout for second acquirer', () => {
    // Use a short timeout so the test completes quickly.
    // LOCK_STALE_MS remains 10000ms, so the manually-written file won't be
    // considered stale during the short 150ms acquisition window.
    _setLockAcquireTimeout(150);
    fs.writeFileSync(LOCK_PATH, 'other-process:fake-token');
    const token = acquireLock();
    assert.strictEqual(token, null, 'expected null when lock is already held');
  });

  it('non-owner cannot release lock', () => {
    const token = acquireLock();
    assert.ok(token, 'expected a token');

    releaseLock('wrong-owner-token');
    assert.ok(fs.existsSync(LOCK_PATH), 'lock file should remain after non-owner release attempt');
    assert.strictEqual(
      fs.readFileSync(LOCK_PATH, 'utf8'),
      token,
      'lock content should be unchanged after non-owner release'
    );

    releaseLock(token);
    assert.ok(!fs.existsSync(LOCK_PATH), 'lock file should be gone after owner release');
  });
});

describe('register() and deregister()', () => {
  it('register() fails when lock is unavailable', () => {
    _setLockAcquireTimeout(150);
    fs.writeFileSync(LOCK_PATH, 'blocker:fake-token');
    assert.throws(
      () => register({ projectDir: '/tmp/test-reg', port: 19998, pid: process.pid, name: 'test' }),
      /failed to acquire registry lock/
    );
  });

  it('deregister() fails when lock is unavailable', () => {
    _setLockAcquireTimeout(150);
    fs.writeFileSync(LOCK_PATH, 'blocker:fake-token');
    assert.throws(
      () => deregister(19998),
      /failed to acquire registry lock/
    );
  });

  it('normal lock/unlock/register/deregister cycle works', () => {
    const port = 19999;

    register({ projectDir: '/tmp/test-cycle', port, pid: process.pid, name: 'cycle-test' });
    let entries = list();
    assert.ok(entries.some(e => e.port === port), 'entry should appear in registry after register');

    deregister(port);
    entries = list();
    assert.ok(!entries.some(e => e.port === port), 'entry should be absent from registry after deregister');
  });
});
