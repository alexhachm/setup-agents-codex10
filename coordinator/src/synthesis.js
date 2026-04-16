'use strict';

/**
 * Synthesis — worker output synthesis.
 * Combines results from multiple workers into a unified output.
 */

const db = require('./db');
const apiBackend = require('./api-backend');
const modelRouter = require('./model-router');
const settingsManager = require('./settings-manager');

/**
 * Gather all task results for a request.
 */
function gatherTaskResults(requestId) {
  const tasks = db.listTasks({ request_id: requestId });
  return tasks.map(task => ({
    id: task.id,
    subject: task.subject,
    status: task.status,
    result: task.result,
    pr_url: task.pr_url,
    domain: task.domain,
    completed_at: task.completed_at,
  }));
}

/**
 * Synthesize results into a summary (simple concatenation for dev mode).
 */
function synthesizeSimple(taskResults) {
  const completed = taskResults.filter(t => t.status === 'completed');
  const failed = taskResults.filter(t => t.status === 'failed');

  const sections = [];

  if (completed.length > 0) {
    sections.push('## Completed Tasks');
    for (const task of completed) {
      sections.push(`### ${task.subject}`);
      if (task.result) sections.push(task.result);
      if (task.pr_url) sections.push(`PR: ${task.pr_url}`);
      sections.push('');
    }
  }

  if (failed.length > 0) {
    sections.push('## Failed Tasks');
    for (const task of failed) {
      sections.push(`### ${task.subject}`);
      if (task.result) sections.push(task.result);
      sections.push('');
    }
  }

  return {
    summary: sections.join('\n'),
    completed_count: completed.length,
    failed_count: failed.length,
    total_count: taskResults.length,
  };
}

/**
 * Synthesize results using LLM (for live mode).
 */
async function synthesizeWithLLM(taskResults, requestDescription) {
  if (settingsManager.isDevMode()) {
    return synthesizeSimple(taskResults);
  }

  const resolution = modelRouter.resolve('fast');
  const taskSummary = taskResults.map(t =>
    `Task: ${t.subject}\nStatus: ${t.status}\nResult: ${t.result || 'No result'}`
  ).join('\n\n');

  try {
    const response = await apiBackend.call(resolution.provider, resolution.model, [
      {
        role: 'user',
        content: `Synthesize the following task results into a cohesive summary for the request: "${requestDescription}"

${taskSummary}

Provide a clear, structured summary of what was accomplished, any issues encountered, and next steps if applicable.`,
      },
    ], { max_tokens: 2000 });

    return {
      summary: response.content,
      completed_count: taskResults.filter(t => t.status === 'completed').length,
      failed_count: taskResults.filter(t => t.status === 'failed').length,
      total_count: taskResults.length,
      synthesized_by: `${resolution.provider}/${resolution.model}`,
    };
  } catch {
    return synthesizeSimple(taskResults);
  }
}

/**
 * Synthesize a complete request.
 */
async function synthesizeRequest(requestId) {
  const request = db.getRequest(requestId);
  if (!request) throw new Error(`Request ${requestId} not found`);

  const taskResults = gatherTaskResults(requestId);
  return synthesizeWithLLM(taskResults, request.description);
}

module.exports = {
  gatherTaskResults,
  synthesizeSimple,
  synthesizeWithLLM,
  synthesizeRequest,
};
