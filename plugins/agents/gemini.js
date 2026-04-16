'use strict';

/**
 * Gemini (Google) provider plugin — API-based access for live mode.
 */

const PROVIDER_NAME = 'google';
const DEFAULT_MODELS = {
  fast: 'gemini-2.5-flash',
  deep: 'gemini-2.5-pro',
  economy: 'gemini-2.0-flash-lite',
};

function isAvailable() {
  return !!(process.env.GOOGLE_API_KEY);
}

function getDefaultModel(tier) {
  return DEFAULT_MODELS[tier] || DEFAULT_MODELS.fast;
}

function getEndpoint() {
  return {
    host: 'generativelanguage.googleapis.com',
    basePath: '/v1beta/models/',
    pathSuffix: ':generateContent',
    authParam: 'key',
  };
}

module.exports = {
  name: PROVIDER_NAME,
  isAvailable,
  getDefaultModel,
  getEndpoint,
  DEFAULT_MODELS,
};
