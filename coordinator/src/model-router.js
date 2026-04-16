'use strict';

/**
 * Model Router — maps routing_class to provider + model.
 *
 * Routing classes: fast, deep, economy, code, research, browser
 * Each class resolves through: task override → DB rules → settings → defaults
 */

const settingsManager = require('./settings-manager');

const ROUTING_CLASSES = ['fast', 'deep', 'economy', 'code', 'research', 'browser'];

// Default routing class → settings model tier mapping
const CLASS_TO_TIER = {
  fast: 'fast',
  deep: 'deep',
  economy: 'economy',
  code: 'deep',
  research: 'fast',
  browser: 'economy',
};

// In-memory routing rules (loaded from DB or set programmatically)
let _rules = [];
let _db = null;

function init(db) {
  _db = db;
  _rules = loadRulesFromDb();
}

function loadRulesFromDb() {
  if (!_db) return [];
  try {
    const rawDb = _db.getDb ? _db.getDb() : null;
    if (!rawDb) return [];
    // Check if model_routing_rules table exists
    const tableExists = rawDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='model_routing_rules'"
    ).get();
    if (!tableExists) return [];
    return rawDb.prepare('SELECT * FROM model_routing_rules ORDER BY priority DESC').all();
  } catch {
    return [];
  }
}

function resolve(routingClass, taskContext) {
  routingClass = routingClass || 'fast';
  if (!ROUTING_CLASSES.includes(routingClass)) {
    routingClass = 'fast';
  }

  // 1. Check task-level override
  if (taskContext && taskContext.routed_model) {
    const provider = taskContext.model_source || settingsManager.getDefaultProvider();
    return {
      provider,
      model: taskContext.routed_model,
      source: 'task_override',
    };
  }

  // 2. Check DB routing rules (highest priority first)
  for (const rule of _rules) {
    if (rule.routing_class === routingClass && rule.enabled) {
      return {
        provider: rule.provider,
        model: rule.model,
        source: 'db_rule',
        rule_id: rule.id,
      };
    }
  }

  // 3. Resolve from settings
  const mode = settingsManager.getMode();
  if (mode === 'dev') {
    // In dev mode, return the CLI provider reference
    return {
      provider: 'cli',
      model: routingClass,
      source: 'dev_mode',
    };
  }

  // Live mode — resolve provider + model from settings
  const defaultProvider = settingsManager.getDefaultProvider();
  const tier = CLASS_TO_TIER[routingClass] || 'fast';
  const providerConfig = settingsManager.getProvider(defaultProvider);
  const model = (providerConfig && providerConfig.models && providerConfig.models[tier]) || routingClass;

  return {
    provider: defaultProvider,
    model,
    source: 'settings',
  };
}

function resolveWithFallback(routingClass, taskContext) {
  const primary = resolve(routingClass, taskContext);

  if (settingsManager.isDevMode()) {
    return { ...primary, fallbacks: [] };
  }

  // Build fallback chain from settings
  const fallbackOrder = settingsManager.get('fallback_order') || [];
  const tier = CLASS_TO_TIER[routingClass] || 'fast';
  const fallbacks = [];

  for (const providerName of fallbackOrder) {
    if (providerName === primary.provider) continue;
    const apiKey = settingsManager.getApiKey(providerName);
    if (!apiKey) continue;
    const config = settingsManager.getProvider(providerName);
    if (config && config.models && config.models[tier]) {
      fallbacks.push({
        provider: providerName,
        model: config.models[tier],
      });
    }
  }

  return { ...primary, fallbacks };
}

function addRule(rule) {
  if (!_db) {
    _rules.push({ ...rule, id: _rules.length + 1, enabled: rule.enabled !== undefined ? rule.enabled : 1 });
    return;
  }
  try {
    const rawDb = _db.getDb();
    rawDb.prepare(`
      INSERT INTO model_routing_rules (routing_class, provider, model, priority, enabled, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      rule.routing_class,
      rule.provider,
      rule.model,
      rule.priority || 0,
      rule.enabled !== undefined ? (rule.enabled ? 1 : 0) : 1,
      rule.metadata ? JSON.stringify(rule.metadata) : null
    );
    _rules = loadRulesFromDb();
  } catch {
    _rules.push({ ...rule, id: _rules.length + 1 });
  }
}

function removeRule(ruleId) {
  if (_db) {
    try {
      const rawDb = _db.getDb();
      rawDb.prepare('DELETE FROM model_routing_rules WHERE id = ?').run(ruleId);
      _rules = loadRulesFromDb();
      return true;
    } catch {
      return false;
    }
  }
  _rules = _rules.filter(r => r.id !== ruleId);
  return true;
}

function listRules() {
  return [..._rules];
}

function reset() {
  _rules = [];
  _db = null;
}

module.exports = {
  ROUTING_CLASSES,
  CLASS_TO_TIER,
  init,
  resolve,
  resolveWithFallback,
  addRule,
  removeRule,
  listRules,
  reset,
};
