'use strict';

/**
 * Video Generation Connector Scaffold.
 *
 * NOTE: This is a scaffold for future video generation support.
 * Potential providers: RunwayML, Pika, Luma, Sora
 */

const settingsManager = require('../settings-manager');

const PROVIDERS = {
  runway: {
    name: 'RunwayML',
    host: 'api.runwayml.com',
    models: ['gen-3'],
    max_duration_s: 16,
  },
  pika: {
    name: 'Pika',
    host: 'api.pika.art',
    models: ['pika-1.0'],
    max_duration_s: 4,
  },
  luma: {
    name: 'Luma Dream Machine',
    host: 'api.lumalabs.ai',
    models: ['dream-machine'],
    max_duration_s: 5,
  },
};

function isConfigured(provider) {
  const key = `connectors.video_gen.${provider || 'runway'}`;
  const config = settingsManager.get(key);
  return !!(config && config.api_key);
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([key, config]) => ({
    key,
    name: config.name,
    configured: isConfigured(key),
    models: config.models,
    max_duration_s: config.max_duration_s,
  }));
}

async function generateFromText(prompt, opts = {}) {
  const provider = opts.provider || 'runway';
  if (!isConfigured(provider)) {
    throw new Error(`Video generation provider "${provider}" not configured`);
  }

  // Scaffold — actual implementation would make API call
  return {
    provider,
    prompt,
    duration_s: opts.duration || PROVIDERS[provider]?.max_duration_s || 4,
    status: 'scaffold',
    note: 'Video generation requires provider API integration',
  };
}

async function generateFromImage(imagePath, prompt, opts = {}) {
  const provider = opts.provider || 'runway';
  if (!isConfigured(provider)) {
    throw new Error(`Video generation provider "${provider}" not configured`);
  }

  return {
    provider,
    image_path: imagePath,
    prompt,
    duration_s: opts.duration || 4,
    status: 'scaffold',
    note: 'Image-to-video generation requires provider API integration',
  };
}

async function getStatus(generationId) {
  return {
    id: generationId,
    status: 'scaffold',
    progress: 0,
    note: 'Status tracking requires provider API integration',
  };
}

module.exports = {
  name: 'video-gen',
  isConfigured,
  listProviders,
  generateFromText,
  generateFromImage,
  getStatus,
  PROVIDERS,
};
