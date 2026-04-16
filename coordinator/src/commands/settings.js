'use strict';

/**
 * CLI command: mac10 settings
 *
 * Subcommands:
 *   mac10 settings show              — display current merged settings
 *   mac10 settings get <key>          — get a specific setting
 *   mac10 settings set <key> <value>  — set a setting (--project for project scope)
 *   mac10 settings mode [dev|live]    — get or switch mode
 *   mac10 settings provider <name>    — show provider config
 *   mac10 settings api-key <provider> <key> — set API key for a provider
 *   mac10 settings reset              — reset to defaults
 */

const settingsManager = require('../settings-manager');

function run(args, projectDir) {
  settingsManager.load(projectDir);
  const subcommand = args[0] || 'show';

  switch (subcommand) {
    case 'show':
      return showSettings();
    case 'get':
      return getSetting(args[1]);
    case 'set':
      return setSetting(args[1], args[2], args.includes('--project') ? 'project' : 'global');
    case 'mode':
      return handleMode(args[1]);
    case 'provider':
      return showProvider(args[1]);
    case 'api-key':
      return setApiKey(args[1], args[2], args.includes('--project') ? 'project' : 'global');
    case 'reset':
      return resetSettings();
    case 'providers':
      return listProviders();
    default:
      return { error: `Unknown settings subcommand: ${subcommand}` };
  }
}

function showSettings() {
  const settings = settingsManager.getAll();
  // Redact API keys for display
  const redacted = JSON.parse(JSON.stringify(settings));
  if (redacted.providers) {
    for (const [name, config] of Object.entries(redacted.providers)) {
      if (config.api_key) {
        config.api_key = config.api_key ? '***' + config.api_key.slice(-4) : '(not set)';
      }
    }
  }
  if (redacted.search?.providers) {
    for (const [name, config] of Object.entries(redacted.search.providers)) {
      if (config.api_key) {
        config.api_key = config.api_key ? '***' + config.api_key.slice(-4) : '(not set)';
      }
    }
  }
  return {
    type: 'settings',
    mode: settings.mode,
    default_provider: settings.default_provider,
    settings: redacted,
  };
}

function getSetting(keyPath) {
  if (!keyPath) return { error: 'Usage: mac10 settings get <key.path>' };
  const value = settingsManager.get(keyPath);
  return { key: keyPath, value };
}

function setSetting(keyPath, value, scope) {
  if (!keyPath || value === undefined) {
    return { error: 'Usage: mac10 settings set <key.path> <value> [--project]' };
  }
  // Try to parse JSON values
  let parsed = value;
  try { parsed = JSON.parse(value); } catch {}
  settingsManager.set(keyPath, parsed, scope);
  return { key: keyPath, value: parsed, scope };
}

function handleMode(mode) {
  if (!mode) {
    return { mode: settingsManager.getMode() };
  }
  if (mode !== 'dev' && mode !== 'live') {
    return { error: 'Mode must be "dev" or "live"' };
  }
  settingsManager.set('mode', mode);
  return { mode, message: `Switched to ${mode} mode` };
}

function showProvider(name) {
  if (!name) return { error: 'Usage: mac10 settings provider <name>' };
  const config = settingsManager.getProvider(name);
  if (!config) return { error: `Unknown provider: ${name}` };
  const display = { ...config };
  if (display.api_key) {
    display.api_key = display.api_key ? '***' + display.api_key.slice(-4) : '(not set)';
  }
  return { provider: name, config: display };
}

function setApiKey(provider, key, scope) {
  if (!provider || !key) {
    return { error: 'Usage: mac10 settings api-key <provider> <key> [--project]' };
  }
  settingsManager.set(`providers.${provider}.api_key`, key, scope);
  return { provider, scope, message: `API key set for ${provider}` };
}

function resetSettings() {
  settingsManager.reset();
  return { message: 'Settings reset to defaults' };
}

function listProviders() {
  const settings = settingsManager.getAll();
  const providers = Object.keys(settings.providers || {}).map(name => ({
    name,
    has_key: !!settingsManager.getApiKey(name),
    models: settings.providers[name].models,
  }));
  return { providers };
}

module.exports = { run };
