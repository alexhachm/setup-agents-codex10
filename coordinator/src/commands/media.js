'use strict';

/**
 * CLI command: mac10 media <subcommand>
 *
 * Subcommands:
 *   mac10 media image <prompt> [--size 1024x1024] [--output file.png]
 *   mac10 media vision <image_path> [--prompt "describe"]
 *   mac10 media tts <text> [--voice alloy] [--output file.mp3]
 *   mac10 media transcribe <audio_path>
 */

async function run(args, projectDir) {
  const subcommand = args[0];
  if (!subcommand) {
    return { error: 'Usage: mac10 media <image|vision|tts|transcribe> [args]' };
  }

  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'image':
      return runImage(subArgs);
    case 'vision':
      return runVision(subArgs);
    case 'tts':
      return runTts(subArgs);
    case 'transcribe':
      return runTranscribe(subArgs);
    default:
      return { error: `Unknown media subcommand: ${subcommand}` };
  }
}

async function runImage(args) {
  const imageGen = require('../media/image-gen');
  const prompt = [];
  let size = '1024x1024';
  let output = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size' && args[i + 1]) { size = args[++i]; continue; }
    if (args[i] === '--output' && args[i + 1]) { output = args[++i]; continue; }
    prompt.push(args[i]);
  }

  if (prompt.length === 0) return { error: 'Usage: mac10 media image <prompt>' };

  try {
    return await imageGen.generate(prompt.join(' '), { size, outputPath: output });
  } catch (err) {
    return { error: err.message };
  }
}

async function runVision(args) {
  const vision = require('../media/vision');
  const imagePath = args[0];
  if (!imagePath) return { error: 'Usage: mac10 media vision <image_path> [--prompt text]' };

  const promptIdx = args.indexOf('--prompt');
  const prompt = promptIdx >= 0 ? args.slice(promptIdx + 1).join(' ') : null;

  try {
    return await vision.analyzeImage(imagePath, prompt);
  } catch (err) {
    return { error: err.message };
  }
}

async function runTts(args) {
  const tts = require('../media/tts');
  const text = [];
  let voice = 'alloy';
  let output = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--voice' && args[i + 1]) { voice = args[++i]; continue; }
    if (args[i] === '--output' && args[i + 1]) { output = args[++i]; continue; }
    text.push(args[i]);
  }

  if (text.length === 0) return { error: 'Usage: mac10 media tts <text>' };

  try {
    return await tts.synthesize(text.join(' '), { voice, outputPath: output });
  } catch (err) {
    return { error: err.message };
  }
}

async function runTranscribe(args) {
  const transcribe = require('../media/transcribe');
  const audioPath = args[0];
  if (!audioPath) return { error: 'Usage: mac10 media transcribe <audio_path>' };

  try {
    return await transcribe.transcribe(audioPath);
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { run };
