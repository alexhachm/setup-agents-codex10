'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const providerOutput = require('../src/provider-output');

const repoRoot = path.resolve(__dirname, '..', '..');

describe('provider output normalization', () => {
  it('loads Claude usage aliases and task columns from the provider manifest', () => {
    const options = {
      projectDir: repoRoot,
      provider: 'claude',
      pluginRoot: path.join(repoRoot, 'plugins', 'agents'),
    };

    const config = providerOutput.getUsageConfig(options);
    assert.ok(config.formats.includes('anthropic'));
    assert.ok(config.formats.includes('openai-compatible'));
    assert.strictEqual(config.aliases.prompt_tokens, 'input_tokens');
    assert.strictEqual(config.aliases.cached_input_tokens, 'cached_tokens');
    assert.strictEqual(config.columns.cached_tokens, 'usage_cached_tokens');

    const usage = providerOutput.normalizeUsagePayload({
      model: '  claude-sonnet  ',
      prompt_tokens: 120,
      completion_tokens: 30,
      cached_input_tokens: 17,
      cache_creation: {
        ephemeral_5m_input_tokens: 4,
        ephemeral_1h_input_tokens: 9,
        provider_specific_cache_tokens: 11,
      },
      input_tokens_details: {
        audio_tokens: 2,
        provider_bonus_tokens: 5,
      },
      cost_usd: 0.015,
    }, options);

    assert.deepStrictEqual(usage, {
      model: 'claude-sonnet',
      input_tokens: 120,
      output_tokens: 30,
      input_audio_tokens: 2,
      cached_tokens: 17,
      ephemeral_5m_input_tokens: 4,
      ephemeral_1h_input_tokens: 9,
      cache_creation_tokens: 13,
      cost_usd: 0.015,
      cache_creation: { provider_specific_cache_tokens: 11 },
      input_tokens_details: { provider_bonus_tokens: 5 },
    });

    const mapped = providerOutput.mapUsagePayloadToTaskFields(usage, {
      usage_model: null,
      usage_input_tokens: null,
      usage_output_tokens: null,
      usage_cached_tokens: null,
      usage_cache_creation_tokens: null,
      usage_payload_json: null,
    }, options);

    assert.strictEqual(mapped.usage_model, 'claude-sonnet');
    assert.strictEqual(mapped.usage_input_tokens, 120);
    assert.strictEqual(mapped.usage_output_tokens, 30);
    assert.strictEqual(mapped.usage_cached_tokens, 17);
    assert.strictEqual(mapped.usage_cache_creation_tokens, 13);
    assert.deepStrictEqual(JSON.parse(mapped.usage_payload_json), usage);
  });

  it('uses a custom provider manifest without changing coordinator core parsing code', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-provider-output-'));
    const pluginRoot = path.join(tmpDir, 'plugins', 'agents');
    const providerDir = path.join(pluginRoot, 'acme');
    fs.mkdirSync(providerDir, { recursive: true });
    fs.writeFileSync(path.join(providerDir, 'plugin.json'), JSON.stringify({
      schema_version: 1,
      id: 'acme',
      enabled: true,
      output: {
        usage: {
          formats: ['acme-json'],
          fields: {
            model: 'string',
            input_tokens: 'number',
            output_tokens: 'number',
            cost_usd: 'number',
          },
          integer_fields: ['input_tokens', 'output_tokens'],
          aliases: {
            tokens_in: 'input_tokens',
            tokens_out: 'output_tokens',
          },
          columns: {
            model: 'usage_model',
            input_tokens: 'usage_input_tokens',
            output_tokens: 'usage_output_tokens',
            cost_usd: 'usage_cost_usd',
          },
        },
      },
    }), 'utf8');

    try {
      const options = { projectDir: tmpDir, provider: 'acme', pluginRoot };
      const config = providerOutput.getUsageConfig(options);
      assert.deepStrictEqual(config.formats, ['acme-json']);

      const usage = providerOutput.normalizeUsagePayload({
        model: ' acme-large ',
        tokens_in: 9,
        tokens_out: 4,
        cost_usd: 0.025,
        provider_trace_id: 'trace-1',
      }, options);

      assert.deepStrictEqual(usage, {
        model: 'acme-large',
        input_tokens: 9,
        output_tokens: 4,
        cost_usd: 0.025,
        provider_trace_id: 'trace-1',
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('defaults usage parsing to the first active provider manifest', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-provider-output-default-'));
    const pluginRoot = path.join(tmpDir, 'plugins', 'agents');
    const providerDir = path.join(pluginRoot, 'acme');
    fs.mkdirSync(providerDir, { recursive: true });
    fs.writeFileSync(path.join(providerDir, 'plugin.json'), JSON.stringify({
      schema_version: 1,
      id: 'acme',
      enabled: true,
      output: {
        usage: {
          formats: ['acme-json'],
          fields: {
            model: 'string',
            input_tokens: 'number',
            output_tokens: 'number',
          },
          integer_fields: ['input_tokens', 'output_tokens'],
          aliases: {
            tokens_in: 'input_tokens',
            tokens_out: 'output_tokens',
          },
        },
      },
    }), 'utf8');

    const previousProvider = process.env.MAC10_AGENT_PROVIDER;
    const previousDefault = process.env.MAC10_DEFAULT_AGENT_PROVIDER;
    delete process.env.MAC10_AGENT_PROVIDER;
    delete process.env.MAC10_DEFAULT_AGENT_PROVIDER;

    try {
      const usage = providerOutput.normalizeUsagePayload({
        model: 'acme-large',
        tokens_in: 3,
        tokens_out: 2,
      }, { projectDir: tmpDir, pluginRoot });

      assert.deepStrictEqual(usage, {
        model: 'acme-large',
        input_tokens: 3,
        output_tokens: 2,
      });
    } finally {
      if (previousProvider === undefined) delete process.env.MAC10_AGENT_PROVIDER;
      else process.env.MAC10_AGENT_PROVIDER = previousProvider;
      if (previousDefault === undefined) delete process.env.MAC10_DEFAULT_AGENT_PROVIDER;
      else process.env.MAC10_DEFAULT_AGENT_PROVIDER = previousDefault;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('keeps CLI conflict errors compatible while using provider-backed aliases', () => {
    assert.throws(() => {
      providerOutput.normalizeUsagePayload({
        input_tokens: 1,
        prompt_tokens: 2,
      }, {
        projectDir: repoRoot,
        provider: 'claude',
        pluginRoot: path.join(repoRoot, 'plugins', 'agents'),
        errorStyle: 'cli',
      });
    }, /complete-task usage contains conflicting values for "input_tokens"/);
  });
});
