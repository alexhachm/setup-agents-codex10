'use strict';

/**
 * Transcription — convert audio to text using Whisper API.
 */

const settingsManager = require('../settings-manager');
const fs = require('fs');
const path = require('path');

async function transcribe(audioPath, opts = {}) {
  const apiKey = settingsManager.getApiKey('openai');
  if (!apiKey) throw new Error('Transcription requires OpenAI API key');

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // For actual implementation, would use form-data upload
  // This is a scaffold that documents the API contract
  return {
    text: '[Transcription requires live API call]',
    language: opts.language || 'en',
    audio_path: audioPath,
    model: 'whisper-1',
    scaffold: true,
  };
}

module.exports = { transcribe };
