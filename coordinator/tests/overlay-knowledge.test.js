'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const overlay = require('../src/overlay');

let tmpDir;

function mkDir(...parts) {
  fs.mkdirSync(path.join(tmpDir, ...parts), { recursive: true });
}

function mkFile(relPath, content) {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function makeTask(overrides = {}) {
  return {
    id: 1,
    request_id: 'req-test',
    subject: 'Test task',
    tier: 2,
    priority: 'normal',
    description: 'Test description',
    domain: 'my-domain',
    ...overrides,
  };
}

function makeWorker(overrides = {}) {
  return { id: 1, branch: 'agent-1', worktree_path: '/wt-1', ...overrides };
}

describe('overlay-knowledge: generateOverlay base document injection', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-knowledge-'));
    mkDir('.claude', 'knowledge');
    mkFile('.claude/knowledge/mistakes.md', '');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses worker-agents.md as base when present', () => {
    mkFile('.claude/worker-agents.md', '# Worker Agents Base');
    const result = overlay.generateOverlay(makeTask(), makeWorker(), tmpDir);
    assert.ok(result.includes('# Worker Agents Base'), 'base from worker-agents.md should appear');
    assert.ok(result.includes('# Current Task'), 'task overlay should be appended');
  });

  it('falls back to worker-claude.md when worker-agents.md is absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-fallback-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude', 'knowledge'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'knowledge', 'mistakes.md'), '', 'utf8');
      fs.writeFileSync(path.join(dir, '.claude', 'worker-claude.md'), '# Worker Claude Base', 'utf8');

      const result = overlay.generateOverlay(makeTask(), makeWorker(), dir);
      assert.ok(result.includes('# Worker Claude Base'), 'base from worker-claude.md should appear');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to default base when neither base file exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-nobase-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude', 'knowledge'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'knowledge', 'mistakes.md'), '', 'utf8');

      const result = overlay.generateOverlay(makeTask(), makeWorker(), dir);
      assert.ok(result.includes('# Worker Agent'), 'default base should be used');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('base and overlay are separated by a blank line', () => {
    mkFile('.claude/worker-agents.md', '# Base');
    const result = overlay.generateOverlay(makeTask(), makeWorker(), tmpDir);
    assert.ok(result.includes('\n\n# Current Task'), 'double newline separator between base and overlay');
  });
});

describe('overlay-knowledge: task-specific context injection', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-task-'));
    mkDir('.claude', 'knowledge');
    mkFile('.claude/knowledge/mistakes.md', '');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects task id, subject, tier, priority, domain', () => {
    const task = makeTask({ id: 42, subject: 'My Subject', tier: 3, priority: 'high', domain: 'backend' });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('**Task ID:** 42'));
    assert.ok(result.includes('**Subject:** My Subject'));
    assert.ok(result.includes('**Tier:** 3'));
    assert.ok(result.includes('**Priority:** high'));
    assert.ok(result.includes('**Domain:** backend'));
  });

  it('injects request_id', () => {
    const task = makeTask({ request_id: 'req-abc123' });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('**Request ID:** req-abc123'));
  });

  it('injects description text', () => {
    const task = makeTask({ description: 'Implement the frobnicator module' });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('Implement the frobnicator module'));
  });

  it('injects files list when files is a JSON array string', () => {
    const task = makeTask({ files: JSON.stringify(['src/foo.js', 'src/bar.js']) });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('## Files to Modify'));
    assert.ok(result.includes('- src/foo.js'));
    assert.ok(result.includes('- src/bar.js'));
  });

  it('injects files list when files is already an array', () => {
    const task = makeTask({ files: ['lib/a.js', 'lib/b.js'] });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('- lib/a.js'));
    assert.ok(result.includes('- lib/b.js'));
  });

  it('omits files section when task has no files', () => {
    const task = makeTask({ files: undefined });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(!result.includes('## Files to Modify'));
  });

  it('shows domain as "unset" when domain is absent', () => {
    const task = makeTask({ domain: undefined });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('**Domain:** unset'));
  });
});

