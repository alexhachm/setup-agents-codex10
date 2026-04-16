'use strict';

/**
 * Vision — analyze images using multimodal LLMs.
 */

const settingsManager = require('../settings-manager');
const apiBackend = require('../api-backend');
const modelRouter = require('../model-router');
const fs = require('fs');

async function analyzeImage(imagePath, prompt, opts = {}) {
  if (settingsManager.isDevMode()) {
    return { description: 'Vision analysis requires live mode', dev_mode: true };
  }

  const resolution = modelRouter.resolve('fast');
  let imageContent;

  if (imagePath.startsWith('http')) {
    imageContent = { type: 'image_url', image_url: { url: imagePath } };
  } else {
    const imageData = fs.readFileSync(imagePath);
    const base64 = imageData.toString('base64');
    const mime = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    imageContent = {
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${base64}` },
    };
  }

  if (resolution.provider === 'anthropic') {
    // Anthropic uses different image format
    const messages = [{
      role: 'user',
      content: [
        imagePath.startsWith('http')
          ? { type: 'image', source: { type: 'url', url: imagePath } }
          : { type: 'image', source: { type: 'base64', media_type: imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg', data: imageContent.image_url.url.split(',')[1] } },
        { type: 'text', text: prompt || 'Describe this image in detail.' },
      ],
    }];
    return apiBackend.call(resolution.provider, resolution.model, messages, { max_tokens: 1000 });
  }

  // OpenAI-style
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: prompt || 'Describe this image in detail.' },
      imageContent,
    ],
  }];

  return apiBackend.call(resolution.provider, resolution.model, messages, { max_tokens: 1000 });
}

module.exports = { analyzeImage };
