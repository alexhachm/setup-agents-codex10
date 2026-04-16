'use strict';

/**
 * Image Generation — generate images via DALL-E, Stable Diffusion, etc.
 */

const settingsManager = require('../settings-manager');
const apiBackend = require('../api-backend');

const PROVIDERS = {
  openai: {
    host: 'api.openai.com',
    path: '/v1/images/generations',
    model: 'dall-e-3',
  },
};

async function generate(prompt, opts = {}) {
  const provider = opts.provider || 'openai';
  const config = PROVIDERS[provider];
  if (!config) throw new Error(`Image gen provider "${provider}" not supported`);

  const apiKey = settingsManager.getApiKey(provider === 'openai' ? 'openai' : provider);
  if (!apiKey) throw new Error(`No API key for ${provider}`);

  const body = {
    model: opts.model || config.model,
    prompt,
    n: opts.count || 1,
    size: opts.size || '1024x1024',
    quality: opts.quality || 'standard',
  };

  const response = await apiBackend.httpRequest({
    hostname: config.host,
    path: config.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  }, body);

  return {
    images: (response.data.data || []).map(img => ({
      url: img.url,
      revised_prompt: img.revised_prompt,
    })),
    provider,
    model: body.model,
  };
}

module.exports = { generate, PROVIDERS };
