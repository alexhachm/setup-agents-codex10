'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const providerScript = path.join(repoRoot, 'scripts', 'provider.sh');
const providerEnv = {
  ...process.env,
  MAC10_AGENT_PROVIDER: 'claude',
  MAC10_PROVIDER_PLUGIN_ROOT: path.join(repoRoot, 'plugins', 'agents'),
};

function runProvider(args, options = {}) {
  return execFileSync('bash', [providerScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: options.env || providerEnv,
    stdio: ['ignore', 'pipe', options.captureStderr ? 'pipe' : 'ignore'],
  }).trim();
}

function runRepoScript(scriptName, args = []) {
  return execFileSync('bash', [path.join(repoRoot, scriptName), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: providerEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function renderLaunchArgs({ mode, model, prompt }) {
  const script = String.raw`
set -euo pipefail
mode="$1"
model_alias="$2"
prompt_file="$3"
source scripts/provider-utils.sh
mac10_load_provider_config "$PWD"
resolved_model="$(mac10_resolve_role_model "$model_alias")"
prompt_body="$(mac10_strip_front_matter "$prompt_file")"
args_file="$(mktemp)"
trap 'rm -f "$args_file"' EXIT
mac10_provider_launch_args "$mode" "$PWD" "$prompt_file" "$resolved_model" "$prompt_body" > "$args_file"
node - "$args_file" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const args = raw.split('\0').filter(Boolean);
process.stdout.write(JSON.stringify(args));
NODE
`;
  const output = execFileSync('bash', ['-c', script, 'render-provider-args', mode, model, prompt], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: providerEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function assertModelArg(args, expectedModel) {
  const modelIndex = args.indexOf('--model');
  assert.notStrictEqual(modelIndex, -1, `missing --model in ${JSON.stringify(args)}`);
  assert.strictEqual(args[modelIndex + 1], expectedModel);
}

describe('provider plugin launch interface', () => {
  it('lists and resolves the active Claude provider without invoking the provider CLI', () => {
    const listed = runProvider(['list', repoRoot]);
    assert.match(listed, /^claude\tAnthropic Claude Code CLI\t.+plugins\/agents\/claude\/plugin\.json$/m);

    const current = runProvider(['current', repoRoot]);
    assert.match(current, /^provider=claude$/m);
    assert.match(current, /^cli=claude$/m);
    assert.match(current, /^worker_model=sonnet$/m);
    assert.match(current, /^loop_model=opus$/m);

    const outputSchema = JSON.parse(runProvider(['output-schema', 'claude', repoRoot]));
    assert.ok(outputSchema.formats.includes('anthropic'));
    assert.strictEqual(outputSchema.aliases.prompt_tokens, 'input_tokens');
    assert.strictEqual(outputSchema.aliases.cache_read_input_tokens, 'cached_tokens');
    assert.strictEqual(outputSchema.columns.total_tokens, 'usage_total_tokens');

    const projectOnlyOutputSchema = JSON.parse(runProvider(['output-schema', repoRoot]));
    assert.strictEqual(projectOnlyOutputSchema.aliases.prompt_tokens, 'input_tokens');
  });

  it('catalogs disabled future provider stubs without activating them', () => {
    const catalog = runProvider(['catalog', repoRoot]);
    assert.match(catalog, /^claude\ttrue\tAnthropic Claude Code CLI\t.+plugins\/agents\/claude\/plugin\.json$/m);
    assert.match(catalog, /^codex\tfalse\tOpenAI Codex CLI \(disabled provider stub\)\t.+plugins\/agents\/codex\/plugin\.json$/m);
    assert.match(catalog, /^deepseek\tfalse\tDeepSeek CLI \(disabled provider stub\)\t.+plugins\/agents\/deepseek\/plugin\.json$/m);
    assert.match(catalog, /^gemini\tfalse\tGemini CLI \(disabled provider stub\)\t.+plugins\/agents\/gemini\/plugin\.json$/m);

    const activeList = runProvider(['list', repoRoot]);
    assert.doesNotMatch(activeList, /^codex\t/m);
    assert.doesNotMatch(activeList, /^deepseek\t/m);
    assert.doesNotMatch(activeList, /^gemini\t/m);
    assert.strictEqual(runProvider(['output-schema', 'codex', repoRoot]), '{}');
    assert.throws(() => {
      runProvider(['select', 'codex', repoRoot], { captureStderr: true });
    }, /Command failed/);
  });

  it('defaults to the first active provider from the provider catalog', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-provider-default-'));
    const pluginRoot = path.join(tmpDir, 'plugins', 'agents');
    const providerDir = path.join(pluginRoot, 'acme');
    fs.mkdirSync(providerDir, { recursive: true });
    fs.writeFileSync(path.join(providerDir, 'plugin.json'), JSON.stringify({
      schema_version: 1,
      id: 'acme',
      display_name: 'Acme Agent CLI',
      enabled: true,
      cli: {
        command: 'acme-agent',
        auth_check: {
          command: 'acme-agent',
          args: ['--version'],
        },
      },
      models: {
        fast: 'acme-fast',
        deep: 'acme-deep',
        economy: 'acme-small',
        worker: 'acme-worker',
        loop: 'acme-loop',
      },
      launch: {
        interactive: { args: ['$PROMPT_TEXT'] },
        noninteractive: { args: ['$PROMPT_TEXT'] },
      },
      output: {
        usage_payloads: ['canonical'],
      },
    }), 'utf8');

    const env = {
      ...process.env,
      MAC10_PROVIDER_PLUGIN_ROOT: pluginRoot,
      MAC10_PROVIDER_LOADED_PROVIDER: 'claude',
      MAC10_FAST_MODEL: 'sonnet',
      MAC10_DEEP_MODEL: 'opus',
      MAC10_ECONOMY_MODEL: 'haiku',
      MAC10_WORKER_MODEL: 'sonnet',
      MAC10_LOOP_MODEL: 'opus',
    };
    delete env.MAC10_AGENT_PROVIDER;

    try {
      const current = runProvider(['current', tmpDir], { env });
      assert.match(current, /^provider=acme$/m);
      assert.match(current, /^cli=acme-agent$/m);
      assert.match(current, /^worker_model=acme-worker$/m);
      assert.match(current, /^loop_model=acme-loop$/m);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('dry-runs Master 1 through the interactive provider launch path', () => {
    const output = runProvider([
      'launch-dry-run',
      'interactive',
      repoRoot,
      'deep',
      '.claude/commands/master-loop.md',
    ]);

    assert.match(output, /^provider=claude cli=claude mode=interactive model=opus /);
    assert.match(output, /prompt=\.claude\/commands\/master-loop\.md/);
    assert.match(output, / args=5$/);
  });

  it('routes top-level startup help through the provider-neutral wrapper', () => {
    const startHelp = runRepoScript('start.sh', ['--help']);
    assert.match(startHelp, /\.\/start\.sh \[--provider claude\] \[project_dir\] \[num_workers\]/);
    assert.doesNotMatch(startHelp, /start-claude/);

    const startHereHelp = runRepoScript('START_HERE.sh', ['--help']);
    assert.match(startHereHelp, /\.\/start\.sh \[--provider claude\]/);

    const compatibilityHelp = runRepoScript('start-claude.sh', ['--help']);
    assert.match(compatibilityHelp, /\.\/start\.sh \[--provider claude\]/);
  });

  it('renders manifest launch argv for worker, loop, research, audit, and repair prompts', () => {
    const cases = [
      {
        label: 'worker',
        mode: 'noninteractive',
        model: 'worker',
        prompt: '.claude/commands/worker-loop.md',
        expectedModel: 'sonnet',
      },
      {
        label: 'loop',
        mode: 'noninteractive',
        model: 'loop',
        prompt: '.claude/commands/loop-agent.md',
        expectedModel: 'opus',
      },
      {
        label: 'research discovery',
        mode: 'noninteractive',
        model: 'deep',
        prompt: '.claude/commands/research-discovery-loop.md',
        expectedModel: 'opus',
      },
      {
        label: 'live audit',
        mode: 'noninteractive',
        model: 'deep',
        prompt: 'templates/commands/live-e2e-gpt-launcher.md',
        expectedModel: 'opus',
      },
      {
        label: 'live repair',
        mode: 'noninteractive',
        model: 'deep',
        prompt: 'templates/commands/live-e2e-gpt-repair.md',
        expectedModel: 'opus',
      },
    ];

    for (const testCase of cases) {
      const args = renderLaunchArgs(testCase);
      assert.strictEqual(args[0], '-p', `${testCase.label} should pass prompt text via -p`);
      assert.ok(args[1].length > 20, `${testCase.label} prompt body should be rendered`);
      assertModelArg(args, testCase.expectedModel);
      assert.ok(args.includes('--dangerously-skip-permissions'));
      assert.ok(args.includes('--no-session-persistence'));
      assert.ok(!args.some((arg) => arg.includes('$MODEL') || arg.includes('$PROMPT_TEXT')));
    }
  });

  it('renders manifest launch argv for Master 1 without noninteractive session flags', () => {
    const args = renderLaunchArgs({
      mode: 'interactive',
      model: 'deep',
      prompt: '.claude/commands/master-loop.md',
    });

    assert.strictEqual(args[0], '--dangerously-skip-permissions');
    assertModelArg(args, 'opus');
    assert.ok(args.includes('--'));
    assert.ok(!args.includes('-p'));
    assert.ok(!args.includes('--no-session-persistence'));
    assert.ok(args[args.length - 1].includes('Master'));
  });

  it('fails launch dry-run when the prompt path is invalid', () => {
    assert.throws(() => {
      runProvider([
        'launch-dry-run',
        'noninteractive',
        repoRoot,
        'worker',
        '.claude/commands/not-a-real-command.md',
      ], { captureStderr: true });
    }, /Command failed/);
  });
});
