'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { validateProvider, formatReport } = require('../src/provider-enablement');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginRoot = path.join(repoRoot, 'plugins', 'agents');

function runValidate(provider, options = {}) {
  return validateProvider({
    provider,
    projectDir: repoRoot,
    pluginRoot,
    ...options,
  });
}

describe('provider enablement harness', () => {
  it('reports static checks for the enabled Claude manifest', () => {
    const result = runValidate('claude');
    assert.strictEqual(result.provider, 'claude');
    assert.strictEqual(result.enabled, true);
    const names = result.checks.map((c) => c.name);
    for (const expected of [
      'manifest_found',
      'manifest_shape',
      'manifest_enabled',
      'launch_args_shape',
      'output_usage_schema',
      'cli_available',
      'auth_check',
    ]) {
      assert.ok(names.includes(expected), `missing check ${expected}`);
    }
    const shape = result.checks.find((c) => c.name === 'manifest_shape');
    assert.strictEqual(shape.ok, true);
    const launch = result.checks.find((c) => c.name === 'launch_args_shape');
    assert.strictEqual(launch.ok, true);
    const output = result.checks.find((c) => c.name === 'output_usage_schema');
    assert.strictEqual(output.ok, true);
    assert.ok(output.detail.formats.includes('anthropic'));
    const cli = result.checks.find((c) => c.name === 'cli_available');
    assert.strictEqual(cli.ok, null, 'cli runtime check should be skipped by default');
  });

  it('accepts disabled provider stubs without requiring runtime CLI', () => {
    for (const id of ['codex', 'gemini', 'deepseek']) {
      const result = runValidate(id);
      assert.strictEqual(result.provider, id);
      assert.strictEqual(result.enabled, false, `${id} must stay disabled`);
      const shape = result.checks.find((c) => c.name === 'manifest_shape');
      assert.strictEqual(shape.ok, true, `${id} manifest shape invalid: ${JSON.stringify(shape)}`);
      const launch = result.checks.find((c) => c.name === 'launch_args_shape');
      assert.strictEqual(launch.ok, true, `${id} launch args invalid`);
      const output = result.checks.find((c) => c.name === 'output_usage_schema');
      assert.strictEqual(output.ok, true, `${id} usage schema invalid`);
      assert.strictEqual(result.ok, true, `${id} disabled stub should pass static gate`);
    }
  });

  it('flags missing manifests as not ok', () => {
    const result = runValidate('does-not-exist');
    assert.strictEqual(result.ok, false);
    const found = result.checks.find((c) => c.name === 'manifest_found');
    assert.strictEqual(found.ok, false);
  });

  it('formats a human-readable report including all check names', () => {
    const result = runValidate('claude');
    const text = formatReport(result);
    assert.match(text, /provider=claude/);
    assert.match(text, /manifest_found/);
    assert.match(text, /output_usage_schema/);
  });
});
