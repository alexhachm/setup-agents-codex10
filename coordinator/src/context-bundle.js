'use strict';

/**
 * Context Bundle — context compaction for long conversations.
 * Compresses conversation history to fit within token limits.
 */

const apiBackend = require('./api-backend');
const modelRouter = require('./model-router');
const settingsManager = require('./settings-manager');

const DEFAULT_MAX_TOKENS = 100000;
const COMPACTION_THRESHOLD = 0.75; // Compact when 75% full

/**
 * Estimate token count (rough heuristic: 4 chars ≈ 1 token).
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * Compact a conversation history by summarizing older messages.
 * @param {Array} messages - [{ role, content }]
 * @param {Object} opts - { maxTokens, keepLast }
 * @returns {Promise<Array>} - Compacted messages
 */
async function compact(messages, opts = {}) {
  const maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
  const keepLast = opts.keepLast || 10;

  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  if (totalTokens < maxTokens * COMPACTION_THRESHOLD) {
    return messages; // No compaction needed
  }

  // Keep the last N messages as-is
  const recent = messages.slice(-keepLast);
  const older = messages.slice(0, -keepLast);

  if (older.length === 0) return messages;

  // Summarize older messages
  if (settingsManager.isLiveMode()) {
    try {
      const resolution = modelRouter.resolve('economy');
      const olderText = older.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

      const summary = await apiBackend.call(
        resolution.provider,
        resolution.model,
        [{
          role: 'user',
          content: `Summarize the following conversation history into a concise context summary (max 500 words). Preserve key decisions, facts, and action items:\n\n${olderText}`,
        }],
        { max_tokens: 1000 }
      );

      return [
        { role: 'system', content: `[Context summary of ${older.length} earlier messages]\n${summary.content}` },
        ...recent,
      ];
    } catch {
      return simpleCompact(messages, maxTokens, keepLast);
    }
  }

  return simpleCompact(messages, maxTokens, keepLast);
}

/**
 * Simple compaction — just truncate older messages.
 */
function simpleCompact(messages, maxTokens, keepLast) {
  const recent = messages.slice(-keepLast);
  const older = messages.slice(0, -keepLast);

  // Summarize by taking first and last lines
  const summaryParts = older.map(m => {
    const lines = m.content.split('\n');
    if (lines.length <= 3) return `[${m.role}]: ${m.content}`;
    return `[${m.role}]: ${lines[0]}... [${lines.length} lines]`;
  });

  return [
    { role: 'system', content: `[Compacted ${older.length} messages]\n${summaryParts.join('\n')}` },
    ...recent,
  ];
}

/**
 * Build a context bundle from task context.
 */
function buildBundle(task, projectContext) {
  const sections = [];

  if (projectContext) {
    sections.push(`## Project Context\n${projectContext}`);
  }

  if (task) {
    sections.push(`## Current Task\nSubject: ${task.subject}\nDescription: ${task.description}`);
    if (task.domain) sections.push(`Domain: ${task.domain}`);
    if (task.files) sections.push(`Files: ${task.files}`);
  }

  return sections.join('\n\n');
}

module.exports = {
  compact,
  simpleCompact,
  buildBundle,
  estimateTokens,
  DEFAULT_MAX_TOKENS,
  COMPACTION_THRESHOLD,
};
