'use strict';

/**
 * Text-to-Speech — generate audio from text.
 */

const settingsManager = require('../settings-manager');
const apiBackend = require('../api-backend');
const fs = require('fs');

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

async function synthesize(text, opts = {}) {
  const apiKey = settingsManager.getApiKey('openai');
  if (!apiKey) throw new Error('TTS requires OpenAI API key');

  const body = {
    model: opts.model || 'tts-1',
    input: text,
    voice: opts.voice || 'alloy',
    response_format: opts.format || 'mp3',
    speed: opts.speed || 1.0,
  };

  const response = await apiBackend.httpRequest({
    hostname: 'api.openai.com',
    path: '/v1/audio/speech',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  }, body);

  if (opts.outputPath && response.data) {
    fs.writeFileSync(opts.outputPath, Buffer.from(response.data));
  }

  return {
    format: body.response_format,
    voice: body.voice,
    text_length: text.length,
    output_path: opts.outputPath || null,
  };
}

module.exports = { synthesize, VOICES };
