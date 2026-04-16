'use strict';

/**
 * Loop Detector — detect runaway tool call loops in agent tasks.
 * MAX_TOOL_CALLS_PER_TASK = 200. Warning at 150, hard stop at 200.
 */

const MAX_TOOL_CALLS_PER_TASK = 200;
const WARNING_THRESHOLD = 150;

// In-memory tracker keyed by task ID
const _taskCallCounts = new Map();

function recordToolCall(taskId) {
  const count = (_taskCallCounts.get(taskId) || 0) + 1;
  _taskCallCounts.set(taskId, count);

  if (count >= MAX_TOOL_CALLS_PER_TASK) {
    return {
      action: 'stop',
      count,
      reason: `Task ${taskId} hit hard limit of ${MAX_TOOL_CALLS_PER_TASK} tool calls`,
    };
  }

  if (count >= WARNING_THRESHOLD) {
    return {
      action: 'warn',
      count,
      reason: `Task ${taskId} has ${count}/${MAX_TOOL_CALLS_PER_TASK} tool calls`,
    };
  }

  return { action: 'ok', count };
}

function getCount(taskId) {
  return _taskCallCounts.get(taskId) || 0;
}

function isOverLimit(taskId) {
  return getCount(taskId) >= MAX_TOOL_CALLS_PER_TASK;
}

function isWarning(taskId) {
  const count = getCount(taskId);
  return count >= WARNING_THRESHOLD && count < MAX_TOOL_CALLS_PER_TASK;
}

function resetTask(taskId) {
  _taskCallCounts.delete(taskId);
}

function resetAll() {
  _taskCallCounts.clear();
}

function getAllCounts() {
  const result = {};
  for (const [taskId, count] of _taskCallCounts) {
    result[taskId] = count;
  }
  return result;
}

module.exports = {
  MAX_TOOL_CALLS_PER_TASK,
  WARNING_THRESHOLD,
  recordToolCall,
  getCount,
  isOverLimit,
  isWarning,
  resetTask,
  resetAll,
  getAllCounts,
};
