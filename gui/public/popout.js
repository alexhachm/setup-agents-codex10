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
    var budgetIndicator = renderBudgetIndicator(data);
    if (tasks.length === 0) {
      el.innerHTML = budgetIndicator + '<div style="color:#8b949e;font-size:13px">No tasks</div>';
      return;
    }
    el.innerHTML = budgetIndicator + tasks.slice(0, 50).map(function(t) {
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
    if (telemetry.cacheHitRate) chips.push(renderTelemetryChip('cache-hit', telemetry.cacheHitRate));
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
    var usageInputTokensCandidates = [
      task && task.usage_input_tokens,
      task && task.usageInputTokens,
      usage && usage.input_tokens,
      usage && usage.inputTokens
    ];
    var usageCachedTokensCandidates = [
      task && task.usage_cached_tokens,
      task && task.usageCachedTokens,
      usage && usage.cached_tokens,
      usage && usage.cachedTokens
    ];
    var usageInputTokens = pickTelemetryValue.apply(null, usageInputTokensCandidates);
    var usageCachedTokens = pickTelemetryValue.apply(null, usageCachedTokensCandidates);
    var usageInputTokensNumber = pickFiniteTelemetryNumber.apply(null, usageInputTokensCandidates);
    var usageCachedTokensNumber = pickFiniteTelemetryNumber.apply(null, usageCachedTokensCandidates);
    var cacheHitRate = '';
    if (usageInputTokensNumber !== null && usageCachedTokensNumber !== null && usageInputTokensNumber > 0) {
      cacheHitRate = formatTelemetryPercentage(usageCachedTokensNumber / usageInputTokensNumber);
    }
    return {
      routingClass: pickTelemetryValue(task && task.routing_class, task && task.routingClass, routing && routing.class, routing && routing.routing_class),
      routedModel: pickTelemetryValue(task && task.routed_model, task && task.routedModel, task && task.routing_model, task && task.routingModel, routing && routing.model),
      modelSource: pickTelemetryValue(task && task.model_source, task && task.modelSource, task && task.routing_model_source, task && task.routingModelSource, routing && routing.model_source),
      reasoningEffort: pickTelemetryValue(task && task.reasoning_effort, task && task.reasoningEffort, task && task.routing_reasoning_effort, task && task.routingReasoningEffort, routing && routing.reasoning_effort),
      usageModel: pickTelemetryValue(task && task.usage_model, task && task.usageModel, usage && usage.model),
      usageInputTokens: usageInputTokens,
      usageOutputTokens: pickTelemetryValue(task && task.usage_output_tokens, task && task.usageOutputTokens, usage && usage.output_tokens, usage && usage.outputTokens),
      usageCachedTokens: usageCachedTokens,
      cacheHitRate: cacheHitRate,
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

  function pickFiniteTelemetryNumber() {
    var values = Array.prototype.slice.call(arguments);
    for (var i = 0; i < values.length; i++) {
      var normalized = normalizeTelemetryNumber(values[i]);
      if (normalized !== null) return normalized;
    }
    return null;
  }

  function normalizeTelemetryNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (!trimmed) return null;
    var parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatTelemetryPercentage(value) {
    if (!Number.isFinite(value)) return '';
    return (value * 100).toFixed(1) + '%';
  }

  function normalizeTelemetryValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  function renderBudgetIndicator(state) {
    var snapshot = getBudgetSnapshot(state);
    if (!snapshot) return '';
    var summary = describeBudgetState(snapshot.state);
    return '' +
      '<div class="task-budget-indicator">' +
        '<span class="task-budget-title">Budget</span>' +
        '<span class="task-chip task-chip-budget"><span class="task-chip-label">source</span>' + escapeHtml(snapshot.source || 'unknown') + '</span>' +
        '<span class="task-chip task-chip-budget"><span class="task-chip-label">state</span>' + escapeHtml(summary || 'available') + '</span>' +
      '</div>';
  }

  function getBudgetSnapshot(state) {
    var data = state && typeof state === 'object' ? state : {};
    var parsedState = parseBudgetState(
      data.routing_budget_state !== undefined ? data.routing_budget_state :
        (data.budget_state !== undefined ? data.budget_state : data.routingBudgetState)
    );
    var wrappedState = unwrapBudgetState(parsedState);
    var source = pickTelemetryValue(
      data.routing_budget_source,
      data.budget_source,
      data.routingBudgetSource,
      wrappedState && wrappedState.source
    );
    var summaryState = wrappedState ? wrappedState.parsed : parsedState;
    if (!source && summaryState === null) return null;
    return { source: source, state: summaryState };
  }

  function parseBudgetState(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
        try {
          return parseBudgetState(JSON.parse(trimmed));
        } catch (e) {
          return trimmed;
        }
      }
      return trimmed;
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) return value;
      var wrapped = unwrapBudgetState(value);
      return wrapped || value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  }

  function unwrapBudgetState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var hasParsed = Object.prototype.hasOwnProperty.call(value, 'parsed');
    var hasWrapperMeta = (
      Object.prototype.hasOwnProperty.call(value, 'source') ||
      Object.prototype.hasOwnProperty.call(value, 'remaining') ||
      Object.prototype.hasOwnProperty.call(value, 'threshold')
    );
    if (!hasParsed || !hasWrapperMeta) return null;
    var parsed = value.parsed === value ? null : parseBudgetState(value.parsed);
    var remaining = parseBudgetLimit(value.remaining);
    var threshold = parseBudgetLimit(value.threshold);
    var normalizedParsed = parsed;
    var hasFlagship = normalizedParsed &&
      typeof normalizedParsed === 'object' &&
      !Array.isArray(normalizedParsed) &&
      normalizedParsed.flagship &&
      typeof normalizedParsed.flagship === 'object';
    if (!hasFlagship && remaining !== null && threshold !== null) {
      normalizedParsed = { flagship: { remaining: remaining, threshold: threshold } };
    }
    return {
      source: normalizeTelemetryValue(value.source),
      parsed: normalizedParsed,
      remaining: remaining,
      threshold: threshold,
    };
  }

  function parseBudgetLimit(value) {
    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function describeBudgetState(state) {
    if (state === null || state === undefined) return '';
    if (typeof state === 'string') return state;
    if (typeof state === 'number' || typeof state === 'boolean') return String(state);
    if (typeof state !== 'object') return '';
    var wrapped = unwrapBudgetState(state);
    if (wrapped) {
      return describeBudgetState(wrapped.parsed);
    }
    var flagship = state.flagship && typeof state.flagship === 'object' ? state.flagship : null;
    if (flagship) {
      var remaining = Number(flagship.remaining);
      var threshold = Number(flagship.threshold);
      if (Number.isFinite(remaining) && Number.isFinite(threshold)) {
        var status = remaining <= threshold ? 'constrained' : 'healthy';
        return status + ' (' + remaining + '/' + threshold + ')';
      }
    }
    var keys = Object.keys(state).slice(0, 3);
    return keys.length > 0 ? 'keys: ' + keys.join(', ') : 'present';
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
