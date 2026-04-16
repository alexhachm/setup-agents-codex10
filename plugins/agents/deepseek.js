'use strict';

/**
 * DeepSeek provider plugin — API-based access for live mode.
 */

const PROVIDER_NAME = 'deepseek';
const DEFAULT_MODELS = {
  fast: 'deepseek-chat',
  deep: 'deepseek-reasoner',
  economy: 'deepseek-chat',
};

function isAvailable() {
  return !!(process.env.DEEPSEEK_API_KEY);
}

function getDefaultModel(tier) {
  return DEFAULT_MODELS[tier] || DEFAULT_MODELS.fast;
}

function getEndpoint() {
  return {
    host: 'api.deepseek.com',
    path: '/v1/chat/completions',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  };
}

module.exports = {
  name: PROVIDER_NAME,
  isAvailable,
  getDefaultModel,
  getEndpoint,
  DEFAULT_MODELS,
};
