'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_USAGE_CONFIG = Object.freeze({
  formats: Object.freeze(['canonical']),
  fields: Object.freeze({
    model: 'string',
    input_tokens: 'number',
    output_tokens: 'number',
    input_audio_tokens: 'number',
    output_audio_tokens: 'number',
    reasoning_tokens: 'number',
    accepted_prediction_tokens: 'number',
    rejected_prediction_tokens: 'number',
    cached_tokens: 'number',
    cache_creation_tokens: 'number',
    ephemeral_5m_input_tokens: 'number',
    ephemeral_1h_input_tokens: 'number',
    total_tokens: 'number',
    cost_usd: 'number',
  }),
  integer_fields: Object.freeze([
    'input_tokens',
    'output_tokens',
    'input_audio_tokens',
    'output_audio_tokens',
    'reasoning_tokens',
    'accepted_prediction_tokens',
    'rejected_prediction_tokens',
    'cached_tokens',
    'cache_creation_tokens',
    'ephemeral_5m_input_tokens',
    'ephemeral_1h_input_tokens',
    'total_tokens',
  ]),
  aliases: Object.freeze({
    prompt_tokens: 'input_tokens',
    completion_tokens: 'output_tokens',
    cache_creation_input_tokens: 'cache_creation_tokens',
    cache_read_input_tokens: 'cached_tokens',
    cached_input_tokens: 'cached_tokens',
  }),
  object_aliases: Object.freeze({
    cache_creation: Object.freeze({
      aggregate_field: 'cache_creation_tokens',
      sum_fields: Object.freeze([
        'ephemeral_5m_input_tokens',
        'ephemeral_1h_input_tokens',
      ]),
    }),
  }),
  detail_aliases: Object.freeze({
    input_tokens_details: Object.freeze([
      Object.freeze({ canonical_field: 'cached_tokens', detail_field: 'cached_tokens' }),
      Object.freeze({ canonical_field: 'input_audio_tokens', detail_field: 'audio_tokens' }),
    ]),
    prompt_tokens_details: Object.freeze([
      Object.freeze({ canonical_field: 'cached_tokens', detail_field: 'cached_tokens' }),
      Object.freeze({ canonical_field: 'input_audio_tokens', detail_field: 'audio_tokens' }),
    ]),
    completion_tokens_details: Object.freeze([
      Object.freeze({ canonical_field: 'reasoning_tokens', detail_field: 'reasoning_tokens' }),
      Object.freeze({ canonical_field: 'output_audio_tokens', detail_field: 'audio_tokens' }),
      Object.freeze({ canonical_field: 'accepted_prediction_tokens', detail_field: 'accepted_prediction_tokens' }),
      Object.freeze({ canonical_field: 'rejected_prediction_tokens', detail_field: 'rejected_prediction_tokens' }),
    ]),
    output_tokens_details: Object.freeze([
      Object.freeze({ canonical_field: 'reasoning_tokens', detail_field: 'reasoning_tokens' }),
      Object.freeze({ canonical_field: 'output_audio_tokens', detail_field: 'audio_tokens' }),
    ]),
  }),
  columns: Object.freeze({
    model: 'usage_model',
    input_tokens: 'usage_input_tokens',
    output_tokens: 'usage_output_tokens',
    input_audio_tokens: 'usage_input_audio_tokens',
    output_audio_tokens: 'usage_output_audio_tokens',
    reasoning_tokens: 'usage_reasoning_tokens',
    accepted_prediction_tokens: 'usage_accepted_prediction_tokens',
    rejected_prediction_tokens: 'usage_rejected_prediction_tokens',
    cached_tokens: 'usage_cached_tokens',
    cache_creation_tokens: 'usage_cache_creation_tokens',
    ephemeral_5m_input_tokens: 'usage_cache_creation_ephemeral_5m_input_tokens',
    ephemeral_1h_input_tokens: 'usage_cache_creation_ephemeral_1h_input_tokens',
    total_tokens: 'usage_total_tokens',
    cost_usd: 'usage_cost_usd',
  }),
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizeProviderId(provider) {
  return String(provider || '').toLowerCase().replace(/\s+/g, '');
}

function normalizeRootList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(path.delimiter);
}