describe('overlay-knowledge: domain knowledge injection', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-domain-'));
    mkDir('.claude', 'knowledge');
    mkFile('.claude/knowledge/mistakes.md', '');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects codebase/domains/<domain>.md as canonical domain knowledge', () => {
    mkFile('.claude/knowledge/codebase/domains/primary-dom.md', 'canonical-domain-content');

    const result = overlay.buildTaskOverlay(makeTask({ domain: 'primary-dom' }), makeWorker(), tmpDir);
    assert.ok(result.includes('## Domain Knowledge'));
    assert.ok(result.includes('canonical-domain-content'));
  });

  it('prefers codebase/domains/ over legacy domain/ and domains/', () => {
    mkFile('.claude/knowledge/codebase/domains/multi-path.md', 'canonical-wins');
    mkFile('.claude/knowledge/domains/multi-path/README.md', 'readme-loses');
    mkFile('.claude/knowledge/domain/multi-path.md', 'legacy-loses');

    const result = overlay.buildTaskOverlay(makeTask({ domain: 'multi-path' }), makeWorker(), tmpDir);
    assert.ok(result.includes('canonical-wins'));
    assert.ok(!result.includes('readme-loses'));
    assert.ok(!result.includes('legacy-loses'));
  });

  it('falls back to legacy domain/<domain>.md knowledge', () => {
    mkFile('.claude/knowledge/domain/my-domain.md', 'legacy-domain-content');

    const result = overlay.buildTaskOverlay(makeTask({ domain: 'my-domain' }), makeWorker(), tmpDir);
    assert.ok(result.includes('## Domain Knowledge'));
    assert.ok(result.includes('legacy-domain-content'));
  });

  it('falls back to domains/<domain>/README.md knowledge', () => {
    mkFile('.claude/knowledge/domains/api-layer/README.md', 'api-layer-readme-content');

    const result = overlay.buildTaskOverlay(makeTask({ domain: 'api-layer' }), makeWorker(), tmpDir);
    assert.ok(result.includes('## Domain Knowledge'));
    assert.ok(result.includes('api-layer-readme-content'));
  });

  it('prefers domains/<domain>/README.md over legacy domain/<domain>.md', () => {
    mkFile('.claude/knowledge/domains/shared/README.md', 'preferred-readme');
    mkFile('.claude/knowledge/domain/shared.md', 'legacy-fallback');

    const result = overlay.buildTaskOverlay(makeTask({ domain: 'shared' }), makeWorker(), tmpDir);
    assert.ok(result.includes('preferred-readme'), 'README.md content should be used');
    assert.ok(!result.includes('legacy-fallback'), 'legacy file should not appear when README.md exists');
  });

  it('omits domain knowledge section when no domain file exists', () => {
    const result = overlay.buildTaskOverlay(makeTask({ domain: 'no-such-domain' }), makeWorker(), tmpDir);
    assert.ok(!result.includes('## Domain Knowledge'));
  });

  it('omits domain knowledge section when domain file is empty', () => {
    mkFile('.claude/knowledge/domain/empty-domain.md', '   \n   ');
    const result = overlay.buildTaskOverlay(makeTask({ domain: 'empty-domain' }), makeWorker(), tmpDir);
    assert.ok(!result.includes('## Domain Knowledge'));
  });
});

