(function() {
  'use strict';

  const MAX_RECONNECT_DELAY = 30000;

  // --- Cached DOM helper ---
  const _escapeDiv = document.createElement('div');

  // --- Multi-tab state ---
  const tabs = new Map(); // tabId -> tab state object
  let activeTabId = null;
  let tabIdCounter = 0;
  let instancePollTimer = null;

  // The "hub" port is the one the browser loaded from
  const hubPort = parseInt(location.port) || (location.protocol === 'https:' ? 443 : 80);

  function createBrowserOffloadState() {
    return {
      sessions: [],
      timeline: [],
      timelineKeys: new Set(),
      activeTaskId: '',
      activeSessionId: '',
      taskIdInput: '',
      sessionIdInput: '',
      channelInput: '',
      timeoutMsInput: '',
      payloadInput: '',
      bridgeTokenInput: '',
      callbackToken: '',
      callbackEndpoint: '',
      launchUrl: '',
      statusMessage: '',
      statusTone: '',
      resultSummary: '',
      actionPending: false,
    };
  }

  function createTabState(port, name, projectDir) {
    return {
      id: ++tabIdCounter,
      port,
      name,
      projectDir: projectDir || '',
      ws: null,
      connected: false,
      reconnectTimer: null,
      reconnectDelay: 1000,
      // Cached state from WS
      state: { requests: [], workers: [], tasks: [] },
      config: null,
      presets: [],
      setupRunning: false,
      gitPushing: false,
      changes: [],
      changesDomainFilter: '',
      browserOffload: createBrowserOffloadState(),
      batchConfig: null,
      memoryFilter: { iteration: '', run: '' },
    };
  }

  function activeTab() {
    return tabs.get(activeTabId) || null;
  }

  // --- Tab-scoped fetch ---
  function tabFetch(tab, path, opts) {
    const base = `${location.protocol}//${location.hostname}:${tab.port}`;
    return fetch(base + path, opts);
  }

  // --- WebSocket per tab ---
  function connectTab(tab) {
    if (tab.ws && (tab.ws.readyState === WebSocket.OPEN || tab.ws.readyState === WebSocket.CONNECTING)) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Capture the socket in a local variable so stale handlers can detect they've been superseded.
    const ws = new WebSocket(`${protocol}//${location.hostname}:${tab.port}`);
    tab.ws = ws;

    ws.onopen = () => {
      if (tab.ws !== ws) return; // stale — a newer connection replaced this one
      tab.connected = true;
      tab.reconnectDelay = 1000;
      if (tab.reconnectTimer) { clearTimeout(tab.reconnectTimer); tab.reconnectTimer = null; }
      renderTabBar();
      if (tab.id === activeTabId) updateConnectionIndicator(true);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error (port ' + tab.port + '):', err);
    };

    ws.onclose = () => {
      if (tab.ws !== ws) return; // stale — a newer connection replaced this one; don't schedule another reconnect
      tab.connected = false;
      renderTabBar();
      if (tab.id === activeTabId) updateConnectionIndicator(false);
      tab.reconnectTimer = setTimeout(() => connectTab(tab), tab.reconnectDelay);
      tab.reconnectDelay = Math.min(tab.reconnectDelay * 2, MAX_RECONNECT_DELAY);
    };

    ws.onmessage = (event) => {
      if (tab.ws !== ws) return; // stale
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'init' || msg.type === 'state') {
          tab.state = mergeBudgetSnapshot(tab.state, msg.data);
          if (tab.id === activeTabId) renderState(tab.state);
        } else if (msg.type === 'request_created') {
          if (tab.id === activeTabId) fetchTabStatus(tab);
        } else if (msg.type === 'setup_log') {
          if (tab.id === activeTabId) appendSetupLog(msg.line);
        } else if (msg.type === 'setup_complete') {
          tab.setupRunning = false;
          if (tab.id === activeTabId) onSetupComplete(msg.code);
        } else if (msg.type === 'change_created') {
          tab.changes.unshift(msg.change);
          if (tab.id === activeTabId) renderChanges(tab);
        } else if (msg.type === 'change_updated') {
          const idx = tab.changes.findIndex(c => c.id === msg.change.id);
          if (idx >= 0) tab.changes[idx] = msg.change;
          else tab.changes.unshift(msg.change);
          if (tab.id === activeTabId) renderChanges(tab);
        } else if (msg.type === 'git_push_log') {
          if (tab.id === activeTabId) appendGitLog(msg.line);
        } else if (msg.type === 'git_push_complete') {
          tab.gitPushing = false;
          if (tab.id === activeTabId) onGitPushComplete(msg.code);
        } else if (msg.type === 'browser_offload_event') {
          handleBrowserOffloadEvent(tab, msg);
        } else if (msg.type === 'batch_config_updated') {
          if (tab.id === activeTabId) fetchBatchConfig(tab);
        }
      } catch (e) { console.error('WS parse error:', e); }
    };
  }

  function disconnectTab(tab) {
    if (tab.reconnectTimer) { clearTimeout(tab.reconnectTimer); tab.reconnectTimer = null; }
    if (tab.ws) { tab.ws.onclose = null; tab.ws.close(); tab.ws = null; }
    tab.connected = false;
  }

  function updateConnectionIndicator(connected) {
    const dot = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    dot.setAttribute('aria-label', connected ? 'Connected' : 'Disconnected');
    text.textContent = connected ? 'Connected' : 'Disconnected';
  }

  // --- Tab bar rendering ---
  function renderTabBar() {
    const list = document.getElementById('tab-list');
    const frag = document.createDocumentFragment();
    for (const [id, tab] of tabs) {
      const el = document.createElement('div');
      el.className = 'tab-item' + (id === activeTabId ? ' active' : '');
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', id === activeTabId ? 'true' : 'false');
      el.innerHTML =
        `<span class="tab-dot ${tab.connected ? 'connected' : 'disconnected'}" aria-label="${tab.connected ? 'Connected' : 'Disconnected'}"></span>` +
        `<span class="tab-name">${escapeHtml(tab.name)}</span>` +
        `<button class="tab-close" title="Close tab" aria-label="Close ${escapeHtml(tab.name)} tab">&times;</button>`;
      el.querySelector('.tab-name').addEventListener('click', () => switchTab(id));
      el.querySelector('.tab-dot').addEventListener('click', () => switchTab(id));
      el.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });
      frag.appendChild(el);
    }
    list.innerHTML = '';
    list.appendChild(frag);
  }

  function switchTab(tabId) {
    if (!tabs.has(tabId)) return;
    activeTabId = tabId;
    const tab = tabs.get(tabId);
    renderTabBar();
    updateConnectionIndicator(tab.connected);
    // Re-render all panels from cached state
    renderState(tab.state);
    fetchTabConfig(tab);
    fetchTabPresets(tab);
    fetchTabStatus(tab);
    fetchTabChanges(tab);
    fetchBatchConfig(tab);
  }

  function addTab(port, name, projectDir) {
    // Check if tab already exists for this port
    for (const [id, tab] of tabs) {
      if (tab.port === port) {
        return id;
      }
    }
    const tab = createTabState(port, name, projectDir);
    tabs.set(tab.id, tab);
    connectTab(tab);
    renderTabBar();
    return tab.id;
  }

  function closeTab(tabId) {
    const tab = tabs.get(tabId);
    if (!tab) return;
    disconnectTab(tab);
    tabs.delete(tabId);
    if (activeTabId === tabId) {
      // Switch to first available tab
      const first = tabs.keys().next();
      if (!first.done) {
        switchTab(first.value);
      } else {
        activeTabId = null;
        renderTabBar();
        clearPanels();
      }
    } else {
      renderTabBar();
    }
  }

  function clearPanels() {
    renderState({ requests: [], workers: [], tasks: [] });
    document.getElementById('log-list').innerHTML = '';
    document.getElementById('batch-metrics').innerHTML = '';
    document.getElementById('batch-list').innerHTML = '';
    document.getElementById('browser-workflow-state').textContent = 'idle';
    document.getElementById('browser-workflow-state').className = 'browser-state-chip browser-state-idle';
    document.getElementById('browser-session-meta').textContent = 'No active browser offload session.';
    document.getElementById('browser-auth-meta').textContent = 'Launch first to obtain bridge credentials.';
    document.getElementById('browser-result').textContent = 'No result yet.';
    document.getElementById('browser-timeline').innerHTML = '';
    document.getElementById('browser-status-msg').textContent = '';
    document.getElementById('memory-snapshots-list').innerHTML = '';
  }

  // --- Instance polling ---
  function pollInstances() {
    const hubBase = `${location.protocol}//${location.hostname}:${hubPort}`;
    fetch(hubBase + '/api/instances')
      .then(r => r.json())
      .then(instances => {
        const activePorts = new Set();
        for (const inst of instances) {
          activePorts.add(inst.port);
          addTab(inst.port, inst.name, inst.projectDir);
        }
        // Remove tabs for dead instances (except if manually added)
        for (const [id, tab] of tabs) {
          if (!activePorts.has(tab.port) && !tab.connected) {
            tabs.delete(id);
            if (activeTabId === id) {
              const first = tabs.keys().next();
              activeTabId = first.done ? null : first.value;
            }
          }
        }
        renderTabBar();
        // Auto-switch to first tab if none active
        if (!activeTabId && tabs.size > 0) {
          switchTab(tabs.keys().next().value);
        }
      })
      .catch(err => console.error('Instance poll failed:', err));
  }

  // --- Render functions (unchanged logic, operate on active tab data) ---

  function renderState(data) {
    const state = data && typeof data === 'object' ? data : {};
    renderWorkers(Array.isArray(state.workers) ? state.workers : []);
    renderRequests(Array.isArray(state.requests) ? state.requests : []);
    renderTasks(Array.isArray(state.tasks) ? state.tasks : [], state);
    const tab = activeTab();
    if (tab) renderBrowserOffload(tab, state);
    if (tab) renderBatchPanel(tab, state);
    if (tab) renderMemoryPanel(tab, state);
  }

  function renderWorkers(workers) {
    const el = document.getElementById('workers-list');
    if (workers.length === 0) {
      el.innerHTML = '<div style="color:#8b949e;font-size:13px">No workers registered</div>';
      return;
    }
    el.innerHTML = workers.map(w => `
      <div class="worker-card">
        <div class="worker-name">Worker ${w.id}</div>
        <span class="worker-status badge-${w.status}">${w.status}</span>
        ${w.domain ? `<div style="font-size:11px;color:#8b949e;margin-top:4px">${escapeHtml(w.domain)}</div>` : ''}
        ${w.current_task_id ? `<div style="font-size:11px;color:#58a6ff;margin-top:2px">Task #${w.current_task_id}</div>` : ''}
      </div>
    `).join('');
  }

  function renderRequests(requests) {
    const el = document.getElementById('requests-list');
    if (requests.length === 0) {
      el.innerHTML = '<div style="color:#8b949e;font-size:13px">No requests</div>';
      return;
    }
    el.innerHTML = requests.slice(0, 20).map(r => `
      <div class="request-item">
        <span class="req-id">${r.id}</span>
        <span class="worker-status badge-${r.status}">${r.status}</span>
        ${r.tier ? `<span style="font-size:11px;color:#d29922"> T${r.tier}</span>` : ''}
        <div class="req-desc">${escapeHtml(r.description).slice(0, 100)}</div>
      </div>
    `).join('');
  }

  function renderTasks(tasks, state) {
    const el = document.getElementById('tasks-list');
    const active = tasks.filter(t => t && t.status !== 'completed');
    const budgetIndicator = renderBudgetIndicator(state);
    if (active.length === 0) {
      el.innerHTML = `${budgetIndicator}<div style="color:#8b949e;font-size:13px">No active tasks</div>`;
      return;
    }
    el.innerHTML = budgetIndicator + active.slice(0, 30).map(t => `
      <div class="task-item">
        <span style="color:#58a6ff">#${t.id}</span>
        <span class="worker-status badge-${t.status}">${t.status}</span>
        <div class="task-subject">${escapeHtml(t.subject)}</div>
        <div class="task-meta">
          ${t.domain ? `[${escapeHtml(t.domain)}]` : ''} T${t.tier}
          ${t.assigned_to ? `&rarr; worker-${escapeHtml(String(t.assigned_to))}` : ''}
          ${t.pr_url ? renderPrLink(t.pr_url) : ''}
        </div>
        ${renderTaskTelemetryChips(t)}
      </div>
    `).join('');
  }

  function renderTaskTelemetryChips(task) {
    const telemetry = readTaskTelemetry(task);
    const chips = [];
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
    return `<div class="task-chip-row">${chips.join('')}</div>`;
  }

  function renderTelemetryChip(label, value) {
    return `<span class="task-chip"><span class="task-chip-label">${escapeHtml(label)}</span>${escapeHtml(value)}</span>`;
  }

  function parseUsagePayloadFromTask(task) {
    if (!task || typeof task !== 'object') return null;
    const objectCandidates = [task.usage_payload, task.usagePayload];
    for (const candidate of objectCandidates) {
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return candidate;
      }
    }
    const jsonCandidate = task.usage_payload_json !== undefined
      ? task.usage_payload_json
      : task.usagePayloadJson;
    if (typeof jsonCandidate !== 'string') return null;
    const trimmed = jsonCandidate.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function readTaskTelemetry(task) {
    const routing = task && task.routing && typeof task.routing === 'object' ? task.routing : null;
    const usagePayload = parseUsagePayloadFromTask(task);
    const usage = task && task.usage && typeof task.usage === 'object' ? task.usage : usagePayload;
    const usageCacheCreation = usage && usage.cache_creation && typeof usage.cache_creation === 'object' ? usage.cache_creation : null;
    const usageCacheCreationCamel = usage && usage.cacheCreation && typeof usage.cacheCreation === 'object' ? usage.cacheCreation : null;
    const usageInputTokensCandidates = [
      task && task.usage_input_tokens,
      task && task.usageInputTokens,
      usage && usage.input_tokens,
      usage && usage.inputTokens,
    ];
    const usageCachedTokensCandidates = [
      task && task.usage_cached_tokens,
      task && task.usageCachedTokens,
      usage && usage.cached_tokens,
      usage && usage.cachedTokens,
    ];
    const usageInputTokens = pickTelemetryValue(...usageInputTokensCandidates);
    const usageCachedTokens = pickTelemetryValue(...usageCachedTokensCandidates);
    const usageInputTokensNumber = pickFiniteTelemetryNumber(...usageInputTokensCandidates);
    const usageCachedTokensNumber = pickFiniteTelemetryNumber(...usageCachedTokensCandidates);
    const cacheHitRate = computeCacheHitRate(usageInputTokensNumber, usageCachedTokensNumber);
    return {
      routingClass: pickTelemetryValue(task && task.routing_class, task && task.routingClass, routing && routing.class, routing && routing.routing_class),
      routedModel: pickTelemetryValue(task && task.routed_model, task && task.routedModel, task && task.routing_model, task && task.routingModel, routing && routing.model),
      modelSource: pickTelemetryValue(task && task.model_source, task && task.modelSource, task && task.routing_model_source, task && task.routingModelSource, routing && routing.model_source),
      reasoningEffort: pickTelemetryValue(task && task.reasoning_effort, task && task.reasoningEffort, task && task.routing_reasoning_effort, task && task.routingReasoningEffort, routing && routing.reasoning_effort),
      usageModel: pickTelemetryValue(task && task.usage_model, task && task.usageModel, usage && usage.model),
      usageInputTokens,
      usageOutputTokens: pickTelemetryValue(task && task.usage_output_tokens, task && task.usageOutputTokens, usage && usage.output_tokens, usage && usage.outputTokens),
      usageCachedTokens,
      cacheHitRate,
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

  function pickTelemetryValue(...values) {
    for (const candidate of values) {
      const normalized = normalizeTelemetryValue(candidate);
      if (normalized) return normalized;
    }
    return '';
  }

  function pickFiniteTelemetryNumber(...values) {
    for (const candidate of values) {
      const normalized = normalizeTelemetryNumber(candidate);
      if (normalized !== null) return normalized;
    }
    return null;
  }

  function normalizeTelemetryNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatTelemetryPercentage(value) {
    if (!Number.isFinite(value)) return '';
    return `${(value * 100).toFixed(1)}%`;
  }

  function computeCacheHitRate(inputTokens, cachedTokens) {
    if (inputTokens === null || cachedTokens === null || inputTokens <= 0) return '';
    const denominator = cachedTokens > inputTokens
      ? inputTokens + cachedTokens
      : inputTokens;
    if (denominator <= 0) return '';
    const rawRatio = cachedTokens / denominator;
    const boundedRatio = Math.min(1, Math.max(0, rawRatio));
    return formatTelemetryPercentage(boundedRatio);
  }

  function normalizeTelemetryValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  function renderBudgetIndicator(state) {
    const snapshot = getBudgetSnapshot(state);
    if (!snapshot) return '';
    const summary = describeBudgetState(snapshot.state);
    return `
      <div class="task-budget-indicator">
        <span class="task-budget-title">Budget</span>
        <span class="task-chip task-chip-budget"><span class="task-chip-label">source</span>${escapeHtml(snapshot.source || 'unknown')}</span>
        <span class="task-chip task-chip-budget"><span class="task-chip-label">state</span>${escapeHtml(summary || 'available')}</span>
      </div>
    `;
  }

  function getBudgetSnapshot(state) {
    const data = state && typeof state === 'object' ? state : {};
    const parsedState = parseBudgetState(
      data.routing_budget_state !== undefined ? data.routing_budget_state :
        (data.budget_state !== undefined ? data.budget_state : data.routingBudgetState)
    );
    const wrappedState = unwrapBudgetState(parsedState);
    const source = pickTelemetryValue(
      data.routing_budget_source,
      data.budget_source,
      data.routingBudgetSource,
      wrappedState && wrappedState.source
    );
    const summaryState = wrappedState ? wrappedState.parsed : parsedState;
    if (!source && summaryState === null) return null;
    return { source, state: summaryState };
  }

  function parseBudgetState(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return parseBudgetState(JSON.parse(trimmed));
        } catch {
          return trimmed;
        }
      }
      return trimmed;
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) return value;
      const wrapped = unwrapBudgetState(value);
      return wrapped || value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  }

  function unwrapBudgetState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const hasParsed = Object.prototype.hasOwnProperty.call(value, 'parsed');
    const hasWrapperMeta = (
      Object.prototype.hasOwnProperty.call(value, 'source') ||
      Object.prototype.hasOwnProperty.call(value, 'remaining') ||
      Object.prototype.hasOwnProperty.call(value, 'threshold')
    );
    if (!hasParsed || !hasWrapperMeta) return null;
    const parsed = value.parsed === value ? null : parseBudgetState(value.parsed);
    const remaining = parseBudgetLimit(value.remaining);
    const threshold = parseBudgetLimit(value.threshold);
    let normalizedParsed = parsed;
    const hasFlagship = normalizedParsed && typeof normalizedParsed === 'object' && !Array.isArray(normalizedParsed) &&
      normalizedParsed.flagship && typeof normalizedParsed.flagship === 'object';
    if (!hasFlagship && remaining !== null && threshold !== null) {
      normalizedParsed = { flagship: { remaining, threshold } };
    }
    return {
      source: normalizeTelemetryValue(value.source),
      parsed: normalizedParsed,
      remaining,
      threshold,
    };
  }

  function parseBudgetLimit(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function describeBudgetState(state) {
    if (state === null || state === undefined) return '';
    if (typeof state === 'string') return state;
    if (typeof state === 'number' || typeof state === 'boolean') return String(state);
    if (typeof state !== 'object') return '';
    const wrapped = unwrapBudgetState(state);
    if (wrapped) {
      return describeBudgetState(wrapped.parsed);
    }
    const flagship = state.flagship && typeof state.flagship === 'object' ? state.flagship : null;
    if (flagship) {
      const remaining = Number(flagship.remaining);
      const threshold = Number(flagship.threshold);
      if (Number.isFinite(remaining) && Number.isFinite(threshold)) {
        const status = remaining <= threshold ? 'constrained' : 'healthy';
        return `${status} (${remaining}/${threshold})`;
      }
    }
    const keys = Object.keys(state).slice(0, 3);
    return keys.length > 0 ? `keys: ${keys.join(', ')}` : 'present';
  }

  function renderLog(logs) {
    const el = document.getElementById('log-list');
    el.innerHTML = logs.slice().reverse().slice(0, 50).map(l => `
      <div class="log-entry">
        <span class="log-time">${escapeHtml(l.created_at)}</span>
        <span class="log-actor">${escapeHtml(l.actor)}</span>
        <span class="log-action">${escapeHtml(l.action)}</span>
        ${l.details ? `<span style="color:#484f58">${escapeHtml(l.details.substring(0, 80))}</span>` : ''}
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    _escapeDiv.textContent = str;
    return _escapeDiv.innerHTML;
  }

  function safeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch {}
    return null;
  }

  function renderPrLink(prUrl) {
    const safe = safeUrl(prUrl);
    if (!safe) return '';
    return `<a href="${safe}" target="_blank" rel="noopener" style="color:#58a6ff">PR</a>`;
  }

  // --- Tab-scoped data fetchers ---

  function fetchTabStatus(tab) {
    tabFetch(tab, '/api/status')
      .then(r => r.json())
      .then(data => {
        tab.state = mergeBudgetSnapshot(tab.state, data);
        if (tab.id === activeTabId) {
          renderState(tab.state);
          renderLog(Array.isArray(tab.state.logs) ? tab.state.logs : []);
        }
      })
      .catch(err => console.error('Status fetch failed:', err));
  }

  function mergeBudgetSnapshot(previousState, nextState) {
    const previous = previousState && typeof previousState === 'object' ? previousState : {};
    const next = nextState && typeof nextState === 'object' ? nextState : {};
    const merged = { ...next };
    const budgetKeys = ['routing_budget_state', 'routing_budget_source', 'budget_state', 'budget_source', 'routingBudgetState', 'routingBudgetSource'];
    for (const key of budgetKeys) {
      if (!Object.prototype.hasOwnProperty.call(merged, key) && Object.prototype.hasOwnProperty.call(previous, key)) {
        merged[key] = previous[key];
      }
    }
    return merged;
  }

  function ensureBrowserOffloadState(tab) {
    if (!tab) return createBrowserOffloadState();
    if (!tab.browserOffload || typeof tab.browserOffload !== 'object') {
      tab.browserOffload = createBrowserOffloadState();
    }
    if (!(tab.browserOffload.timelineKeys instanceof Set)) {
      const keys = Array.isArray(tab.browserOffload.timelineKeys)
        ? tab.browserOffload.timelineKeys
        : [];
      tab.browserOffload.timelineKeys = new Set(keys);
    }
    if (!Array.isArray(tab.browserOffload.timeline)) tab.browserOffload.timeline = [];
    if (!Array.isArray(tab.browserOffload.sessions)) tab.browserOffload.sessions = [];
    return tab.browserOffload;
  }

  function parsePositiveIntegerInput(value) {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function normalizeBrowserStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return normalized || 'idle';
  }

  function browserStatusChipClass(status) {
    const normalized = normalizeBrowserStatus(status);
    if (normalized === 'completed') return 'browser-state-chip browser-state-completed';
    if (normalized === 'failed' || normalized === 'cancelled') return 'browser-state-chip browser-state-failed';
    if (normalized === 'launching' || normalized === 'requested' || normalized === 'queued' || normalized === 'attached') {
      return 'browser-state-chip browser-state-pending';
    }
    if (normalized === 'running' || normalized === 'awaiting_callback') return 'browser-state-chip browser-state-running';
    return 'browser-state-chip browser-state-idle';
  }

  function trimTo(text, maxLength = 800) {
    const normalized = String(text || '').trim();
    if (!normalized) return '';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength)}...`;
  }

  function summarizeBrowserResult(result) {
    if (result === null || result === undefined) return '';
    if (typeof result === 'string') return trimTo(result, 1400);
    if (typeof result === 'number' || typeof result === 'boolean') return String(result);
    if (typeof result !== 'object') return trimTo(String(result), 1400);
    const preferred = [
      result.summary,
      result.final_summary,
      result.finalSummary,
      result.answer,
      result.final,
      result.result,
      result.message,
      result.content,
      result.text,
    ].find((candidate) => typeof candidate === 'string' && candidate.trim());
    if (preferred) return trimTo(preferred, 1400);
    try {
      return trimTo(JSON.stringify(result, null, 2), 1400);
    } catch {
      return '[unserializable result]';
    }
  }

  function summarizeBrowserPayload(payload) {
    if (payload === null || payload === undefined) return '';
    if (typeof payload === 'string') return trimTo(payload, 220);
    if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload);
    try {
      return trimTo(JSON.stringify(payload), 220);
    } catch {
      return '[unserializable payload]';
    }
  }

  function setBrowserStatusMessage(offload, message, tone = '') {
    offload.statusMessage = String(message || '').trim();
    offload.statusTone = tone;
  }

  function pushBrowserTimeline(offload, entry) {
    const at = entry && entry.at ? String(entry.at) : new Date().toISOString();
    const label = entry && entry.label ? String(entry.label) : 'event';
    const detail = entry && entry.detail ? String(entry.detail) : '';
    const tone = entry && entry.tone ? String(entry.tone) : 'info';
    const key = `${at}|${label}|${detail}`;
    if (offload.timelineKeys.has(key)) return;
    offload.timelineKeys.add(key);
    offload.timeline.push({ at, label, detail, tone });
    if (offload.timeline.length > 120) {
      const removed = offload.timeline.shift();
      if (removed) {
        const removedKey = `${removed.at}|${removed.label}|${removed.detail}`;
        offload.timelineKeys.delete(removedKey);
      }
    }
  }

  function upsertBrowserSession(offload, session) {
    if (!session || typeof session !== 'object') return;
    const sessionId = String(session.session_id || '').trim();
    if (!sessionId) return;
    const index = offload.sessions.findIndex((item) => String(item.session_id || '').trim() === sessionId);
    if (index >= 0) offload.sessions[index] = session;
    else offload.sessions.unshift(session);
    offload.sessions = offload.sessions.slice(0, 30);
  }

  function resolveTrackedSession(offload) {
    const targetSessionId = String(offload.activeSessionId || offload.sessionIdInput || '').trim();
    if (targetSessionId) {
      const bySessionId = offload.sessions.find((session) => String(session.session_id || '').trim() === targetSessionId);
      if (bySessionId) return bySessionId;
    }
    const targetTaskId = parsePositiveIntegerInput(offload.activeTaskId || offload.taskIdInput);
    if (targetTaskId) {
      const byTaskId = offload.sessions.find((session) => parsePositiveIntegerInput(session.task_id) === targetTaskId);
      if (byTaskId) return byTaskId;
    }
    return offload.sessions[0] || null;
  }

  function ingestSessionProgress(offload, session) {
    if (!session || !Array.isArray(session.progress)) return;
    session.progress.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const label = String(entry.event || 'progress').replace(/_/g, ' ');
      const detail = summarizeBrowserPayload(entry.payload);
      pushBrowserTimeline(offload, {
        at: entry.at || session.updated_at || new Date().toISOString(),
        label,
        detail,
        tone: 'info',
      });
    });
  }

  function trackBrowserEvent(tab, event) {
    const offload = ensureBrowserOffloadState(tab);
    if (!event || typeof event !== 'object') return;
    if (event.session && typeof event.session === 'object') {
      upsertBrowserSession(offload, event.session);
      ingestSessionProgress(offload, event.session);
    }

    const eventTaskId = parsePositiveIntegerInput(event.task_id);
    const eventSessionId = String(event.session_id || '').trim();
    const trackedTaskId = parsePositiveIntegerInput(offload.activeTaskId || offload.taskIdInput);
    const trackedSessionId = String(offload.activeSessionId || offload.sessionIdInput || '').trim();
    const isRelated = (!trackedTaskId && !trackedSessionId)
      || (eventTaskId && trackedTaskId && eventTaskId === trackedTaskId)
      || (eventSessionId && trackedSessionId && eventSessionId === trackedSessionId);

    if (isRelated) {
      if (eventTaskId) offload.activeTaskId = String(eventTaskId);
      if (eventSessionId) offload.activeSessionId = eventSessionId;
      if (eventSessionId && !offload.sessionIdInput) offload.sessionIdInput = eventSessionId;
      if (eventTaskId && !offload.taskIdInput) offload.taskIdInput = String(eventTaskId);

      const label = String(event.event || 'event').replace(/_/g, ' ');
      const detail = event.error
        ? trimTo(event.error, 220)
        : (event.progress ? summarizeBrowserPayload(event.progress.payload) : summarizeBrowserPayload(event.result));
      let tone = 'info';
      if (/failed|rejected|timeout/i.test(label)) tone = 'error';
      if (/completed|complete|result/i.test(label)) tone = 'success';
      pushBrowserTimeline(offload, {
        at: event.timestamp || new Date().toISOString(),
        label,
        detail,
        tone,
      });

      if (event.error) setBrowserStatusMessage(offload, trimTo(event.error, 200), 'error');
      if (event.session && event.session.result !== null && event.session.result !== undefined) {
        offload.resultSummary = summarizeBrowserResult(event.session.result);
      } else if (event.result !== null && event.result !== undefined) {
        offload.resultSummary = summarizeBrowserResult(event.result);
      }
    }

    if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
  }

  function handleBrowserOffloadEvent(tab, event) {
    trackBrowserEvent(tab, event);
  }

  function updateInputValue(input, value) {
    if (!input) return;
    if (document.activeElement === input) return;
    const next = value === null || value === undefined ? '' : String(value);
    if (input.value !== next) input.value = next;
  }

  function updateBrowserUiFromInputs(tab) {
    const offload = ensureBrowserOffloadState(tab);
    offload.taskIdInput = String(document.getElementById('browser-task-id').value || '').trim();
    offload.sessionIdInput = String(document.getElementById('browser-session-id').value || '').trim();
    offload.channelInput = String(document.getElementById('browser-channel').value || '').trim();
    offload.timeoutMsInput = String(document.getElementById('browser-timeout-ms').value || '').trim();
    offload.payloadInput = String(document.getElementById('browser-payload').value || '');
    offload.bridgeTokenInput = String(document.getElementById('browser-bridge-token').value || '').trim();
    if (!offload.activeTaskId && offload.taskIdInput) offload.activeTaskId = offload.taskIdInput;
    if (!offload.activeSessionId && offload.sessionIdInput) offload.activeSessionId = offload.sessionIdInput;
    return offload;
  }

  function renderBrowserOffload(tab, state) {
    const offload = ensureBrowserOffloadState(tab);
    const browserState = state && typeof state === 'object' ? state : {};
    const sessions = Array.isArray(browserState.browser_offload_sessions) ? browserState.browser_offload_sessions : [];
    if (sessions.length > 0) {
      sessions.forEach((session) => upsertBrowserSession(offload, session));
    } else if (!Array.isArray(offload.sessions)) {
      offload.sessions = [];
    }
    const trackedSession = resolveTrackedSession(offload);
    const trackedTaskId = parsePositiveIntegerInput(offload.activeTaskId || offload.taskIdInput);
    const tasks = Array.isArray(browserState.tasks) ? browserState.tasks : [];
    const trackedTask = trackedTaskId
      ? tasks.find((task) => parsePositiveIntegerInput(task && task.id) === trackedTaskId) || null
      : null;

    if (trackedSession) {
      offload.activeSessionId = String(trackedSession.session_id || offload.activeSessionId || '').trim();
      offload.activeTaskId = String(trackedSession.task_id || offload.activeTaskId || '').trim();
      if (!offload.sessionIdInput) offload.sessionIdInput = offload.activeSessionId;
      if (!offload.taskIdInput) offload.taskIdInput = offload.activeTaskId;
      ingestSessionProgress(offload, trackedSession);
      if (trackedSession.result !== null && trackedSession.result !== undefined) {
        offload.resultSummary = summarizeBrowserResult(trackedSession.result);
      }
    }

    updateInputValue(document.getElementById('browser-task-id'), offload.taskIdInput);
    updateInputValue(document.getElementById('browser-session-id'), offload.sessionIdInput);
    updateInputValue(document.getElementById('browser-channel'), offload.channelInput);
    updateInputValue(document.getElementById('browser-timeout-ms'), offload.timeoutMsInput);
    updateInputValue(document.getElementById('browser-payload'), offload.payloadInput);
    updateInputValue(document.getElementById('browser-bridge-token'), offload.bridgeTokenInput);

    const workflowStateEl = document.getElementById('browser-workflow-state');
    const status = normalizeBrowserStatus(
      trackedSession && trackedSession.status
        ? trackedSession.status
        : (trackedTask && trackedTask.browser_offload_status ? trackedTask.browser_offload_status : 'idle')
    );
    workflowStateEl.textContent = status;
    workflowStateEl.className = browserStatusChipClass(status);

    const sessionMeta = document.getElementById('browser-session-meta');
    const sessionLines = [];
    if (trackedSession) {
      sessionLines.push(`session_id: ${trackedSession.session_id || '-'}`);
      sessionLines.push(`task_id: ${trackedSession.task_id || '-'}`);
      sessionLines.push(`status: ${trackedSession.status || '-'}`);
      sessionLines.push(`channel: ${trackedSession.channel || '-'}`);
      sessionLines.push(`updated: ${trackedSession.updated_at || trackedSession.last_callback_at || '-'}`);
      sessionLines.push(`progress callbacks: ${trackedSession.progress_count || 0}`);
      if (trackedSession.last_error) sessionLines.push(`error: ${trackedSession.last_error}`);
    } else if (trackedTask) {
      sessionLines.push(`task_id: ${trackedTask.id}`);
      sessionLines.push(`status: ${trackedTask.browser_offload_status || 'not_requested'}`);
      if (trackedTask.browser_session_id) sessionLines.push(`session_id: ${trackedTask.browser_session_id}`);
      if (trackedTask.browser_offload_error) sessionLines.push(`error: ${trackedTask.browser_offload_error}`);
    } else {
      sessionLines.push('No active browser offload session.');
    }
    sessionMeta.textContent = sessionLines.join('\n');

    const authMeta = document.getElementById('browser-auth-meta');
    const launchUrl = offload.launchUrl || (trackedSession && trackedSession.bridge && trackedSession.bridge.launch_url) || '';
    const authLines = [
      `bridge token: ${offload.bridgeTokenInput ? 'available' : 'missing'}`,
      `callback token: ${offload.callbackToken ? 'available' : 'missing'}`,
      `launch url: ${launchUrl || 'not available'}`,
    ];
    authMeta.textContent = authLines.join('\n');

    const resultEl = document.getElementById('browser-result');
    resultEl.textContent = offload.resultSummary || 'No result yet.';

    const timelineEl = document.getElementById('browser-timeline');
    if (offload.timeline.length === 0) {
      timelineEl.innerHTML = '<div class="browser-timeline-item"><span style="color:#8b949e">No callbacks yet.</span></div>';
    } else {
      timelineEl.innerHTML = offload.timeline.slice().reverse().slice(0, 50).map((item) => `
        <div class="browser-timeline-item ${escapeHtml(item.tone || '')}">
          <time>${escapeHtml(item.at || '')}</time>
          <strong>${escapeHtml(item.label || 'event')}</strong>
          <span>${escapeHtml(item.detail || '')}</span>
        </div>
      `).join('');
    }

    const msgEl = document.getElementById('browser-status-msg');
    msgEl.textContent = offload.statusMessage || '';
    msgEl.className = `browser-status-msg${offload.statusTone ? ` ${offload.statusTone}` : ''}`;

    const hasTask = parsePositiveIntegerInput(offload.taskIdInput || offload.activeTaskId);
    const hasSession = String(offload.sessionIdInput || offload.activeSessionId || '').trim();
    document.getElementById('browser-start-btn').disabled = offload.actionPending || !hasTask;
    document.getElementById('browser-retry-btn').disabled = offload.actionPending || !hasTask;
    document.getElementById('browser-refresh-btn').disabled = offload.actionPending || (!hasTask && !hasSession);
    document.getElementById('browser-attach-btn').disabled = offload.actionPending || !hasSession || !offload.bridgeTokenInput;
    document.getElementById('browser-cancel-btn').disabled = offload.actionPending || (!hasTask && !hasSession);
    document.getElementById('browser-open-launch-btn').disabled = !safeUrl(launchUrl);
  }

  async function tabFetchJson(tab, path, opts) {
    const response = await tabFetch(tab, path, opts);
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok || (data && data.ok === false)) {
      const message = (data && data.error) ? data.error : `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data || {};
  }

  async function refreshBrowserOffloadStatus(tab, { silent = false } = {}) {
    const offload = ensureBrowserOffloadState(tab);
    const taskId = parsePositiveIntegerInput(offload.taskIdInput || offload.activeTaskId);
    const sessionId = String(offload.sessionIdInput || offload.activeSessionId || '').trim();
    if (!taskId && !sessionId) {
      if (!silent) setBrowserStatusMessage(offload, 'Enter task_id or session_id first.', 'error');
      if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
      return null;
    }

    const params = new URLSearchParams();
    if (sessionId) params.set('session_id', sessionId);
    if (taskId) params.set('task_id', String(taskId));
    const data = await tabFetchJson(tab, `/api/browser/status?${params.toString()}`);
    if (data.session && typeof data.session === 'object') {
      upsertBrowserSession(offload, data.session);
      offload.activeSessionId = String(data.session.session_id || offload.activeSessionId || '').trim();
      offload.activeTaskId = String(data.session.task_id || offload.activeTaskId || '').trim();
      if (!offload.sessionIdInput) offload.sessionIdInput = offload.activeSessionId;
      if (!offload.taskIdInput) offload.taskIdInput = offload.activeTaskId;
      ingestSessionProgress(offload, data.session);
      if (data.session.result !== null && data.session.result !== undefined) {
        offload.resultSummary = summarizeBrowserResult(data.session.result);
      }
    } else if (taskId && !offload.activeTaskId) {
      offload.activeTaskId = String(taskId);
    }
    if (!silent) setBrowserStatusMessage(offload, 'Browser status refreshed.', 'info');
    if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
    return data;
  }

  async function startBrowserOffloadWorkflow(tab, { retry = false } = {}) {
    const offload = updateBrowserUiFromInputs(tab);
    const taskId = parsePositiveIntegerInput(offload.taskIdInput);
    if (!taskId) {
      setBrowserStatusMessage(offload, 'task_id must be a positive integer.', 'error');
      if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
      return;
    }
    offload.actionPending = true;
    setBrowserStatusMessage(offload, retry ? 'Retrying browser workflow...' : 'Starting browser workflow...', 'info');
    if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});

    const payload = { task_id: taskId };
    if (offload.payloadInput.trim()) payload.payload = offload.payloadInput;
    const timeoutMs = parsePositiveIntegerInput(offload.timeoutMsInput);
    if (timeoutMs) payload.timeout_ms = timeoutMs;
    if (offload.channelInput) payload.channel = offload.channelInput;

    try {
      const data = await tabFetchJson(tab, '/api/browser/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const session = data.session && typeof data.session === 'object' ? data.session : null;
      if (session) {
        upsertBrowserSession(offload, session);
        offload.activeSessionId = String(session.session_id || '').trim();
        offload.activeTaskId = String(session.task_id || taskId);
        offload.sessionIdInput = offload.activeSessionId;
      } else {
        offload.activeTaskId = String(taskId);
      }
      if (data.bridge_credentials && typeof data.bridge_credentials === 'object') {
        if (data.bridge_credentials.bridge_token) {
          offload.bridgeTokenInput = String(data.bridge_credentials.bridge_token).trim();
        }
        if (data.bridge_credentials.launch_url) {
          offload.launchUrl = String(data.bridge_credentials.launch_url).trim();
        }
      }
      pushBrowserTimeline(offload, {
        at: new Date().toISOString(),
        label: data.reused ? 'launch reused' : 'launch requested',
        detail: session && session.session_id ? `session ${session.session_id}` : `task ${taskId}`,
        tone: 'info',
      });
      setBrowserStatusMessage(offload, data.reused ? 'Reused existing active browser session.' : 'Browser workflow launched.', 'success');
      await refreshBrowserOffloadStatus(tab, { silent: true });
    } catch (error) {
      setBrowserStatusMessage(offload, trimTo(error.message || 'Launch failed', 220), 'error');
      pushBrowserTimeline(offload, {
        at: new Date().toISOString(),
        label: 'launch failed',
        detail: trimTo(error.message || 'launch failed', 220),
        tone: 'error',
      });
    } finally {
      offload.actionPending = false;
      if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
    }
  }

  async function attachBrowserSession(tab) {
    const offload = updateBrowserUiFromInputs(tab);
    const taskId = parsePositiveIntegerInput(offload.taskIdInput || offload.activeTaskId);
    const sessionId = String(offload.sessionIdInput || offload.activeSessionId || '').trim();
    const bridgeToken = String(offload.bridgeTokenInput || '').trim();
    if (!sessionId) {
      setBrowserStatusMessage(offload, 'session_id is required to attach.', 'error');
      if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
      return;
    }
    if (!bridgeToken) {
      setBrowserStatusMessage(offload, 'bridge_token is required to attach.', 'error');
      if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
      return;
    }

    offload.actionPending = true;
    setBrowserStatusMessage(offload, 'Attaching browser session...', 'info');
    if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});

    const payload = {
      session_id: sessionId,
      bridge_token: bridgeToken,
    };
    if (taskId) payload.task_id = taskId;

    try {
      const data = await tabFetchJson(tab, '/api/browser/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (data.session && typeof data.session === 'object') {
        upsertBrowserSession(offload, data.session);
        offload.activeSessionId = String(data.session.session_id || sessionId).trim();
        offload.activeTaskId = String(data.session.task_id || taskId || '').trim();
      }
      if (data.callback_credentials && typeof data.callback_credentials === 'object') {
        offload.callbackToken = String(data.callback_credentials.callback_token || '').trim();
        offload.callbackEndpoint = String(data.callback_credentials.callback_endpoint || '').trim();
      }
      pushBrowserTimeline(offload, {
        at: new Date().toISOString(),
        label: 'attached',
        detail: `session ${sessionId}`,
        tone: 'success',
      });
      setBrowserStatusMessage(offload, 'Session attached. Waiting for callbacks.', 'success');
      await refreshBrowserOffloadStatus(tab, { silent: true });
    } catch (error) {
      setBrowserStatusMessage(offload, trimTo(error.message || 'Attach failed', 220), 'error');
      pushBrowserTimeline(offload, {
        at: new Date().toISOString(),
        label: 'attach failed',
        detail: trimTo(error.message || 'attach failed', 220),
        tone: 'error',
      });
    } finally {
      offload.actionPending = false;
      if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
    }
  }

  async function cancelBrowserWorkflow(tab) {
    const offload = updateBrowserUiFromInputs(tab);
    const sessionId = String(offload.sessionIdInput || offload.activeSessionId || '').trim();
    const taskId = parsePositiveIntegerInput(offload.taskIdInput || offload.activeTaskId);
    if (!sessionId && !taskId) {
      setBrowserStatusMessage(offload, 'No active browser workflow to cancel.', 'error');
      if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
      return;
    }

    offload.actionPending = true;
    if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});

    if (sessionId && offload.callbackToken) {
      try {
        const endpoint = `/api/browser/callback/${encodeURIComponent(sessionId)}`;
        await tabFetchJson(tab, endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${offload.callbackToken}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            task_id: taskId || undefined,
            event: 'failed',
            error: 'Cancelled from dashboard',
          }),
        });
        pushBrowserTimeline(offload, {
          at: new Date().toISOString(),
          label: 'cancelled',
          detail: `session ${sessionId}`,
          tone: 'error',
        });
        setBrowserStatusMessage(offload, 'Cancellation callback sent.', 'success');
      } catch (error) {
        setBrowserStatusMessage(offload, `Cancel callback failed: ${trimTo(error.message || 'unknown error', 180)}`, 'error');
      }
    } else {
      pushBrowserTimeline(offload, {
        at: new Date().toISOString(),
        label: 'cancelled locally',
        detail: sessionId ? `session ${sessionId}` : `task ${taskId}`,
        tone: 'info',
      });
      setBrowserStatusMessage(offload, 'Monitoring cancelled locally (remote session may continue).', 'info');
    }

    offload.activeSessionId = '';
    offload.sessionIdInput = '';
    offload.callbackToken = '';
    offload.callbackEndpoint = '';
    offload.resultSummary = '';
    offload.launchUrl = '';
    offload.bridgeTokenInput = '';
    offload.actionPending = false;
    if (tab.id === activeTabId) renderBrowserOffload(tab, tab.state || {});
  }

  function fetchTabConfig(tab) {
    tabFetch(tab, '/api/config')
      .then(r => r.json())
      .then(cfg => {
        tab.config = cfg;
        if (tab.id !== activeTabId) return;

        const dirInput = document.getElementById('project-dir');
        const countInput = document.getElementById('worker-count');
        const repoInput = document.getElementById('github-repo');
        const statusEl = document.getElementById('setup-status');
        const toggleBtn = document.getElementById('setup-toggle');
        const body = document.getElementById('setup-body');

        if (cfg.projectDir) dirInput.value = cfg.projectDir;
        if (cfg.numWorkers) countInput.value = cfg.numWorkers;
        if (cfg.provider) document.getElementById('provider-select').value = cfg.provider;
        if (cfg.modelFast !== undefined) document.getElementById('model-fast').value = cfg.modelFast || '';
        if (cfg.modelDeep !== undefined) document.getElementById('model-deep').value = cfg.modelDeep || '';
        if (cfg.modelEconomy !== undefined) document.getElementById('model-economy').value = cfg.modelEconomy || '';
        if (cfg.githubRepo) {
          repoInput.value = cfg.githubRepo;
          document.getElementById('git-repo-label').textContent = cfg.githubRepo;
          document.getElementById('git-push-btn').disabled = false;
        } else {
          repoInput.value = '';
          document.getElementById('git-repo-label').textContent = '';
          document.getElementById('git-push-btn').disabled = true;
        }

        if (cfg.setupComplete) {
          statusEl.textContent = 'Setup complete';
          statusEl.className = 'done';
          toggleBtn.style.display = '';
          toggleBtn.innerHTML = '&#9660;';
        } else {
          statusEl.textContent = 'Not configured';
          statusEl.className = 'pending';
          toggleBtn.style.display = 'none';
          body.classList.remove('collapsed');
        }
      })
      .catch(err => console.error('Config fetch failed:', err));
  }

  function fetchTabPresets(tab) {
    tabFetch(tab, '/api/presets')
      .then(r => r.json())
      .then(data => {
        tab.presets = data;
        if (tab.id === activeTabId) renderPresets(data);
      })
      .catch(err => console.error('Presets fetch failed:', err));
  }

  // --- Presets ---

  function renderPresets(presetList) {
    const sel = document.getElementById('preset-select');
    const current = sel.value;
    sel.innerHTML = '<option value="">-- New --</option>';
    presetList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    if (current && sel.querySelector(`option[value="${current}"]`)) {
      sel.value = current;
    }
    document.getElementById('preset-delete-btn').disabled = !sel.value;
  }

  document.getElementById('preset-select').addEventListener('change', (e) => {
    const id = e.target.value;
    document.getElementById('preset-delete-btn').disabled = !id;
    if (!id) return;
    const tab = activeTab();
    if (!tab) return;
    const preset = tab.presets.find(p => String(p.id) === id);
    if (!preset) return;
    document.getElementById('project-dir').value = preset.project_dir;
    document.getElementById('github-repo').value = preset.github_repo;
    document.getElementById('worker-count').value = preset.num_workers;
    if (preset.provider) document.getElementById('provider-select').value = preset.provider;
    if (preset.model_fast !== undefined) document.getElementById('model-fast').value = preset.model_fast || '';
    if (preset.model_deep !== undefined) document.getElementById('model-deep').value = preset.model_deep || '';
    if (preset.model_economy !== undefined) document.getElementById('model-economy').value = preset.model_economy || '';
  });

  document.getElementById('preset-delete-btn').addEventListener('click', () => {
    const sel = document.getElementById('preset-select');
    const id = sel.value;
    if (!id) return;
    if (!confirm('Delete this preset?')) return;
    const tab = activeTab();
    if (!tab) return;
    tabFetch(tab, '/api/presets/' + id, { method: 'DELETE' })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          sel.value = '';
          fetchTabPresets(tab);
        }
      })
      .catch(err => console.error('Preset delete failed:', err));
  });

  // --- Setup panel ---

  function appendSetupLog(line) {
    const output = document.getElementById('setup-output');
    const log = document.getElementById('setup-log');
    output.style.display = '';
    log.textContent += line + '\n';
    output.scrollTop = output.scrollHeight;
  }

  function onSetupComplete(code) {
    const btn = document.getElementById('launch-btn');
    const statusEl = document.getElementById('setup-status');
    btn.disabled = false;

    if (code === 0) {
      btn.textContent = 'Launch Setup';
      statusEl.textContent = 'Setup complete';
      statusEl.className = 'done';
      appendSetupLog('\n--- Setup finished successfully ---');
      const tab = activeTab();
      if (tab) {
        fetchTabStatus(tab);
        fetchTabPresets(tab);
      }
      const toggleBtn = document.getElementById('setup-toggle');
      toggleBtn.style.display = '';
    } else {
      btn.textContent = 'Retry Setup';
      statusEl.textContent = 'Setup failed';
      statusEl.className = 'pending';
      appendSetupLog('\n--- Setup failed (exit code ' + code + ') ---');
    }
  }

  document.getElementById('save-config-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    const projectDir = document.getElementById('project-dir').value.trim();
    const githubRepo = document.getElementById('github-repo').value.trim();
    const numWorkers = parseInt(document.getElementById('worker-count').value) || 4;
    const provider = document.getElementById('provider-select').value;
    const modelFast = document.getElementById('model-fast').value.trim();
    const modelDeep = document.getElementById('model-deep').value.trim();
    const modelEconomy = document.getElementById('model-economy').value.trim();
    if (!projectDir) {
      document.getElementById('project-dir').focus();
      return;
    }
    const btn = document.getElementById('save-config-btn');
    const msg = document.getElementById('config-msg');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    tabFetch(tab, '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir, githubRepo, numWorkers, provider, modelFast, modelDeep, modelEconomy }),
    }).then(r => r.json()).then(data => {
      btn.disabled = false;
      btn.textContent = 'Save Config';
      msg.style.display = '';
      if (data.ok) {
        msg.textContent = 'Config saved. Relaunch masters to apply.';
        msg.style.color = '#3fb950';
        document.getElementById('git-repo-label').textContent = githubRepo;
        if (githubRepo) document.getElementById('git-push-btn').disabled = false;
        fetchTabPresets(tab);
      } else {
        msg.textContent = data.error || 'Save failed';
        msg.style.color = '#f85149';
      }
      setTimeout(() => { msg.style.display = 'none'; }, 5000);
    }).catch(err => {
      btn.disabled = false;
      btn.textContent = 'Save Config';
      msg.style.display = '';
      msg.textContent = 'Error: ' + err.message;
      msg.style.color = '#f85149';
    });
  });

  document.getElementById('launch-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab || tab.setupRunning) return;
    const projectDir = document.getElementById('project-dir').value.trim();
    const githubRepo = document.getElementById('github-repo').value.trim();
    const numWorkers = parseInt(document.getElementById('worker-count').value) || 4;
    const provider = document.getElementById('provider-select').value;
    const modelFast = document.getElementById('model-fast').value.trim();
    const modelDeep = document.getElementById('model-deep').value.trim();
    const modelEconomy = document.getElementById('model-economy').value.trim();
    if (!projectDir) {
      document.getElementById('project-dir').focus();
      return;
    }

    tab.setupRunning = true;
    const btn = document.getElementById('launch-btn');
    const statusEl = document.getElementById('setup-status');
    btn.disabled = true;
    btn.textContent = 'Running...';
    statusEl.textContent = 'Running setup...';
    statusEl.className = 'running';

    document.getElementById('setup-log').textContent = '';
    document.getElementById('setup-output').style.display = '';

    tabFetch(tab, '/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir, githubRepo, numWorkers, provider, modelFast, modelDeep, modelEconomy }),
    }).then(r => r.json()).then(data => {
      if (!data.ok) {
        appendSetupLog('Error: ' + (data.error || 'Unknown error'));
        tab.setupRunning = false;
        btn.disabled = false;
        btn.textContent = 'Retry Setup';
        statusEl.textContent = 'Setup failed';
        statusEl.className = 'pending';
      }
    }).catch(err => {
      appendSetupLog('Error: ' + err.message);
      tab.setupRunning = false;
      btn.disabled = false;
      btn.textContent = 'Retry Setup';
    });
  });

  document.getElementById('setup-toggle').addEventListener('click', () => {
    const body = document.getElementById('setup-body');
    const btn = document.getElementById('setup-toggle');
    body.classList.toggle('collapsed');
    btn.innerHTML = body.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
  });

  // --- Master launch helpers ---

  function launchMaster(btnId, statusId, endpoint) {
    const tab = activeTab();
    if (!tab) return;
    const btn = document.getElementById(btnId);
    const status = document.getElementById(statusId);
    btn.disabled = true;
    btn.textContent = 'Launching...';

    tabFetch(tab, endpoint, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          status.textContent = 'Terminal opened';
          status.style.cssText = 'color:#3fb950';
        } else {
          status.textContent = data.error || 'Failed';
          status.style.cssText = 'color:#d29922';
        }
        btn.textContent = 'Launch';
        btn.disabled = false;
      })
      .catch(err => {
        status.textContent = 'Error: ' + err.message;
        status.style.cssText = 'color:#f85149';
        btn.textContent = 'Launch';
        btn.disabled = false;
      });
  }

  document.getElementById('master1-btn').addEventListener('click', () => {
    launchMaster('master1-btn', 'master1-status', '/api/master1/launch');
  });

  document.getElementById('architect-btn').addEventListener('click', () => {
    launchMaster('architect-btn', 'architect-status', '/api/architect/launch');
  });

  document.getElementById('master3-btn').addEventListener('click', () => {
    launchMaster('master3-btn', 'master3-status', '/api/master3/launch');
  });

  // --- Git push ---

  function appendGitLog(line) {
    const output = document.getElementById('git-output');
    const log = document.getElementById('git-log');
    output.style.display = '';
    log.textContent += line + '\n';
    output.scrollTop = output.scrollHeight;
  }

  function onGitPushComplete(code) {
    const btn = document.getElementById('git-push-btn');
    const status = document.getElementById('git-push-status');
    btn.disabled = false;
    btn.textContent = 'Push to GitHub';
    if (code === 0) {
      status.textContent = 'Push successful';
      status.style.color = '#3fb950';
    } else {
      status.textContent = 'Push failed (exit ' + code + ')';
      status.style.color = '#f85149';
    }
  }

  document.getElementById('git-push-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab || tab.gitPushing) return;
    tab.gitPushing = true;
    const btn = document.getElementById('git-push-btn');
    const status = document.getElementById('git-push-status');
    btn.disabled = true;
    btn.textContent = 'Pushing...';
    status.textContent = '';
    document.getElementById('git-log').textContent = '';

    tabFetch(tab, '/api/git/push', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) {
          appendGitLog('Error: ' + (data.error || 'Unknown error'));
          tab.gitPushing = false;
          btn.disabled = false;
          btn.textContent = 'Push to GitHub';
          status.textContent = 'Failed';
          status.style.color = '#f85149';
        }
      })
      .catch(err => {
        appendGitLog('Error: ' + err.message);
        tab.gitPushing = false;
        btn.disabled = false;
        btn.textContent = 'Push to GitHub';
      });
  });

  // --- Browser offload workflow ---

  ['browser-task-id', 'browser-session-id', 'browser-channel', 'browser-timeout-ms', 'browser-payload', 'browser-bridge-token'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
      const tab = activeTab();
      if (!tab) return;
      updateBrowserUiFromInputs(tab);
      renderBrowserOffload(tab, tab.state || {});
    });
  });

  document.getElementById('browser-start-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    startBrowserOffloadWorkflow(tab);
  });

  document.getElementById('browser-attach-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    attachBrowserSession(tab);
  });

  document.getElementById('browser-refresh-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    updateBrowserUiFromInputs(tab);
    refreshBrowserOffloadStatus(tab);
  });

  document.getElementById('browser-retry-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    startBrowserOffloadWorkflow(tab, { retry: true });
  });

  document.getElementById('browser-cancel-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    cancelBrowserWorkflow(tab);
  });

  document.getElementById('browser-open-launch-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    const offload = ensureBrowserOffloadState(tab);
    const launchUrl = safeUrl(offload.launchUrl);
    if (!launchUrl) return;
    window.open(launchUrl, '_blank', 'noopener');
  });

  // --- Submit request ---

  document.getElementById('request-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    const input = document.getElementById('request-input');
    const desc = input.value.trim();
    if (!desc) return;
    tabFetch(tab, '/api/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc }),
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        input.value = '';
        fetchTabStatus(tab);
      }
    }).catch(err => console.error('Request submit failed:', err));
  });

  document.getElementById('request-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('request-btn').click();
  });

  // --- Settings panel (right-click on panel header) ---
  const settingsPanel = document.getElementById('settings-panel');

  function openSettingsPanel(panelName, x, y) {
    const titleEl = settingsPanel.querySelector('.settings-panel-title');
    const itemsEl = settingsPanel.querySelector('.settings-panel-items');
    const titles = { workers: 'Workers', requests: 'Requests', tasks: 'Tasks', log: 'Activity Log', browser: 'Browser Offload', memory: 'Memory Snapshots' };
    titleEl.textContent = titles[panelName] || panelName;
    itemsEl.innerHTML = '';

    const popoutItem = document.createElement('div');
    popoutItem.className = 'settings-panel-item';
    popoutItem.innerHTML = '<span class="settings-icon">&#8599;</span> Open in new window';
    popoutItem.addEventListener('click', function() {
      const tab = activeTab();
      const portParam = tab ? '&port=' + tab.port : '';
      window.open(
        'popout.html?panel=' + encodeURIComponent(panelName) + portParam,
        'mac10_popout_' + panelName + (tab ? '_' + tab.port : ''),
        'width=600,height=500,left=' + (window.screenX + 50) + ',top=' + (window.screenY + 50) + ',resizable=yes,scrollbars=yes'
      );
      closeSettingsPanel();
    });
    itemsEl.appendChild(popoutItem);

    settingsPanel.style.display = '';
    const rect = settingsPanel.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    settingsPanel.style.left = Math.min(x, maxX) + 'px';
    settingsPanel.style.top = Math.min(y, maxY) + 'px';
  }

  function closeSettingsPanel() {
    settingsPanel.style.display = 'none';
  }

  document.querySelectorAll('.panel-header[data-panel]').forEach(function(header) {
    header.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      openSettingsPanel(header.getAttribute('data-panel'), e.clientX, e.clientY);
    });
  });

  document.addEventListener('click', function() { closeSettingsPanel(); });
  document.addEventListener('contextmenu', function(e) {
    if (!e.target.closest('.panel-header[data-panel]') && !e.target.closest('.settings-panel')) {
      closeSettingsPanel();
    }
  });

  // --- Add project modal ---

  const modal = document.getElementById('add-project-modal');
  let modalPresets = [];

  function fetchModalPresets() {
    const hubBase = `${location.protocol}//${location.hostname}:${hubPort}`;
    return fetch(hubBase + '/api/presets')
      .then(r => r.json())
      .then(data => {
        modalPresets = data;
        renderModalPresets();
      })
      .catch(err => console.error('Modal presets fetch failed:', err));
  }

  function renderModalPresets() {
    const sel = document.getElementById('modal-preset-select');
    sel.innerHTML = '<option value="">-- New --</option>';
    modalPresets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = String(p.id);
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }

  document.getElementById('modal-preset-select').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    const preset = modalPresets.find(p => String(p.id) === id);
    if (!preset) return;
    document.getElementById('modal-project-dir').value = preset.project_dir;
    document.getElementById('modal-github-repo').value = preset.github_repo || '';
    document.getElementById('modal-worker-count').value = preset.num_workers || 4;
    if (preset.provider) document.getElementById('modal-provider-select').value = preset.provider;
    if (preset.model_fast !== undefined) document.getElementById('modal-model-fast').value = preset.model_fast || '';
    if (preset.model_deep !== undefined) document.getElementById('modal-model-deep').value = preset.model_deep || '';
    if (preset.model_economy !== undefined) document.getElementById('modal-model-economy').value = preset.model_economy || '';
  });

  document.getElementById('add-tab-btn').addEventListener('click', () => {
    modal.style.display = '';
    document.getElementById('modal-preset-select').value = '';
    document.getElementById('modal-project-dir').value = '';
    document.getElementById('modal-github-repo').value = '';
    document.getElementById('modal-worker-count').value = '4';
    document.getElementById('modal-provider-select').value = 'codex';
    document.getElementById('modal-model-fast').value = '';
    document.getElementById('modal-model-deep').value = '';
    document.getElementById('modal-model-economy').value = '';
    document.getElementById('modal-save-preset').checked = true;
    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-launch-btn').disabled = false;
    document.getElementById('modal-launch-btn').textContent = 'Launch';
    fetchModalPresets();
    document.getElementById('modal-project-dir').focus();
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  document.getElementById('modal-launch-btn').addEventListener('click', () => {
    const dir = document.getElementById('modal-project-dir').value.trim();
    const repo = document.getElementById('modal-github-repo').value.trim();
    const workers = parseInt(document.getElementById('modal-worker-count').value) || 4;
    const modalProvider = document.getElementById('modal-provider-select').value;
    const modalModelFast = document.getElementById('modal-model-fast').value.trim();
    const modalModelDeep = document.getElementById('modal-model-deep').value.trim();
    const modalModelEconomy = document.getElementById('modal-model-economy').value.trim();
    const savePreset = document.getElementById('modal-save-preset').checked;
    const errEl = document.getElementById('modal-error');
    const btn = document.getElementById('modal-launch-btn');

    if (!dir) {
      errEl.textContent = 'Project directory is required';
      errEl.style.display = '';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Launching...';
    errEl.style.display = 'none';

    // Save preset via hub before launching (if checked)
    const hubBase = `${location.protocol}//${location.hostname}:${hubPort}`;
    const presetPromise = savePreset && dir
      ? fetch(hubBase + '/api/presets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: repo || dir.split('/').pop(),
            projectDir: dir,
            githubRepo: repo,
            numWorkers: workers,
            provider: modalProvider,
            modelFast: modalModelFast,
            modelDeep: modalModelDeep,
            modelEconomy: modalModelEconomy,
          }),
        }).catch(() => {}) // non-fatal
      : Promise.resolve();

    presetPromise.then(() => {
      return fetch(hubBase + '/api/instances/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDir: dir, githubRepo: repo, numWorkers: workers, provider: modalProvider, modelFast: modalModelFast, modelDeep: modalModelDeep, modelEconomy: modalModelEconomy }),
      });
    }).then(r => r.json()).then(data => {
      btn.disabled = false;
      btn.textContent = 'Launch';
      if (data.ok) {
        modal.style.display = 'none';
        const tabId = addTab(data.port, data.name, dir);
        switchTab(tabId);
      } else if (data.port) {
        // Already running -- just open the tab
        modal.style.display = 'none';
        const tabId = addTab(data.port, dir.split('/').pop(), dir);
        switchTab(tabId);
      } else {
        errEl.textContent = data.error || 'Launch failed';
        errEl.style.display = '';
      }
    }).catch(err => {
      btn.disabled = false;
      btn.textContent = 'Launch';
      errEl.textContent = 'Error: ' + err.message;
      errEl.style.display = '';
    });
  });

  // --- Changes ---

  function fetchTabChanges(tab) {
    const params = tab.changesDomainFilter ? '?domain=' + encodeURIComponent(tab.changesDomainFilter) : '';
    tabFetch(tab, '/api/changes' + params)
      .then(r => r.json())
      .then(data => {
        tab.changes = Array.isArray(data) ? data : [];
        if (tab.id === activeTabId) renderChanges(tab);
      })
      .catch(err => console.error('Changes fetch failed:', err));
  }

  function renderChanges(tab) {
    const el = document.getElementById('changes-list');
    const domainSelect = document.getElementById('changes-domain-select');

    // Update domain filter options from available domains
    const domains = new Set();
    for (const c of tab.changes) {
      if (c.domain) domains.add(c.domain);
    }
    const currentFilter = domainSelect.value;
    domainSelect.innerHTML = '<option value="">All Domains</option>';
    for (const d of [...domains].sort()) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      domainSelect.appendChild(opt);
    }
    domainSelect.value = currentFilter;

    // Filter by domain
    const filtered = tab.changesDomainFilter
      ? tab.changes.filter(c => c.domain === tab.changesDomainFilter)
      : tab.changes;

    if (filtered.length === 0) {
      el.innerHTML = '<div style="color:#8b949e;font-size:13px">No changes logged</div>';
      return;
    }

    el.innerHTML = filtered.map(c => {
      const isPending = c.status === 'pending_user_action';
      const tooltipEl = c.tooltip ? `<div class="change-tooltip">${escapeHtml(c.tooltip)}</div>` : '';
      return `
        <div class="change-item${isPending ? ' pending-action' : ''}" data-change-id="${c.id}">
          <input type="checkbox" class="change-toggle" ${c.enabled ? 'checked' : ''} data-id="${c.id}" />
          <div class="change-content">
            <div class="change-desc">${escapeHtml(c.description)}</div>
            <div class="change-meta">
              ${c.domain ? `<span class="change-domain-badge">${escapeHtml(c.domain)}</span>` : ''}
              ${isPending ? '<span class="change-action-badge">Action Required</span>' : ''}
              ${c.file_path ? `<span>${escapeHtml(c.file_path)}</span>` : ''}
              ${c.function_name ? `<span>${escapeHtml(c.function_name)}</span>` : ''}
            </div>
          </div>
          ${tooltipEl}
        </div>`;
    }).join('');

    // Bind toggle events
    el.querySelectorAll('.change-toggle').forEach(cb => {
      cb.addEventListener('change', function() {
        const id = parseInt(this.dataset.id);
        const enabled = this.checked ? 1 : 0;
        const tab = activeTab();
        if (!tab) return;
        tabFetch(tab, '/api/changes/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        }).catch(err => console.error('Change toggle failed:', err));
      });
    });
  }

  document.getElementById('changes-domain-select').addEventListener('change', function() {
    const tab = activeTab();
    if (!tab) return;
    tab.changesDomainFilter = this.value;
    renderChanges(tab);
  });

  // --- Batch orchestration ---

  function fetchBatchConfig(tab) {
    tabFetch(tab, '/api/batch/config')
      .then(r => r.json())
      .then(cfg => {
        tab.batchConfig = cfg;
        if (tab.id === activeTabId) renderBatchPanel(tab, tab.state || {});
      })
      .catch(err => console.error('Batch config fetch failed:', err));
  }

  function renderBatchPanel(tab, state) {
    const batchStatus = state && state.batch_status ? state.batch_status : {};
    const cfg = tab && tab.batchConfig ? tab.batchConfig : {};

    updateInputValue(document.getElementById('batch-max-size'), cfg.max_size != null ? String(cfg.max_size) : '');
    updateInputValue(document.getElementById('batch-timeout-ms'), cfg.timeout_ms != null ? String(cfg.timeout_ms) : '');
    updateInputValue(document.getElementById('batch-candidate-limit'), cfg.candidate_limit != null ? String(cfg.candidate_limit) : '');

    const metrics = [
      { label: 'Queue Depth', value: batchStatus.queue_depth != null ? String(batchStatus.queue_depth) : '\u2014' },
      { label: 'In-Flight Batches', value: batchStatus.in_flight_batches != null ? String(batchStatus.in_flight_batches) : '\u2014' },
      { label: 'In-Flight Stages', value: batchStatus.in_flight_stages != null ? String(batchStatus.in_flight_stages) : '\u2014' },
      { label: 'Partial Failures', value: batchStatus.partial_failure_count != null ? String(batchStatus.partial_failure_count) : '\u2014' },
      { label: 'Completed', value: batchStatus.completed_count != null ? String(batchStatus.completed_count) : '\u2014' },
      { label: 'Dedupe Hit Rate', value: batchStatus.dedupe_hit_rate_pct != null ? `${batchStatus.dedupe_hit_rate_pct}%` : '\u2014' },
    ];
    document.getElementById('batch-metrics').innerHTML =
      `<div class="batch-metrics-grid">${metrics.map(m =>
        `<div class="batch-metric"><span class="batch-metric-label">${escapeHtml(m.label)}</span><span class="batch-metric-value">${escapeHtml(m.value)}</span></div>`
      ).join('')}</div>`;

    const batchListEl = document.getElementById('batch-list');
    const recentBatches = Array.isArray(batchStatus.recent_batches) ? batchStatus.recent_batches : [];
    let batchHtml = '';
    if (recentBatches.length === 0) {
      batchHtml += '<div style="color:#8b949e;font-size:13px;margin-top:8px">No batches yet</div>';
    } else {
      batchHtml += '<div class="batch-list-header">Recent Batches</div>' + recentBatches.slice(0, 10).map(b =>
        `<div class="batch-item">` +
        `<span style="color:#58a6ff">#${escapeHtml(String(b.id))}</span> ` +
        `<span class="worker-status badge-${escapeHtml(b.status || 'unknown')}">${escapeHtml(b.status || 'unknown')}</span> ` +
        `<span style="font-size:11px;color:#8b949e">${escapeHtml(String(b.planned_intent_count || 0))} intents</span>` +
        (b.duration_ms != null ? ` <span class="task-chip"><span class="task-chip-label">dur</span>${escapeHtml(String(b.duration_ms))}ms</span>` : '') +
        (b.last_error ? `<div style="font-size:11px;color:#f85149">${escapeHtml(String(b.last_error).slice(0, 80))}</div>` : '') +
        `</div>`
      ).join('');
    }
    const fanout = Array.isArray(batchStatus.fanout_by_request) ? batchStatus.fanout_by_request : [];
    if (fanout.length > 0) {
      batchHtml += '<div class="batch-list-header" style="margin-top:12px">Fan-out Completeness by Request</div>' + fanout.slice(0, 10).map(f => {
        const pct = f.total_fanout > 0 ? Math.round((f.completed_fanout / f.total_fanout) * 100) : 0;
        return `<div class="batch-item">` +
          `<span style="color:#58a6ff">${escapeHtml(String(f.request_id || '-'))}</span> ` +
          `<span class="task-chip"><span class="task-chip-label">done</span>${escapeHtml(String(f.completed_fanout || 0))}/${escapeHtml(String(f.total_fanout || 0))} (${pct}%)</span>` +
          (f.failed_fanout > 0 ? ` <span class="task-chip" style="color:#f85149"><span class="task-chip-label">fail</span>${escapeHtml(String(f.failed_fanout))}</span>` : '') +
          (f.pending_fanout > 0 ? ` <span class="task-chip"><span class="task-chip-label">pend</span>${escapeHtml(String(f.pending_fanout))}</span>` : '') +
          `</div>`;
      }).join('');
    }
    batchListEl.innerHTML = batchHtml;
  }

  async function saveBatchConfig(tab) {
    const maxSizeVal = document.getElementById('batch-max-size').value.trim();
    const timeoutVal = document.getElementById('batch-timeout-ms').value.trim();
    const candidateLimitVal = document.getElementById('batch-candidate-limit').value.trim();
    const body = {};
    if (maxSizeVal) body.max_size = parseInt(maxSizeVal, 10);
    if (timeoutVal) body.timeout_ms = parseInt(timeoutVal, 10);
    if (candidateLimitVal) body.candidate_limit = parseInt(candidateLimitVal, 10);
    if (Object.keys(body).length === 0) return;

    const btn = document.getElementById('batch-save-btn');
    const msg = document.getElementById('batch-save-msg');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const data = await tabFetchJson(tab, '/api/batch/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      msg.style.display = '';
      if (data.ok) {
        msg.textContent = 'Saved';
        msg.style.color = '#3fb950';
        tab.batchConfig = { ...tab.batchConfig, ...body };
      } else {
        msg.textContent = data.error || 'Failed';
        msg.style.color = '#f85149';
      }
    } catch (err) {
      msg.style.display = '';
      msg.textContent = 'Error: ' + err.message;
      msg.style.color = '#f85149';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
      setTimeout(() => { msg.style.display = 'none'; }, 3000);
    }
  }

  // --- Memory snapshots ---

  function renderMemoryPanel(tab, state) {
    const snapshots = Array.isArray(state && state.memory_snapshots) ? state.memory_snapshots : [];
    const filter = tab && tab.memoryFilter ? tab.memoryFilter : { iteration: '', run: '' };

    const iterSelect = document.getElementById('memory-iteration-select');
    const runSelect = document.getElementById('memory-run-select');

    const iterations = [...new Set(snapshots.map(s => s.iteration).filter(v => v != null))].sort((a, b) => a - b);
    const runs = [...new Set(snapshots.map(s => s.research_run).filter(Boolean))].sort();

    const curIter = filter.iteration;
    iterSelect.innerHTML = '<option value="">All Iterations</option>';
    iterations.forEach(i => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `Iter #${i}`;
      iterSelect.appendChild(opt);
    });
    iterSelect.value = curIter;

    const curRun = filter.run;
    runSelect.innerHTML = '<option value="">All Runs</option>';
    runs.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      runSelect.appendChild(opt);
    });
    runSelect.value = curRun;

    let filtered = snapshots;
    if (filter.iteration) filtered = filtered.filter(s => String(s.iteration) === filter.iteration);
    if (filter.run) filtered = filtered.filter(s => s.research_run === filter.run);

    const listEl = document.getElementById('memory-snapshots-list');
    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="color:#8b949e;font-size:13px">No memory snapshots</div>';
      return;
    }
    listEl.innerHTML = filtered.slice(0, 20).map(snap => renderMemorySnapshotCard(snap)).join('');
  }

  function renderMemorySnapshotCard(snap) {
    const insights = Array.isArray(snap.insights) ? snap.insights : [];
    const insightsHtml = insights.length === 0
      ? '<div class="memory-no-insights">No insights in this snapshot</div>'
      : insights.slice(0, 10).map(ins => renderMemoryInsightRow(ins)).join('');
    return `
      <div class="memory-snapshot-card">
        <div class="memory-snapshot-header">
          <span class="memory-snap-id">${escapeHtml(String(snap.id || '-'))}</span>
          ${snap.iteration != null ? `<span class="task-chip"><span class="task-chip-label">iter</span>${escapeHtml(String(snap.iteration))}</span>` : ''}
          ${snap.research_run ? `<span class="task-chip"><span class="task-chip-label">run</span>${escapeHtml(String(snap.research_run))}</span>` : ''}
          ${snap.created_at ? `<span class="memory-snap-date">${escapeHtml(String(snap.created_at))}</span>` : ''}
        </div>
        ${snap.description ? `<div class="memory-snap-desc">${escapeHtml(String(snap.description))}</div>` : ''}
        <div class="memory-insights-list">${insightsHtml}</div>
        ${insights.length > 10 ? `<div style="color:#8b949e;font-size:11px;margin-top:4px">+${insights.length - 10} more insights</div>` : ''}
      </div>
    `;
  }

  function renderMemoryInsightRow(ins) {
    const valFlags = Array.isArray(ins.validation_flags) ? ins.validation_flags : [];
    const govFlags = Array.isArray(ins.gov_flags) ? ins.gov_flags : [];
    const score = ins.relevance_score != null ? Number(ins.relevance_score) : null;
    const scoreStr = Number.isFinite(score) ? (score * 100).toFixed(0) + '%' : null;
    const dedupeClass = ins.dedupe_status === 'duplicate' ? 'memory-dedupe-dup'
      : (ins.dedupe_status === 'near_duplicate' ? 'memory-dedupe-near' : 'memory-dedupe-unique');
    return `
      <div class="memory-insight-row${ins.reuse_recommended ? ' memory-reuse-recommended' : ''}">
        <div class="memory-insight-text">${escapeHtml(String(ins.text || ''))}</div>
        <div class="memory-insight-meta">
          ${scoreStr ? `<span class="task-chip"><span class="task-chip-label">rel</span>${escapeHtml(scoreStr)}</span>` : ''}
          ${ins.dedupe_status ? `<span class="memory-dedupe-chip ${escapeHtml(dedupeClass)}">${escapeHtml(String(ins.dedupe_status))}</span>` : ''}
          ${valFlags.map(f => `<span class="memory-flag-chip memory-flag-val">${escapeHtml(String(f))}</span>`).join('')}
          ${govFlags.map(f => `<span class="memory-flag-chip memory-flag-gov">${escapeHtml(String(f))}</span>`).join('')}
          ${ins.reuse_recommended ? '<span class="memory-reuse-badge">reuse</span>' : ''}
          ${ins.provenance ? `<span class="task-chip"><span class="task-chip-label">from</span>${escapeHtml(String(ins.provenance))}</span>` : ''}
          ${ins.last_used_by ? `<span class="task-chip"><span class="task-chip-label">last</span>${escapeHtml(String(ins.last_used_by))}</span>` : ''}
        </div>
      </div>
    `;
  }

  document.getElementById('memory-iteration-select').addEventListener('change', function() {
    const tab = activeTab();
    if (!tab) return;
    if (!tab.memoryFilter) tab.memoryFilter = { iteration: '', run: '' };
    tab.memoryFilter.iteration = this.value;
    renderMemoryPanel(tab, tab.state || {});
  });

  document.getElementById('memory-run-select').addEventListener('change', function() {
    const tab = activeTab();
    if (!tab) return;
    if (!tab.memoryFilter) tab.memoryFilter = { iteration: '', run: '' };
    tab.memoryFilter.run = this.value;
    renderMemoryPanel(tab, tab.state || {});
  });

  document.getElementById('batch-save-btn').addEventListener('click', () => {
    const tab = activeTab();
    if (!tab) return;
    saveBatchConfig(tab);
  });

  // --- Keyboard shortcuts ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modal.style.display !== 'none') {
        modal.style.display = 'none';
      }
      closeSettingsPanel();
    }
  });

  // --- Cleanup on unload ---
  window.addEventListener('beforeunload', () => {
    if (instancePollTimer) clearInterval(instancePollTimer);
    for (const [, tab] of tabs) {
      disconnectTab(tab);
    }
  });

  // --- Initial load ---
  // Poll instances from the hub coordinator, create tabs for each
  pollInstances();
  instancePollTimer = setInterval(pollInstances, 5000);
})();
