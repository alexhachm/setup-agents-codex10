(function() {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const panel = params.get('panel');

  const PANELS = {
    workers: { title: 'Workers', render: renderWorkers },
    requests: { title: 'Requests', render: renderRequests },
    tasks: { title: 'Tasks', render: renderTasks },
    log: { title: 'Activity Log', render: renderLog },
  };

  const config = PANELS[panel];
  if (!config) {
    document.getElementById('panel-content').innerHTML =
      '<div style="color:#f85149;padding:20px">Unknown panel: ' + escapeHtml(panel || '(none)') + '</div>';
    return;
  }

  document.getElementById('panel-title').textContent = config.title;
  document.title = 'mac10 — ' + config.title;

  // Set up panel container
  var contentEl = document.getElementById('panel-content');
  contentEl.innerHTML = '<div id="popout-panel"></div>';

  var ws = null;
  var reconnectTimer = null;
  var reconnectDelay = 1000;
  var MAX_RECONNECT_DELAY = 30000;

  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(protocol + '//' + location.host);

    ws.onopen = function() {
      document.getElementById('status-indicator').className = 'status-dot connected';
      document.getElementById('status-text').textContent = 'Connected';
      reconnectDelay = 1000;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    ws.onclose = function() {
      document.getElementById('status-indicator').className = 'status-dot disconnected';
      document.getElementById('status-text').textContent = 'Disconnected';
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    };

    ws.onmessage = function(event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'init' || msg.type === 'state') {
          config.render(msg.data);
        }
      } catch (e) { console.error('WS parse error:', e); }
    };
  }

  // Also fetch initial state via REST
  fetch('/api/status')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      config.render(data);
    })
    .catch(function(err) { console.error('Status fetch failed:', err); });

  connect();

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function safeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      var parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch (e) {}
    return null;
  }

  function renderPrLink(prUrl) {
    var safe = safeUrl(prUrl);
    if (!safe) return '';
    return '<a href="' + safe + '" target="_blank" rel="noopener" style="color:#58a6ff">PR</a>';
  }

  function renderWorkers(data) {
    var el = document.getElementById('popout-panel');
    var workers = data.workers || [];
    if (workers.length === 0) {
      el.innerHTML = '<div style="color:#8b949e;font-size:13px">No workers registered</div>';
      return;
    }
    el.innerHTML = workers.map(function(w) {
      return '<div class="worker-card">' +
        '<div class="worker-name">Worker ' + w.id + '</div>' +
        '<span class="worker-status badge-' + w.status + '">' + w.status + '</span>' +
        (w.domain ? '<div style="font-size:11px;color:#8b949e;margin-top:4px">' + escapeHtml(w.domain) + '</div>' : '') +
        (w.current_task_id ? '<div style="font-size:11px;color:#58a6ff;margin-top:2px">Task #' + w.current_task_id + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderRequests(data) {
    var el = document.getElementById('popout-panel');
    var requests = data.requests || [];
    if (requests.length === 0) {
      el.innerHTML = '<div style="color:#8b949e;font-size:13px">No requests</div>';
      return;
    }
    el.innerHTML = requests.slice(0, 50).map(function(r) {
      return '<div class="request-item">' +
        '<span class="req-id">' + r.id + '</span>' +
        '<span class="worker-status badge-' + r.status + '">' + r.status + '</span>' +
        (r.tier ? '<span style="font-size:11px;color:#d29922"> T' + r.tier + '</span>' : '') +
        '<div class="req-desc">' + escapeHtml(r.description).slice(0, 200) + '</div>' +
        '</div>';
    }).join('');
  }

  function renderTasks(data) {
    var el = document.getElementById('popout-panel');
    var tasks = data.tasks || [];
    if (tasks.length === 0) {
      el.innerHTML = '<div style="color:#8b949e;font-size:13px">No tasks</div>';
      return;
    }
    el.innerHTML = tasks.slice(0, 50).map(function(t) {
      return '<div class="task-item">' +
        '<span style="color:#58a6ff">#' + t.id + '</span>' +
        '<span class="worker-status badge-' + t.status + '">' + t.status + '</span>' +
        '<div class="task-subject">' + escapeHtml(t.subject) + '</div>' +
        '<div class="task-meta">' +
          (t.domain ? '[' + escapeHtml(t.domain) + ']' : '') + ' T' + t.tier +
          (t.assigned_to ? ' &rarr; worker-' + escapeHtml(String(t.assigned_to)) : '') +
          (t.pr_url ? ' ' + renderPrLink(t.pr_url) : '') +
        '</div>' +
        renderTaskTelemetryChips(t) +
        '</div>';
    }).join('');
  }

  function renderTaskTelemetryChips(task) {
    var telemetry = readTaskTelemetry(task);
    var chips = [];
    if (telemetry.routingClass) chips.push(renderTelemetryChip('route', telemetry.routingClass));
    if (telemetry.routedModel) chips.push(renderTelemetryChip('model', telemetry.routedModel));
    if (telemetry.modelSource) chips.push(renderTelemetryChip('source', telemetry.modelSource));
    if (telemetry.reasoningEffort) chips.push(renderTelemetryChip('effort', telemetry.reasoningEffort));
    if (telemetry.usageModel) chips.push(renderTelemetryChip('usage', telemetry.usageModel));
    if (telemetry.usageInputTokens) chips.push(renderTelemetryChip('in', telemetry.usageInputTokens));
    if (telemetry.usageOutputTokens) chips.push(renderTelemetryChip('out', telemetry.usageOutputTokens));
    if (telemetry.usageCachedTokens) chips.push(renderTelemetryChip('cached', telemetry.usageCachedTokens));
    if (telemetry.usageCacheCreationTokens) chips.push(renderTelemetryChip('cache-create', telemetry.usageCacheCreationTokens));
    if (telemetry.usageReasoningTokens) chips.push(renderTelemetryChip('reasoning', telemetry.usageReasoningTokens));
    if (telemetry.usageAcceptedPredictionTokens) chips.push(renderTelemetryChip('pred-hit', telemetry.usageAcceptedPredictionTokens));
    if (telemetry.usageRejectedPredictionTokens) chips.push(renderTelemetryChip('pred-miss', telemetry.usageRejectedPredictionTokens));
    if (telemetry.usageTotalTokens) chips.push(renderTelemetryChip('total', telemetry.usageTotalTokens));
    if (telemetry.usageCostUsd) chips.push(renderTelemetryChip('cost', telemetry.usageCostUsd));
    if (chips.length === 0) return '';
    return '<div class="task-chip-row">' + chips.join('') + '</div>';
  }

  function renderTelemetryChip(label, value) {
    return '<span class="task-chip"><span class="task-chip-label">' + escapeHtml(label) + '</span>' + escapeHtml(value) + '</span>';
  }

  function readTaskTelemetry(task) {
    var routing = task && task.routing && typeof task.routing === 'object' ? task.routing : null;
    var usage = task && task.usage && typeof task.usage === 'object' ? task.usage : null;
    return {
      routingClass: pickTelemetryValue(task && task.routing_class, task && task.routingClass, routing && routing.class, routing && routing.routing_class),
      routedModel: pickTelemetryValue(task && task.routed_model, task && task.routedModel, task && task.routing_model, task && task.routingModel, routing && routing.model),
      modelSource: pickTelemetryValue(task && task.model_source, task && task.modelSource, task && task.routing_model_source, task && task.routingModelSource, routing && routing.model_source),
      reasoningEffort: pickTelemetryValue(task && task.reasoning_effort, task && task.reasoningEffort, task && task.routing_reasoning_effort, task && task.routingReasoningEffort, routing && routing.reasoning_effort),
      usageModel: pickTelemetryValue(task && task.usage_model, task && task.usageModel, usage && usage.model),
      usageInputTokens: pickTelemetryValue(task && task.usage_input_tokens, task && task.usageInputTokens, usage && usage.input_tokens, usage && usage.inputTokens),
      usageOutputTokens: pickTelemetryValue(task && task.usage_output_tokens, task && task.usageOutputTokens, usage && usage.output_tokens, usage && usage.outputTokens),
      usageCachedTokens: pickTelemetryValue(task && task.usage_cached_tokens, task && task.usageCachedTokens, usage && usage.cached_tokens, usage && usage.cachedTokens),
      usageCacheCreationTokens: pickTelemetryValue(
        task && task.usage_cache_creation_tokens,
        task && task.usageCacheCreationTokens,
        task && task.usage_cache_creation_input_tokens,
        task && task.usageCacheCreationInputTokens,
        usage && usage.cache_creation_tokens,
        usage && usage.cacheCreationTokens,
        usage && usage.cache_creation_input_tokens,
        usage && usage.cacheCreationInputTokens
      ),
      usageReasoningTokens: pickTelemetryValue(
        task && task.usage_reasoning_tokens,
        task && task.usageReasoningTokens,
        usage && usage.reasoning_tokens,
        usage && usage.reasoningTokens
      ),
      usageAcceptedPredictionTokens: pickTelemetryValue(
        task && task.usage_accepted_prediction_tokens,
        task && task.usageAcceptedPredictionTokens,
        usage && usage.accepted_prediction_tokens,
        usage && usage.acceptedPredictionTokens
      ),
      usageRejectedPredictionTokens: pickTelemetryValue(
        task && task.usage_rejected_prediction_tokens,
        task && task.usageRejectedPredictionTokens,
        usage && usage.rejected_prediction_tokens,
        usage && usage.rejectedPredictionTokens
      ),
      usageTotalTokens: pickTelemetryValue(task && task.usage_total_tokens, task && task.usageTotalTokens, usage && usage.total_tokens, usage && usage.totalTokens),
      usageCostUsd: pickTelemetryValue(task && task.usage_cost_usd, task && task.usageCostUsd, usage && usage.cost_usd, usage && usage.costUsd),
    };
  }

  function pickTelemetryValue() {
    var values = Array.prototype.slice.call(arguments);
    for (var i = 0; i < values.length; i++) {
      var normalized = normalizeTelemetryValue(values[i]);
      if (normalized) return normalized;
    }
    return '';
  }

  function normalizeTelemetryValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  function renderLog(data) {
    var el = document.getElementById('popout-panel');
    var logs = data.logs || [];
    if (logs.length === 0) {
      el.innerHTML = '<div style="color:#8b949e;font-size:13px">No log entries</div>';
      return;
    }
    el.innerHTML = logs.reverse().slice(0, 100).map(function(l) {
      return '<div class="log-entry">' +
        '<span class="log-time">' + escapeHtml(l.created_at) + '</span> ' +
        '<span class="log-actor">' + escapeHtml(l.actor) + '</span> ' +
        '<span class="log-action">' + escapeHtml(l.action) + '</span>' +
        (l.details ? ' <span style="color:#484f58">' + escapeHtml(l.details.substring(0, 120)) + '</span>' : '') +
        '</div>';
    }).join('');
  }
})();
