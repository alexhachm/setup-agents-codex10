'use strict';

/**
 * Model Council — query N providers in parallel with the same prompt, synthesize responses.
 * Based on Perplexity Computer's council feature (March 2026).
 */

const settingsManager = require('../settings-manager');

const DEFAULT_COUNCIL_SIZE = 3;
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Query multiple models in parallel and synthesize their responses.
 * @param {string} prompt - The prompt to send to all models
 * @param {Object} opts - Options
 * @param {Array<{provider, model}>} opts.models - Models to query (default: use configured providers)
 * @param {number} opts.timeout - Timeout per model in ms
 * @param {Function} opts.queryFn - async (provider, model, prompt) => response
 * @returns {Promise<Object>} - { responses, synthesis, metadata }
 */
async function query(prompt, opts = {}) {
  const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
  const queryFn = opts.queryFn;
  if (!queryFn) {
    throw new Error('queryFn is required — pass an async function(provider, model, prompt) that calls the API');
  }

  const models = opts.models || getDefaultCouncilModels();
  if (models.length === 0) {
    throw new Error('No models configured for council query');
  }

  const startTime = Date.now();

  // Query all models in parallel with timeout
  const promises = models.map(async ({ provider, model }) => {
    try {
      const result = await Promise.race([
        queryFn(provider, model, prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
      ]);
      return {
        provider,
        model,
        response: result,
        error: null,
        latency_ms: Date.now() - startTime,
      };
    } catch (err) {
      return {
        provider,
        model,
        response: null,
        error: err.message,
        latency_ms: Date.now() - startTime,
      };
    }
  });

  const responses = await Promise.all(promises);
  const successfulResponses = responses.filter(r => !r.error);

  return {
    responses,
    successful_count: successfulResponses.length,
    total_count: responses.length,
    consensus: findConsensus(successfulResponses),
    metadata: {
      prompt_length: prompt.length,
      total_latency_ms: Date.now() - startTime,
      models_queried: models.map(m => `${m.provider}/${m.model}`),
    },
  };
}

function getDefaultCouncilModels() {
  // Build council from configured providers
  const models = [];
  try {
    const providers = settingsManager.get('providers') || {};
    for (const [name, config] of Object.entries(providers)) {
      const apiKey = settingsManager.getApiKey(name);
      if (apiKey && config.models && config.models.deep) {
        models.push({ provider: name, model: config.models.deep });
      }
      if (models.length >= DEFAULT_COUNCIL_SIZE) break;
    }
  } catch {
    // Settings not available
  }
  return models;
}

function findConsensus(responses) {
  if (responses.length === 0) return null;
  if (responses.length === 1) return { type: 'single', summary: 'Only one response received' };

  // Simple consensus: check if responses agree (content overlap)
  const contents = responses.map(r => {
    const text = typeof r.response === 'string' ? r.response : JSON.stringify(r.response);
    return text.toLowerCase();
  });

  // Jaccard similarity between all pairs
  let totalSimilarity = 0;
  let pairs = 0;
  for (let i = 0; i < contents.length; i++) {
    for (let j = i + 1; j < contents.length; j++) {
      totalSimilarity += jaccardSimilarity(contents[i], contents[j]);
      pairs++;
    }
  }
  const avgSimilarity = pairs > 0 ? totalSimilarity / pairs : 0;

  if (avgSimilarity > 0.7) {
    return { type: 'strong_consensus', similarity: Math.round(avgSimilarity * 100) / 100 };
  }
  if (avgSimilarity > 0.4) {
    return { type: 'partial_consensus', similarity: Math.round(avgSimilarity * 100) / 100 };
  }
  return { type: 'divergent', similarity: Math.round(avgSimilarity * 100) / 100 };
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

module.exports = {
  DEFAULT_COUNCIL_SIZE,
  DEFAULT_TIMEOUT_MS,
  query,
  findConsensus,
  jaccardSimilarity,
  getDefaultCouncilModels,
};
