'use strict';

/**
 * Settings Manager — loads/saves settings from ~/.mac10/settings.json
 * and .mac10/settings.json (project-level). Project settings override global.
 *
 * Modes:
 *  - "dev" (default): delegates to existing provider.sh / scripts/ (Claude CLI, tmux)
 *  - "live": direct API calls via api-backend.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const GLOBAL_DIR = path.join(os.homedir(), '.mac10');
const GLOBAL_SETTINGS_FILE = path.join(GLOBAL_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  mode: 'dev',
  default_provider: 'anthropic',
  providers: {
    anthropic: {
      api_key: '',
      models: {
        fast: 'claude-sonnet-4-6',
        deep: 'claude-opus-4-6',
        economy: 'claude-haiku-4-5-20251001',
      },
    },
    openai: {
      api_key: '',
      models: {
        fast: 'gpt-4.1',
        deep: 'o3',
        economy: 'gpt-4.1-mini',
      },
    },
    google: {
      api_key: '',
      models: {
        fast: 'gemini-2.5-flash',
        deep: 'gemini-2.5-pro',
        economy: 'gemini-2.0-flash-lite',
      },
    },
    deepseek: {
      api_key: '',
      models: {
        fast: 'deepseek-chat',
        deep: 'deepseek-reasoner',
        economy: 'deepseek-chat',
      },
    },
  },
  fallback_order: ['anthropic', 'openai', 'google', 'deepseek'],
  search: {
    default_provider: 'perplexity',
    providers: {
      perplexity: { api_key: '' },
      brave: { api_key: '' },
      google: { api_key: '', cx: '' },
      tavily: { api_key: '' },
    },
  },
  browser: {
    headless: true,
    timeout_ms: 30000,
    max_concurrent: 2,
  },
  safety: {
    require_confirmation: ['purchase', 'delete', 'send_email', 'deploy'],
    auto_approve: [],
  },
  notifications: {
    enabled: false,
    channels: [],
  },
};

let _globalSettings = null;
let _projectSettings = null;
let _projectDir = null;
let _merged = null;
let _globalSettingsFileOverride = null;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadJsonFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    // Ignore parse errors — return null
  }
  return null;
}

function saveJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

function getGlobalSettingsFile() {
  return _globalSettingsFileOverride || GLOBAL_SETTINGS_FILE;
}

function setGlobalSettingsFileOverride(filePath) {
  _globalSettingsFileOverride = filePath;
}

function load(projectDir) {
  _projectDir = projectDir || null;
  _globalSettings = loadJsonFile(getGlobalSettingsFile()) || {};
  _projectSettings = _projectDir
    ? loadJsonFile(path.join(_projectDir, '.mac10', 'settings.json')) || {}
    : {};
  _merged = deepMerge(deepMerge(DEFAULT_SETTINGS, _globalSettings), _projectSettings);
  return _merged;
}

function get(keyPath) {
  if (!_merged) load(_projectDir);
  const keys = keyPath.split('.');
  let value = _merged;
  for (const key of keys) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[key];
  }
  return value;
}

function set(keyPath, value, scope = 'global') {
  const keys = keyPath.split('.');
  const target = scope === 'project' ? _projectSettings : _globalSettings;
  let obj = target;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
      obj[keys[i]] = {};
    }
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;

  // Save to disk
  if (scope === 'project' && _projectDir) {
    saveJsonFile(path.join(_projectDir, '.mac10', 'settings.json'), _projectSettings);
  } else {
    saveJsonFile(getGlobalSettingsFile(), _globalSettings);
  }

  // Re-merge
  _merged = deepMerge(deepMerge(DEFAULT_SETTINGS, _globalSettings), _projectSettings);
  return _merged;
}

function getMode() {
  return get('mode') || 'dev';
}

function isLiveMode() {
  return getMode() === 'live';
}

function isDevMode() {
  return getMode() === 'dev';
}

function getProvider(name) {
  return get(`providers.${name}`);
}

function getDefaultProvider() {
  return get('default_provider') || 'anthropic';
}

function getApiKey(providerName) {
  // Check environment variable first (e.g., ANTHROPIC_API_KEY)
  const envKey = `${providerName.toUpperCase()}_API_KEY`;
  if (process.env[envKey]) return process.env[envKey];

  // Special cases
  if (providerName === 'openai' && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (providerName === 'google' && process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;

  return get(`providers.${providerName}.api_key`) || '';
}

function getSearchApiKey(providerName) {
  const envKey = `${providerName.toUpperCase()}_API_KEY`;
  if (process.env[envKey]) return process.env[envKey];
  return get(`search.providers.${providerName}.api_key`) || '';
}

function getAll() {
  if (!_merged) load(_projectDir);
  return { ..._merged };
}

function reset() {
  _globalSettings = null;
  _projectSettings = null;
  _projectDir = null;
  _merged = null;
  _globalSettingsFileOverride = null;
}

module.exports = {
  DEFAULT_SETTINGS,
  load,
  get,
  set,
  getMode,
  isLiveMode,
  isDevMode,
  getProvider,
  getDefaultProvider,
  getApiKey,
  getSearchApiKey,
  getAll,
  reset,
  deepMerge,
  setGlobalSettingsFileOverride,
  GLOBAL_SETTINGS_FILE,
};
