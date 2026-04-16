'use strict';

/**
 * API Backend — direct LLM API calling for live mode.
 * Supports Anthropic, OpenAI, Google (Gemini), and DeepSeek HTTP APIs.
 */

const https = require('https');
const settingsManager = require('./settings-manager');

const ENDPOINTS = {
  anthropic: {
    host: 'api.anthropic.com',
    path: '/v1/messages',
    authHeader: 'x-api-key',
    contentType: 'application/json',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
  },
  openai: {
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    contentType: 'application/json',
  },
  google: {
    host: 'generativelanguage.googleapis.com',
    basePath: '/v1beta/models/',
    pathSuffix: ':generateContent',
    authParam: 'key',
    contentType: 'application/json',
  },
  deepseek: {
    host: 'api.deepseek.com',
    path: '/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    contentType: 'application/json',
  },
};

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error?.message || `HTTP ${res.statusCode}`);
            err.statusCode = res.statusCode;
            err.body = parsed;
            reject(err);
          } else {
            resolve({ status: res.statusCode, data: parsed });
          }
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function buildAnthropicRequest(model, messages, opts = {}) {
  const apiKey = settingsManager.getApiKey('anthropic');
  const endpoint = ENDPOINTS.anthropic;
  const options = {
    hostname: endpoint.host,
    path: endpoint.path,
    method: 'POST',
    headers: {
      'Content-Type': endpoint.contentType,
      [endpoint.authHeader]: apiKey,
      ...endpoint.extraHeaders,
    },
  };
  const body = {
    model,
    max_tokens: opts.max_tokens || 4096,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  };
  if (opts.system) body.system = opts.system;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.tools) body.tools = opts.tools;
  return { options, body };
}

function buildOpenAIRequest(model, messages, opts = {}) {
  const apiKey = settingsManager.getApiKey('openai');
  const endpoint = ENDPOINTS.openai;
  const options = {
    hostname: endpoint.host,
    path: endpoint.path,
    method: 'POST',
    headers: {
      'Content-Type': endpoint.contentType,
      [endpoint.authHeader]: `${endpoint.authPrefix}${apiKey}`,
    },
  };
  const body = {
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  };
  if (opts.max_tokens) body.max_tokens = opts.max_tokens;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.tools) body.tools = opts.tools;
  return { options, body };
}

function buildGoogleRequest(model, messages, opts = {}) {
  const apiKey = settingsManager.getApiKey('google');
  const endpoint = ENDPOINTS.google;
  const options = {
    hostname: endpoint.host,
    path: `${endpoint.basePath}${model}${endpoint.pathSuffix}?${endpoint.authParam}=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': endpoint.contentType },
  };
  const body = {
    contents: messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }
  return { options, body };
}

function buildDeepSeekRequest(model, messages, opts = {}) {
  const apiKey = settingsManager.getApiKey('deepseek');
  const endpoint = ENDPOINTS.deepseek;
  const options = {
    hostname: endpoint.host,
    path: endpoint.path,
    method: 'POST',
    headers: {
      'Content-Type': endpoint.contentType,
      [endpoint.authHeader]: `${endpoint.authPrefix}${apiKey}`,
    },
  };
  const body = {
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  };
  if (opts.max_tokens) body.max_tokens = opts.max_tokens;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  return { options, body };
}

const REQUEST_BUILDERS = {
  anthropic: buildAnthropicRequest,
  openai: buildOpenAIRequest,
  google: buildGoogleRequest,
  deepseek: buildDeepSeekRequest,
};

/**
 * Normalize responses from different providers into a common format.
 */
function normalizeResponse(provider, data) {
  if (provider === 'anthropic') {
    return {
      content: data.content?.[0]?.text || '',
      role: 'assistant',
      usage: {
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        cache_read_tokens: data.usage?.cache_read_input_tokens || 0,
        cache_creation_tokens: data.usage?.cache_creation_input_tokens || 0,
      },
      stop_reason: data.stop_reason,
      raw: data,
    };
  }

  if (provider === 'openai' || provider === 'deepseek') {
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      role: 'assistant',
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
        cache_read_tokens: data.usage?.prompt_tokens_details?.cached_tokens || 0,
        cache_creation_tokens: 0,
      },
      stop_reason: choice?.finish_reason,
      raw: data,
    };
  }

  if (provider === 'google') {
    const candidate = data.candidates?.[0];
    return {
      content: candidate?.content?.parts?.[0]?.text || '',
      role: 'assistant',
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount || 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      },
      stop_reason: candidate?.finishReason,
      raw: data,
    };
  }

  return { content: '', role: 'assistant', usage: {}, raw: data };
}

/**
 * Call an LLM API.
 * @param {string} provider - Provider name (anthropic, openai, google, deepseek)
 * @param {string} model - Model identifier
 * @param {Array} messages - [{ role, content }]
 * @param {Object} opts - Provider-specific options
 * @returns {Promise<Object>} Normalized response
 */
async function call(provider, model, messages, opts = {}) {
  const builder = REQUEST_BUILDERS[provider];
  if (!builder) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const apiKey = settingsManager.getApiKey(provider);
  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Set ${provider.toUpperCase()}_API_KEY or configure in settings.`);
  }

  const { options, body } = builder(model, messages, opts);
  const response = await httpRequest(options, body);
  return normalizeResponse(provider, response.data);
}

/**
 * Check if a provider has a valid API key configured.
 */
function isProviderAvailable(provider) {
  return !!settingsManager.getApiKey(provider);
}

/**
 * List available providers (those with API keys).
 */
function listAvailableProviders() {
  return ['anthropic', 'openai', 'google', 'deepseek'].filter(isProviderAvailable);
}

module.exports = {
  call,
  isProviderAvailable,
  listAvailableProviders,
  normalizeResponse,
  ENDPOINTS,
  httpRequest,
};