function providerPluginRoots(projectDir, options = {}) {
  const roots = [];
  const add = (candidate) => {
    if (!candidate) return;
    const resolved = path.resolve(String(candidate));
    if (!roots.includes(resolved)) roots.push(resolved);
  };

  for (const root of normalizeRootList(options.pluginRoot)) add(root);
  for (const root of normalizeRootList(options.pluginRoots)) add(root);
  for (const root of normalizeRootList(process.env.MAC10_PROVIDER_PLUGIN_ROOT)) add(root);
  if (projectDir) add(path.join(projectDir, 'plugins', 'agents'));
  add(path.join(REPO_ROOT, 'plugins', 'agents'));
  return roots;
}

function findProviderManifest(provider, options = {}) {
  const providerId = normalizeProviderId(provider);
  if (!providerId) return null;
  for (const root of providerPluginRoots(options.projectDir, options)) {
    const candidate = path.join(root, providerId, 'plugin.json');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function manifestEnabled(manifest) {
  return Boolean(manifest) && manifest.enabled !== false;
}

function listActiveProviderIds(options = {}) {
  const ids = [];
  for (const root of providerPluginRoots(options.projectDir, options)) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestFile = path.join(root, entry.name, 'plugin.json');
      const manifest = readJsonFile(manifestFile);
      if (!manifestEnabled(manifest)) continue;
      const id = normalizeProviderId(manifest && manifest.id ? manifest.id : entry.name);
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function defaultProviderId(options = {}) {
  const configured = normalizeProviderId(process.env.MAC10_DEFAULT_AGENT_PROVIDER);
  if (configured) {
    const manifest = readJsonFile(findProviderManifest(configured, options));
    if (manifestEnabled(manifest)) return configured;
  }
  return listActiveProviderIds(options)[0] || 'claude';
}

function readJsonFile(filePath) {
  if (!filePath) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function parseShellAssignmentValue(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readConfiguredProvider(projectDir) {
  if (!projectDir) return '';
  const configFile = path.join(projectDir, '.claude', 'state', 'agent-launcher.env');
  let raw = '';
  try {
    raw = fs.readFileSync(configFile, 'utf8');
  } catch {
    return '';
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*MAC10_AGENT_PROVIDER=(.*)$/);
    if (match) return parseShellAssignmentValue(match[1]);
  }
  return '';
}

function resolveProvider(options = {}) {
  return normalizeProviderId(
    options.provider
    || process.env.MAC10_AGENT_PROVIDER
    || readConfiguredProvider(options.projectDir)
    || defaultProviderId(options)
  );
}

function loadProviderManifest(options = {}) {
  const provider = resolveProvider(options);
  const manifestFile = options.manifestFile || findProviderManifest(provider, options);
  const manifest = readJsonFile(manifestFile);
  return { provider, manifestFile, manifest };
}

function normalizeUsageConfig(rawUsage, rawOutput = {}) {
  const hasUsage = rawUsage && typeof rawUsage === 'object' && !Array.isArray(rawUsage);
  if (!hasUsage) {
    return cloneJson(DEFAULT_USAGE_CONFIG);
  }
  const usage = rawUsage;
  return {
    formats: Array.isArray(usage.formats)
      ? usage.formats.slice()
      : (Array.isArray(rawOutput.usage_payloads) ? rawOutput.usage_payloads.slice() : DEFAULT_USAGE_CONFIG.formats.slice()),
    fields: { ...DEFAULT_USAGE_CONFIG.fields, ...(usage.fields || {}) },
    integer_fields: Array.isArray(usage.integer_fields)
      ? usage.integer_fields.slice()
      : DEFAULT_USAGE_CONFIG.integer_fields.slice(),
    aliases: { ...(usage.aliases || {}) },
    object_aliases: { ...(usage.object_aliases || {}) },
    detail_aliases: { ...(usage.detail_aliases || {}) },
    columns: { ...DEFAULT_USAGE_CONFIG.columns, ...(usage.columns || {}) },
  };
}

function getUsageConfig(options = {}) {
  const { manifest } = loadProviderManifest(options);
  const output = manifest && manifest.output && typeof manifest.output === 'object'
    ? manifest.output
    : {};
  return normalizeUsageConfig(output.usage, output);
}

function errorMessage(kind, data, style) {
  const cli = style === 'cli';
  switch (kind) {
    case 'usage_object':
      return cli ? 'complete-task usage must be a JSON object' : 'Field "usage" must be an object';
    case 'field_object':
      return cli
        ? `complete-task usage field "${data.path}" must be an object`
        : `Field "usage.${data.path}" must be an object`;
    case 'field_type':
      return cli
        ? `complete-task usage field "${data.path}" must be ${data.expected}`
        : `Field "usage.${data.path}" must be of type ${data.expected}`;
    case 'finite_number':
      return cli
        ? `complete-task usage field "${data.path}" must be a finite number`
        : `Field "usage.${data.path}" must be a finite number`;
    case 'non_negative':
      return cli
        ? `complete-task usage field "${data.path}" must be >= 0`
        : `Field "usage.${data.path}" must be >= 0`;
    case 'integer':
      return cli
        ? `complete-task usage field "${data.path}" must be an integer`
        : `Field "usage.${data.path}" must be an integer`;
    case 'model_empty':
      return cli
        ? 'complete-task usage field "model" cannot be empty'
        : 'Field "usage.model" cannot be empty';
    case 'conflict':
      return cli
        ? `complete-task usage contains conflicting values for "${data.field}"`
        : `Field "usage" contains conflicting values for key "${data.field}"`;
    default:
      return data && data.message ? data.message : 'Invalid usage payload';
  }
}

function throwUsageError(kind, data, style) {
  throw new Error(errorMessage(kind, data, style));
}

function validateIntegerField(pathLabel, value, style) {
  if (typeof value !== 'number') {
    throwUsageError('field_type', { path: pathLabel, expected: 'number' }, style);
  }
  if (!Number.isFinite(value)) {
    throwUsageError('finite_number', { path: pathLabel }, style);
  }
  if (value < 0) {
    throwUsageError('non_negative', { path: pathLabel }, style);
  }
  if (!Number.isInteger(value)) {
    throwUsageError('integer', { path: pathLabel }, style);
  }
}

function addCanonicalValue(target, field, value, style) {
  if (
    Object.prototype.hasOwnProperty.call(target, field)
    && target[field] !== value
  ) {
    throwUsageError('conflict', { field }, style);
  }
  target[field] = value;
}

function detailAliasCanonicalField(detailAlias) {
  return detailAlias.canonical_field || detailAlias.canonicalField || detailAlias.canonical || '';
}

function detailAliasDetailField(detailAlias) {
  return detailAlias.detail_field || detailAlias.detailField || detailAlias.field || '';
}

function normalizeUsageAliasEntries(rawUsage, usageConfig, style) {
  const aliasNormalized = {};
  const unknownFields = {};
  const fields = usageConfig.fields || {};
  const aliases = usageConfig.aliases || {};
  const objectAliases = usageConfig.object_aliases || {};
  const detailAliases = usageConfig.detail_aliases || {};

  for (const [rawField, rawValue] of Object.entries(rawUsage)) {
    if (Object.prototype.hasOwnProperty.call(objectAliases, rawField)) {
      if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        throwUsageError('field_object', { path: rawField }, style);
      }
      const objectSpec = objectAliases[rawField] || {};
      const sumFields = Array.isArray(objectSpec.sum_fields) ? objectSpec.sum_fields : [];
      const aggregateField = objectSpec.aggregate_field || '';
      const passthroughNestedFields = {};
      const objectEntries = [];
      let aggregateTokens = 0;
      for (const [nestedField, nestedValue] of Object.entries(rawValue)) {
        if (!sumFields.includes(nestedField)) {
          passthroughNestedFields[nestedField] = nestedValue;
          continue;
        }
        validateIntegerField(`${rawField}.${nestedField}`, nestedValue, style);
        aggregateTokens += nestedValue;
        objectEntries.push({ canonicalField: nestedField, canonicalValue: nestedValue });
      }
      if (objectEntries.length && aggregateField) {
        objectEntries.push({ canonicalField: aggregateField, canonicalValue: aggregateTokens });
      }
      for (const { canonicalField, canonicalValue } of objectEntries) {
        addCanonicalValue(aliasNormalized, canonicalField, canonicalValue, style);
      }
      if (Object.keys(passthroughNestedFields).length) {
        unknownFields[rawField] = passthroughNestedFields;
      }
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(detailAliases, rawField)) {
      const aliasesForField = Array.isArray(detailAliases[rawField]) ? detailAliases[rawField] : [];
      const detailEntries = [];
      const detailFields = new Set(aliasesForField.map(detailAliasDetailField).filter(Boolean));
      const passthroughNestedFields = {};
      if (rawValue === null) {
        for (const detailAlias of aliasesForField) {
          const canonicalField = detailAliasCanonicalField(detailAlias);
          if (canonicalField) detailEntries.push({ canonicalField, canonicalValue: null });
        }
      } else {
        if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
          throwUsageError('field_object', { path: rawField }, style);
        }
        for (const [nestedField, nestedValue] of Object.entries(rawValue)) {
          if (!detailFields.has(nestedField)) {
            passthroughNestedFields[nestedField] = nestedValue;
          }
        }
        for (const detailAlias of aliasesForField) {
          const canonicalField = detailAliasCanonicalField(detailAlias);
          const detailField = detailAliasDetailField(detailAlias);
          if (!canonicalField || !detailField || !Object.prototype.hasOwnProperty.call(rawValue, detailField)) {
            continue;
          }
          detailEntries.push({
            canonicalField,
            canonicalValue: rawValue[detailField],
          });
        }
      }
      for (const { canonicalField, canonicalValue } of detailEntries) {
        addCanonicalValue(aliasNormalized, canonicalField, canonicalValue, style);
      }
      if (Object.keys(passthroughNestedFields).length) {
        unknownFields[rawField] = passthroughNestedFields;
      }
      continue;
    }

    const canonicalField = aliases[rawField] || rawField;
    if (!Object.prototype.hasOwnProperty.call(fields, canonicalField)) {
      unknownFields[canonicalField] = rawValue;
      continue;
    }
    addCanonicalValue(aliasNormalized, canonicalField, rawValue, style);
  }
  return { aliasNormalized, unknownFields };
}

function normalizeUsagePayload(rawUsage, options = {}) {
  if (rawUsage === undefined || rawUsage === null) return null;
  const style = options.errorStyle || 'server';
  if (!rawUsage || typeof rawUsage !== 'object' || Array.isArray(rawUsage)) {
    throwUsageError('usage_object', {}, style);
  }

  const usageConfig = options.usageConfig || getUsageConfig(options);
  const fields = usageConfig.fields || {};
  const integerFields = new Set(Array.isArray(usageConfig.integer_fields) ? usageConfig.integer_fields : []);
  const { aliasNormalized, unknownFields } = normalizeUsageAliasEntries(rawUsage, usageConfig, style);
  const normalized = {};

  for (const [field, expectedType] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(aliasNormalized, field)) continue;
    const value = aliasNormalized[field];
    if (value === null) {
      normalized[field] = null;
      continue;
    }
    if (typeof value !== expectedType) {
      throwUsageError('field_type', { path: field, expected: expectedType }, style);
    }
    if (expectedType === 'string') {
      const trimmed = value.trim();
      if (!trimmed) throwUsageError('model_empty', {}, style);
      normalized[field] = trimmed;
      continue;
    }
    if (expectedType === 'number') {
      if (integerFields.has(field)) {
        validateIntegerField(field, value, style);
      } else {
        if (!Number.isFinite(value)) throwUsageError('finite_number', { path: field }, style);
        if (value < 0) throwUsageError('non_negative', { path: field }, style);
      }
      normalized[field] = value;
      continue;
    }
    normalized[field] = value;
  }

  if (!Object.keys(unknownFields).length) return normalized;
  return { ...normalized, ...unknownFields };
}

function mapUsagePayloadToTaskFields(usage, taskRow = null, options = {}) {
  const usageConfig = options.usageConfig || getUsageConfig(options);
  const normalizedUsage = normalizeUsagePayload(usage, { ...options, usageConfig });
  if (!normalizedUsage || typeof normalizedUsage !== 'object') return {};
  const mapped = {};
  for (const [usageKey, columnName] of Object.entries(usageConfig.columns || {})) {
    if (!Object.prototype.hasOwnProperty.call(normalizedUsage, usageKey)) continue;
    if (taskRow && !Object.prototype.hasOwnProperty.call(taskRow, columnName)) continue;
    mapped[columnName] = normalizedUsage[usageKey];
  }
  if (!taskRow || Object.prototype.hasOwnProperty.call(taskRow, 'usage_payload_json')) {
    mapped.usage_payload_json = JSON.stringify(normalizedUsage);
  }
  return mapped;
}

module.exports = {
  DEFAULT_USAGE_CONFIG,
  findProviderManifest,
  getUsageConfig,
  loadProviderManifest,
  mapUsagePayloadToTaskFields,
  normalizeProviderId,
  normalizeUsagePayload,
  providerPluginRoots,
  resolveProvider,
};