describe('overlay-knowledge: mistakes.md injection', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-mistakes-'));
    mkDir('.claude', 'knowledge');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects mistakes.md content under Known Pitfalls', () => {
    mkFile('.claude/knowledge/mistakes.md', '## Common Mistake\n- Watch out for X');

    const result = overlay.buildTaskOverlay(makeTask(), makeWorker(), tmpDir);
    assert.ok(result.includes('## Known Pitfalls'));
    assert.ok(result.includes('Watch out for X'));
  });

  it('omits Known Pitfalls section when mistakes.md is empty', () => {
    mkFile('.claude/knowledge/mistakes.md', '');

    const result = overlay.buildTaskOverlay(makeTask(), makeWorker(), tmpDir);
    assert.ok(!result.includes('## Known Pitfalls'));
  });

  it('omits Known Pitfalls section when mistakes.md does not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-nomistakes-'));
    try {
      const result = overlay.buildTaskOverlay(makeTask(), makeWorker(), dir);
      assert.ok(!result.includes('## Known Pitfalls'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('overlay-knowledge: worker info injection', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-worker-'));
    mkDir('.claude', 'knowledge');
    mkFile('.claude/knowledge/mistakes.md', '');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects worker id, branch, and worktree path', () => {
    const worker = { id: 3, branch: 'agent-3', worktree_path: '/worktrees/wt-3' };
    const result = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
    assert.ok(result.includes('- Worker ID: 3'));
    assert.ok(result.includes('- Branch: agent-3'));
    assert.ok(result.includes('- Worktree: /worktrees/wt-3'));
  });

  it('uses agent-<id> as branch default when branch is not set', () => {
    const worker = { id: 5, worktree_path: '/wt-5' };
    const result = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
    assert.ok(result.includes('- Branch: agent-5'));
  });

  it('uses "unknown" as worktree default when worktree_path is not set', () => {
    const worker = { id: 2, branch: 'agent-2' };
    const result = overlay.buildTaskOverlay(makeTask(), worker, tmpDir);
    assert.ok(result.includes('- Worktree: unknown'));
  });

  it('includes mac10 CLI protocol section', () => {
    const result = overlay.buildTaskOverlay(makeTask(), makeWorker(), tmpDir);
    assert.ok(result.includes('mac10 start-task'));
    assert.ok(result.includes('mac10 heartbeat'));
    assert.ok(result.includes('mac10 complete-task'));
    assert.ok(result.includes('mac10 fail-task'));
  });
});

describe('overlay-knowledge: validation section injection', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-validation-'));
    mkDir('.claude', 'knowledge');
    mkFile('.claude/knowledge/mistakes.md', '');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders string validation command', () => {
    const task = makeTask({ validation: 'cd coordinator && npm test' });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('## Validation'));
    assert.ok(result.includes('cd coordinator && npm test'));
  });

  it('renders array of validation commands', () => {
    const task = makeTask({ validation: JSON.stringify(['npm run build', 'npm test']) });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('npm run build'));
    assert.ok(result.includes('npm test'));
  });

  it('renders object validation with build_cmd and test_cmd', () => {
    const task = makeTask({ validation: JSON.stringify({ build_cmd: 'npm run build', test_cmd: 'npm test' }) });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('Build:'));
    assert.ok(result.includes('npm run build'));
    assert.ok(result.includes('Test:'));
    assert.ok(result.includes('npm test'));
  });

  it('omits validation section when validation is absent', () => {
    const task = makeTask({ validation: undefined });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(!result.includes('## Validation'));
  });

  it('renders object validation with lint_cmd', () => {
    const task = makeTask({ validation: JSON.stringify({ lint_cmd: 'npm run lint' }) });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('## Validation'));
    assert.ok(result.includes('Lint:'));
    assert.ok(result.includes('npm run lint'));
  });

  it('renders object validation with custom array entries', () => {
    const task = makeTask({ validation: JSON.stringify({ custom: ['./check.sh', './verify.sh'] }) });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('Custom: ./check.sh'));
    assert.ok(result.includes('Custom: ./verify.sh'));
  });

  it('renders object validation with custom scalar entry', () => {
    const task = makeTask({ validation: JSON.stringify({ custom: './run-checks.sh' }) });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('Custom: ./run-checks.sh'));
  });

  it('falls back to Payload when object has no known fields', () => {
    const task = makeTask({ validation: JSON.stringify({ unknown_field: 'some-value' }) });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(result.includes('Payload:'));
  });

  it('omits validation section when validation is empty string', () => {
    const task = makeTask({ validation: '   ' });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(!result.includes('## Validation'));
  });

  it('omits validation section when JSON array is empty', () => {
    const task = makeTask({ validation: JSON.stringify([]) });
    const result = overlay.buildTaskOverlay(task, makeWorker(), tmpDir);
    assert.ok(!result.includes('## Validation'));
  });
});

