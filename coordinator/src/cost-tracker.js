'use strict';

/**
 * Cost Tracker — token and cost logging per task.
 * Follows OpenTelemetry GenAI conventions schema and Langfuse token/cost tracking pattern.
 */

const db = require('./db');

// Default pricing (per 1K tokens) — can be overridden in model_routing_rules
const DEFAULT_PRICING = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-5.3-codex': { input: 0.005, output: 0.02 },
  'gpt-5.3-codex-spark': { input: 0.001, output: 0.004 },
  'claude-opus-4-6': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001': { input: 0.0008, output: 0.004 },
};

function getPricing(model) {
  // Check DB routing rules for cost overrides
  try {
    const rawDb = db.getDb();
    const rule = rawDb.prepare(
      'SELECT cost_per_1k_input, cost_per_1k_output FROM model_routing_rules WHERE model = ? AND enabled = 1 LIMIT 1'
    ).get(model);
    if (rule && rule.cost_per_1k_input != null) {
      return { input: rule.cost_per_1k_input, output: rule.cost_per_1k_output || 0 };
    }
  } catch {
    // Table may not have cost columns yet
  }
  return DEFAULT_PRICING[model] || { input: 0, output: 0 };
}

function calculateCost(model, inputTokens, outputTokens) {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1e6) / 1e6; // 6 decimal places
}

function recordTaskUsage(taskId, usage) {
  const model = usage.model || 'unknown';
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cost = usage.cost_usd != null ? usage.cost_usd : calculateCost(model, inputTokens, outputTokens);

  try {
    db.updateTask(taskId, {
      usage_model: model,
      usage_input_tokens: inputTokens,
      usage_output_tokens: outputTokens,
      usage_cost_usd: cost,
    });
  } catch {
    // Non-fatal
  }

  return { model, inputTokens, outputTokens, cost };
}

function estimateTaskCost(task) {
  const routingClass = task.routing_class || 'spark';
  const model = task.routed_model || 'gpt-5.3-codex-spark';
  // Estimate based on tier: tier 1 ~2K tokens, tier 2 ~10K, tier 3 ~30K
  const tier = task.tier || 2;
  const estimatedInputTokens = tier <= 1 ? 2000 : tier <= 2 ? 10000 : 30000;
  const estimatedOutputTokens = Math.round(estimatedInputTokens * 0.5);
  const estimated = calculateCost(model, estimatedInputTokens, estimatedOutputTokens);
  return { model, estimatedInputTokens, estimatedOutputTokens, estimated_cost_usd: estimated };
}

function getTaskCostSummary(requestId) {
  try {
    const rawDb = db.getDb();
    const row = rawDb.prepare(`
      SELECT
        COUNT(*) as task_count,
        COALESCE(SUM(usage_input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(usage_output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(usage_cost_usd), 0) as total_cost_usd
      FROM tasks WHERE request_id = ?
    `).get(requestId);
    return {
      request_id: requestId,
      task_count: row.task_count,
      total_input_tokens: row.total_input_tokens,
      total_output_tokens: row.total_output_tokens,
      total_cost_usd: Math.round(row.total_cost_usd * 1e6) / 1e6,
    };
  } catch {
    return { request_id: requestId, task_count: 0, total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 };
  }
}

function getGlobalCostSummary() {
  try {
    const rawDb = db.getDb();
    const row = rawDb.prepare(`
      SELECT
        COUNT(*) as task_count,
        COALESCE(SUM(usage_input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(usage_output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(usage_cost_usd), 0) as total_cost_usd
      FROM tasks
    `).get();
    return {
      task_count: row.task_count,
      total_input_tokens: row.total_input_tokens,
      total_output_tokens: row.total_output_tokens,
      total_cost_usd: Math.round(row.total_cost_usd * 1e6) / 1e6,
    };
  } catch {
    return { task_count: 0, total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 };
  }
}

module.exports = {
  DEFAULT_PRICING,
  getPricing,
  calculateCost,
  recordTaskUsage,
  estimateTaskCost,
  getTaskCostSummary,
  getGlobalCostSummary,
};
