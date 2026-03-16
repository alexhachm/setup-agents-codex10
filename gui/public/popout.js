(function() {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const panel = params.get('panel');

  const PANELS = {
    workers: { title: 'Workers', render: renderWorkers },
    requests: { title: 'Requests', render: renderRequests },
    tasks: { title: 'Tasks', render: renderTasks },
    browser: { title: 'Browser Offload', render: renderBrowserOffload },
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
  var latestState = null;
  var browserTimeline = [];
  var browserTimelineKeys = new Set();

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
          latestState = msg.data || {};
          config.render(msg.data);
        } else if (msg.type === 'browser_offload_event' && panel === 'browser') {
          handleBrowserEvent(msg);
        }
      } catch (e) { console.error('WS parse error:', e); }
    };
  }

  // Also fetch initial state via REST
  fetch('/api/status')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      latestState = data || {};
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

  function trimTo(text, maxLength) {
    var normalized = String(text || '').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return normalized.slice(0, maxLength) + '...';
  }

  function summarizeBrowserResult(result) {
    if (result === null || result === undefined) return '';
    if (typeof result === 'string') return trimTo(result, 800);
    if (typeof result === 'number' || typeof result === 'boolean') return String(result);
    if (typeof result !== 'object') return trimTo(String(result), 800);
    var preferred = [
      result.summary,
      result.final_summary,
      result.finalSummary,
      result.answer,
      result.final,
      result.result,
      result.message,
      result.content,
      result.text
    ].find(function(candidate) {
      return typeof candidate === 'string' && candidate.trim();
    });
    if (preferred) return trimTo(preferred, 800);
    try {
      return trimTo(JSON.stringify(result, null, 2), 800);
    } catch (e) {
      return '[unserializable result]';
    }
  }

  function summarizeBrowserPayload(payload) {
    if (payload === null || payload === undefined) return '';
    if (typeof payload === 'string') return trimTo(payload, 200);
    if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload);
    try {
      return trimTo(JSON.stringify(payload), 200);
    } catch (e) {
      return '[unserializable payload]';
    }
  }

  function statusClassForBrowserSession(status) {
    var normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'completed') return 'badge-completed_task';
    if (normalized === 'failed' || normalized === 'cancelled') return 'badge-resetting';
    if (normalized === 'running' || normalized === 'awaiting_callback') return 'badge-running';
    if (normalized === 'launching' || normalized === 'requested' || normalized === 'queued' || normalized === 'attached') {
      return 'badge-assigned';
    }
    return 'badge-idle';
  }

  function pushBrowserTimelineItem(item) {
    var at = String(item && item.at ? item.at : new Date().toISOString());
    var label = String(item && item.label ? item.label : 'event');
    var detail = String(item && item.detail ? item.detail : '');
    var tone = String(item && item.tone ? item.tone : 'info');
    var key = at + '|' + label + '|' + detail;
    if (browserTimelineKeys.has(key)) return;
    browserTimelineKeys.add(key);
    browserTimeline.push({ at: at, label: label, detail: detail, tone: tone });
    if (browserTimeline.length > 120) {
      var removed = browserTimeline.shift();
      if (removed) {
        browserTimelineKeys.delete(removed.at + '|' + removed.label + '|' + removed.detail);
      }
    }
  }

  function ingestBrowserProgressTimeline(session) {
    if (!session || !Array.isArray(session.progress)) return;
    session.progress.forEach(function(entry) {
      if (!entry || typeof entry !== 'object') return;
      pushBrowserTimelineItem({
        at: entry.at || session.updated_at || new Date().toISOString(),
        label: String(entry.event || 'progress').replace(/_/g, ' '),
        detail: summarizeBrowserPayload(entry.payload),
        tone: 'info',
      });
    });
  }

  function handleBrowserEvent(event) {
    if (!latestState || typeof latestState !== 'object') latestState = {};
    if (!Array.isArray(latestState.browser_offload_sessions)) latestState.browser_offload_sessions = [];
    if (event.session && typeof event.session === 'object' && event.session.session_id) {
      var sessionId = String(event.session.session_id);
      var index = latestState.browser_offload_sessions.findIndex(function(session) {
        return String(session && session.session_id || '') === sessionId;
      });
      if (index >= 0) latestState.browser_offload_sessions[index] = event.session;
      else latestState.browser_offload_sessions.unshift(event.session);
      latestState.browser_offload_sessions = latestState.browser_offload_sessions.slice(0, 50);
      ingestBrowserProgressTimeline(event.session);
    }
    var label = String(event.event || 'event').replace(/_/g, ' ');
    var detail = event.error
      ? trimTo(event.error, 220)
      : (event.progress ? summarizeBrowserPayload(event.progress.payload) : summarizeBrowserPayload(event.result));
    var tone = /failed|rejected|timeout/i.test(label) ? 'error' : (/completed|result/i.test(label) ? 'success' : 'info');
    pushBrowserTimelineItem({
      at: event.timestamp || new Date().toISOString(),
      label: label,
      detail: detail,
      tone: tone,
    });
    config.render(latestState);
  }

  function renderBrowserOffload(data) {
    var el = document.getElementById('popout-panel');
    var state = data && typeof data === 'object' ? data : {};
    var sessions = Array.isArray(state.browser_offload_sessions) ? state.browser_offload_sessions : [];
    sessions.forEach(ingestBrowserProgressTimeline);
    var active = sessions.filter(function(session) {
      var status = String(session && session.status || '').toLowerCase();
      return status !== 'completed' && status !== 'failed' && status !== 'cancelled';
    });
    var ordered = active.length > 0 ? active : sessions;

    var sessionsHtml = ordered.length === 0
      ? '<div style="color:#8b949e;font-size:13px;margin-bottom:12px">No browser offload sessions</div>'
      : ordered.slice(0, 20).map(function(session) {
        var status = String(session.status || 'unknown');
        var badgeClass = statusClassForBrowserSession(status);
        var latestProgress = session.latest_progress && typeof session.latest_progress === 'object'
          ? summarizeBrowserPayload(session.latest_progress.payload)
          : '';
        var resultSummary = summarizeBrowserResult(session.result);
        return '' +
          '<div class="task-item">' +
            '<span style="color:#58a6ff">session ' + escapeHtml(session.session_id || '-') + '</span> ' +
            '<span class="worker-status ' + badgeClass + '">' + escapeHtml(status) + '</span>' +
            '<div class="task-meta">task ' + escapeHtml(String(session.task_id || '-')) +
              (session.request_id ? ' | request ' + escapeHtml(String(session.request_id)) : '') +
            '</div>' +
            (session.channel ? '<div class="task-meta">channel: ' + escapeHtml(session.channel) + '</div>' : '') +
            (session.last_error ? '<div class="task-meta" style="color:#f85149">error: ' + escapeHtml(session.last_error) + '</div>' : '') +
            (latestProgress ? '<div class="task-meta">latest progress: ' + escapeHtml(latestProgress) + '</div>' : '') +
            (resultSummary ? '<pre class="browser-result" style="margin-top:8px;max-height:120px">' + escapeHtml(resultSummary) + '</pre>' : '') +
          '</div>';
      }).join('');

    var timelineHtml = browserTimeline.length === 0
      ? '<div class="browser-timeline-item"><span style="color:#8b949e">No browser events yet.</span></div>'
      : browserTimeline.slice().reverse().slice(0, 60).map(function(item) {
        return '' +
          '<div class="browser-timeline-item ' + escapeHtml(item.tone || '') + '">' +
            '<time>' + escapeHtml(item.at || '') + '</time>' +
            '<strong>' + escapeHtml(item.label || 'event') + '</strong>' +
            '<span>' + escapeHtml(item.detail || '') + '</span>' +
          '</div>';
      }).join('');

    el.innerHTML = '' +
      '<div class="browser-status-head"><span class="browser-status-title">Sessions</span></div>' +
      sessionsHtml +
      '<div class="browser-status-head"><span class="browser-status-title">Live Timeline</span></div>' +
      '<div class="browser-timeline">' + timelineHtml + '</div>';
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
    if (telemetry.usageCacheCreationEphemeral5mInputTokens) chips.push(renderTelemetryChip('cache-create-5m', telemetry.usageCacheCreationEphemeral5mInputTokens));
    if (telemetry.usageCacheCreationEphemeral1hInputTokens) chips.push(renderTelemetryChip('cache-create-1h', telemetry.usageCacheCreationEphemeral1hInputTokens));
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
    var usageCacheCreation = usage && usage.cache_creation && typeof usage.cache_creation === 'object' ? usage.cache_creation : null;
    var usageCacheCreationCamel = usage && usage.cacheCreation && typeof usage.cacheCreation === 'object' ? usage.cacheCreation : null;
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
    var cacheHitRate = computeCacheHitRate(usageInputTokensNumber, usageCachedTokensNumber);
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
        usage && usage.cacheCreationInputTokens,
        usageCacheCreation && usageCacheCreation.cache_creation_tokens,
        usageCacheCreation && usageCacheCreation.cacheCreationTokens,
        usageCacheCreation && usageCacheCreation.cache_creation_input_tokens,
        usageCacheCreation && usageCacheCreation.cacheCreationInputTokens,
        usageCacheCreationCamel && usageCacheCreationCamel.cache_creation_tokens,
        usageCacheCreationCamel && usageCacheCreationCamel.cacheCreationTokens,
        usageCacheCreationCamel && usageCacheCreationCamel.cache_creation_input_tokens,
        usageCacheCreationCamel && usageCacheCreationCamel.cacheCreationInputTokens
      ),
      usageCacheCreationEphemeral5mInputTokens: pickTelemetryValue(
        task && task.usage_cache_creation_ephemeral_5m_input_tokens,
        task && task.usageCacheCreationEphemeral5mInputTokens,
        usage && usage.ephemeral_5m_input_tokens,
        usage && usage.ephemeral5mInputTokens,
        usageCacheCreation && usageCacheCreation.ephemeral_5m_input_tokens,
        usageCacheCreation && usageCacheCreation.ephemeral5mInputTokens,
        usageCacheCreationCamel && usageCacheCreationCamel.ephemeral_5m_input_tokens,
        usageCacheCreationCamel && usageCacheCreationCamel.ephemeral5mInputTokens
      ),
      usageCacheCreationEphemeral1hInputTokens: pickTelemetryValue(
        task && task.usage_cache_creation_ephemeral_1h_input_tokens,
        task && task.usageCacheCreationEphemeral1hInputTokens,
        usage && usage.ephemeral_1h_input_tokens,
        usage && usage.ephemeral1hInputTokens,
        usageCacheCreation && usageCacheCreation.ephemeral_1h_input_tokens,
        usageCacheCreation && usageCacheCreation.ephemeral1hInputTokens,
        usageCacheCreationCamel && usageCacheCreationCamel.ephemeral_1h_input_tokens,
        usageCacheCreationCamel && usageCacheCreationCamel.ephemeral1hInputTokens
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

  function computeCacheHitRate(inputTokens, cachedTokens) {
    if (inputTokens === null || cachedTokens === null || inputTokens <= 0) return '';
    var denominator = cachedTokens > inputTokens
      ? inputTokens + cachedTokens
      : inputTokens;
    if (denominator <= 0) return '';
    var rawRatio = cachedTokens / denominator;
    var boundedRatio = Math.min(1, Math.max(0, rawRatio));
    return formatTelemetryPercentage(boundedRatio);
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