describe('overlay-knowledge: writeOverlay file output', () => {
  let projectDir;
  let worktreeDir;

  before(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-write-'));
    worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-worktree-'));
    fs.mkdirSync(path.join(projectDir, '.claude', 'knowledge'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.claude', 'knowledge', 'mistakes.md'), '', 'utf8');
  });

  after(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
    fs.rmSync(worktreeDir, { recursive: true, force: true });
  });

  it('writes CLAUDE.md and AGENTS.md in worktree_path', () => {
    const task = makeTask({ subject: 'WriteOverlay Test' });
    const worker = { id: 2, branch: 'agent-2', worktree_path: worktreeDir };
    const agentsPath = overlay.writeOverlay(task, worker, projectDir);

    assert.strictEqual(agentsPath, path.join(worktreeDir, 'AGENTS.md'));
    assert.ok(fs.existsSync(path.join(worktreeDir, 'CLAUDE.md')), 'CLAUDE.md should be written');
    assert.ok(fs.existsSync(path.join(worktreeDir, 'AGENTS.md')), 'AGENTS.md should be written');
  });

  it('CLAUDE.md and AGENTS.md have the same content', () => {
    const task = makeTask({ subject: 'Same Content Test' });
    const worker = { id: 2, branch: 'agent-2', worktree_path: worktreeDir };
    overlay.writeOverlay(task, worker, projectDir);

    const claude = fs.readFileSync(path.join(worktreeDir, 'CLAUDE.md'), 'utf8');
    const agents = fs.readFileSync(path.join(worktreeDir, 'AGENTS.md'), 'utf8');
    assert.strictEqual(claude, agents, 'CLAUDE.md and AGENTS.md must be identical');
  });

  it('content includes task subject', () => {
    const task = makeTask({ subject: 'Unique Subject XYZ' });
    const worker = { id: 2, branch: 'agent-2', worktree_path: worktreeDir };
    overlay.writeOverlay(task, worker, projectDir);

    const content = fs.readFileSync(path.join(worktreeDir, 'AGENTS.md'), 'utf8');
    assert.ok(content.includes('Unique Subject XYZ'));
  });

  it('falls back to .worktrees/wt-<id> when worktree_path is absent', () => {
    const task = makeTask();
    const worker = { id: 7, branch: 'agent-7' };
    const expectedDir = path.join(projectDir, '.worktrees', 'wt-7');

    overlay.writeOverlay(task, worker, projectDir);

    assert.ok(fs.existsSync(path.join(expectedDir, 'CLAUDE.md')), 'CLAUDE.md written to fallback path');
    assert.ok(fs.existsSync(path.join(expectedDir, 'AGENTS.md')), 'AGENTS.md written to fallback path');
  });
});

describe('overlay-knowledge: isSafeDomainSlug path traversal safety', () => {
  it('rejects null and non-string inputs', () => {
    const result = overlay.buildTaskOverlay(makeTask({ domain: null }), makeWorker(), os.tmpdir());
    assert.ok(result.includes('**Domain:** unset'));
  });

  it('does not inject domain knowledge for path-traversal domain slugs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-traversal-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude', 'knowledge', 'domain'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'knowledge', 'domain', 'secrets.md'), 'secret-content', 'utf8');

      const task = makeTask({ domain: '../domain/secrets' });
      const result = overlay.buildTaskOverlay(task, makeWorker(), dir);
      assert.ok(!result.includes('secret-content'), 'path traversal domain should not inject file contents');
      assert.ok(!result.includes('## Domain Knowledge'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not inject domain knowledge for domains containing slashes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-slash-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude', 'knowledge', 'domain'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'knowledge', 'domain', 'etc.md'), 'etc-content', 'utf8');

      const task = makeTask({ domain: 'foo/etc' });
      const result = overlay.buildTaskOverlay(task, makeWorker(), dir);
      assert.ok(!result.includes('etc-content'), 'slash in domain should be rejected');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
