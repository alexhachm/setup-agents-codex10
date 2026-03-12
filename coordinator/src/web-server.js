'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('./db');
const instanceRegistry = require('./instance-registry');

const REPO_RE = /^(https?:\/\/github\.com\/)?[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
const SAFE_PATH_RE = /^(?:\/|[A-Za-z]:[\\/])[a-zA-Z0-9._\\/: -]+$/;
const ROUTING_BUDGET_STATE_KEY = 'routing_budget_state';
const ROUTING_BUDGET_REMAINING_KEY = 'routing_budget_flagship_remaining';
const ROUTING_BUDGET_THRESHOLD_KEY = 'routing_budget_flagship_threshold';
const LEGACY_BUDGET_REMAINING_KEY = 'flagship_budget_remaining';
const LEGACY_BUDGET_THRESHOLD_KEY = 'flagship_budget_threshold';

let server = null;
let wss = null;
let setupProcess = null;
let broadcastIntervalId = null;
let pingIntervalId = null;
const LAUNCH_READINESS_MAX_ATTEMPTS = 20;
const LAUNCH_READINESS_RETRY_MS = 500;
const LAUNCH_HTTP_TIMEOUT_MS = 1500;

function parseStrictPositiveIntegerParam(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function requestLocalApi({ port, path: reqPath, method = 'GET', body = null, headers = {}, timeoutMs = LAUNCH_HTTP_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers,
      timeout: timeoutMs,
    }, (apiRes) => {
      let responseBody = '';
      apiRes.on('data', (chunk) => {
        responseBody += chunk.toString();
      });
      apiRes.on('end', () => {
        resolve({ statusCode: apiRes.statusCode || 0, body: responseBody });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForCoordinatorReady(port, pid) {
  let lastError = 'No response from coordinator';
  for (let attempt = 1; attempt <= LAUNCH_READINESS_MAX_ATTEMPTS; attempt++) {
    if (!isPidAlive(pid)) {
      return { ok: false, error: 'Coordinator process exited before becoming ready' };
    }
    try {
      const statusRes = await requestLocalApi({ port, path: '/api/status' });
      if (statusRes.statusCode >= 200 && statusRes.statusCode < 300) {
        return { ok: true };
      }
      lastError = `Readiness probe returned HTTP ${statusRes.statusCode}`;
    } catch (e) {
      lastError = e.message;
    }
    if (attempt < LAUNCH_READINESS_MAX_ATTEMPTS) {
      await sleep(LAUNCH_READINESS_RETRY_MS);
    }
  }
  return {
    ok: false,
    error: `Coordinator did not become ready after ${LAUNCH_READINESS_MAX_ATTEMPTS} attempts (${lastError})`,
  };
}

async function seedCoordinatorConfig(port, payload) {
  const body = JSON.stringify(payload);
  const response = await requestLocalApi({
    port,
    path: '/api/config',
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  });
  const trimmedBody = (response.body || '').trim();
  if (response.statusCode >= 200 && response.statusCode < 300) {
    return { ok: true };
  }
  return {
    ok: false,
    statusCode: response.statusCode,
    error: trimmedBody ? `HTTP ${response.statusCode}: ${trimmedBody}` : `HTTP ${response.statusCode}`,
  };
}

function cleanupFailedLaunch(pid, port) {
  if (isPidAlive(pid)) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  try { instanceRegistry.deregister(port); } catch {}
}

function parseBudgetNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonObject(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  if (typeof rawValue === 'object') return rawValue;
  const trimmed = String(rawValue).trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRoutingField(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeBudgetState(value) {
  const parsed = parseJsonObject(value);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function buildBudgetSnapshotFromConfig() {
  const parsedState = parseJsonObject(db.getConfig(ROUTING_BUDGET_STATE_KEY));
  if (parsedState) {
    const flagship = parsedState.flagship && typeof parsedState.flagship === 'object'
      ? parsedState.flagship
      : parsedState;
    return {
      state: {
        source: 'config:routing_budget_state',
        parsed: parsedState,
        remaining: parseBudgetNumber(flagship.remaining),
        threshold: parseBudgetNumber(flagship.threshold),
      },
      source: 'config:routing_budget_state',
    };
  }

  const remaining = parseBudgetNumber(
    db.getConfig(ROUTING_BUDGET_REMAINING_KEY) ?? db.getConfig(LEGACY_BUDGET_REMAINING_KEY)
  );
  const threshold = parseBudgetNumber(
    db.getConfig(ROUTING_BUDGET_THRESHOLD_KEY) ?? db.getConfig(LEGACY_BUDGET_THRESHOLD_KEY)
  );
  if (remaining === null && threshold === null) return null;

  const parsed = { flagship: {} };
  if (remaining !== null) parsed.flagship.remaining = remaining;
  if (threshold !== null) parsed.flagship.threshold = threshold;
  return {
    state: {
      source: 'config:budget_thresholds',
      parsed,
      remaining,
      threshold,
    },
    source: 'config:budget_thresholds',
  };
}

function parseTaskAssignedTelemetry(detailsRaw) {
  const details = parseJsonObject(detailsRaw);
  if (!details) return null;

  const taskId = Number.parseInt(details.task_id, 10);
  if (!Number.isInteger(taskId) || taskId <= 0) return null;

  const budgetState = normalizeBudgetState(details.budget_state);
  return {
    task_id: taskId,
    routing_class: normalizeRoutingField(details.routing_class),
    routed_model: normalizeRoutingField(details.model ?? details.routed_model),
    model_source: normalizeRoutingField(details.model_source),
    reasoning_effort: normalizeRoutingField(details.reasoning_effort),
    budget_state: budgetState,
    budget_source: normalizeRoutingField(details.budget_source) || normalizeRoutingField(budgetState && budgetState.source),
  };
}

function buildTaskTelemetryMap(tasks) {
  const taskIds = new Set();
  for (const task of tasks) {
    const taskId = Number.parseInt(task && task.id, 10);
    if (Number.isInteger(taskId) && taskId > 0) taskIds.add(taskId);
  }

  const byTaskId = new Map();
  let latestBudget = null;
  const taskAssignedLogs = db.getDb().prepare(
    "SELECT details FROM activity_log WHERE actor = 'allocator' AND action = 'task_assigned' ORDER BY id DESC"
  );
  for (const row of taskAssignedLogs.iterate()) {
    const telemetry = parseTaskAssignedTelemetry(row.details);
    if (!telemetry) continue;

    if (!latestBudget && (telemetry.budget_state || telemetry.budget_source)) {
      latestBudget = {
        state: telemetry.budget_state || null,
        source: telemetry.budget_source || 'activity_log:allocator.task_assigned',
      };
    }

    if (!taskIds.has(telemetry.task_id) || byTaskId.has(telemetry.task_id)) {
      if (taskIds.size > 0 && byTaskId.size === taskIds.size && latestBudget) break;
      continue;
    }
    byTaskId.set(telemetry.task_id, telemetry);

    if (taskIds.size > 0 && byTaskId.size === taskIds.size && latestBudget) break;
  }

  return { byTaskId, latestBudget };
}

function pickRoutingField(taskValue, fallbackValue) {
  return normalizeRoutingField(taskValue) || normalizeRoutingField(fallbackValue);
}

function hydrateTasks(tasks, telemetry = null) {
  const taskTelemetry = telemetry || buildTaskTelemetryMap(tasks);
  const hydratedTasks = tasks.map((task) => {
    const taskId = Number.parseInt(task && task.id, 10);
    const fallback = taskTelemetry.byTaskId.get(taskId) || null;
    return {
      ...task,
      routing_class: pickRoutingField(task.routing_class, fallback && fallback.routing_class),
      routed_model: pickRoutingField(task.routed_model, fallback && fallback.routed_model),
      model_source: pickRoutingField(task.model_source, fallback && fallback.model_source),
      reasoning_effort: pickRoutingField(task.reasoning_effort, fallback && fallback.reasoning_effort),
    };
  });
  return { tasks: hydratedTasks, telemetry: taskTelemetry };
}

function listHydratedTasks(taskFilter = undefined, telemetry = null) {
  const tasks = db.listTasks(taskFilter);
  return hydrateTasks(tasks, telemetry);
}

function buildStatePayload({ includeLogs = false, includeLoops = false } = {}) {
  const requests = db.listRequests();
  const workers = db.getAllWorkers();
  const { tasks: hydratedTasks, telemetry } = listHydratedTasks();

  const configBudget = buildBudgetSnapshotFromConfig();
  const routingBudgetState = configBudget
    ? configBudget.state
    : (telemetry.latestBudget && telemetry.latestBudget.state) || null;
  const routingBudgetSource = configBudget
    ? configBudget.source
    : (telemetry.latestBudget && telemetry.latestBudget.source) || 'none';

  const payload = {
    requests,
    workers,
    tasks: hydratedTasks,
    routing_budget_state: routingBudgetState,
    routing_budget_source: routingBudgetSource,
  };
  if (includeLogs) payload.logs = db.getLog(20);
  if (includeLoops) payload.loops = db.listLoops();
  return payload;
}

function start(projectDir, port = 3100, scriptDir = null, handlers = {}) {
  const app = express();
  const namespace = process.env.MAC10_NAMESPACE || 'mac10';
  server = http.createServer(app);
  wss = new WebSocket.Server({ server });
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Handled by server.on('error') — suppress duplicate
    } else {
      console.error(`WebSocket server error: ${err.message}`);
    }
  });

  // Resolve scriptDir (mac10 repo root containing setup.sh)
  const resolvedScriptDir = scriptDir || path.join(__dirname, '..', '..');

  // Detect if running on Windows and need wsl.exe to reach WSL.
  // When Node.js is already running inside WSL, just use bash directly.
  const isWSL = process.platform === 'win32';

  // CORS -- allow cross-port requests from other mac10 GUI tabs
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Serve static files
  const guiDir = process.env.MAC10_GUI_DIR || path.join(__dirname, '..', '..', 'gui', 'public');
  app.use(express.static(guiDir));
  app.use(express.json());

  // API endpoints
  app.get('/api/status', (req, res) => {
    try {
      res.json(buildStatePayload({ includeLogs: true }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/requests', (req, res) => {
    try {
      res.json(db.listRequests(req.query.status));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/requests/:id', (req, res) => {
    try {
      const request = db.getRequest(req.params.id);
      if (!request) return res.status(404).json({ error: 'Not found' });
      const { tasks: hydratedTasks } = listHydratedTasks({ request_id: req.params.id });
      res.json({ ...request, tasks: hydratedTasks });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/workers', (req, res) => {
    try {
      res.json(db.getAllWorkers());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/tasks', (req, res) => {
    try {
      const { tasks: hydratedTasks } = listHydratedTasks(req.query);
      res.json(hydratedTasks);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/log', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
      res.json(db.getLog(limit, req.query.actor));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/request', (req, res) => {
    try {
      const { description } = req.body;
      if (!description || typeof description !== 'string') {
        return res.status(400).json({ ok: false, error: 'description is required and must be a string' });
      }
      const id = db.createRequest(description);
      res.json({ ok: true, request_id: id });
      broadcast({ type: 'request_created', request_id: id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Setup endpoints ---

  app.get('/api/config', (req, res) => {
    try {
      const storedDir = db.getConfig('project_dir');
      const storedWorkers = db.getConfig('num_workers');
      const storedRepo = db.getConfig('github_repo');
      const setupDone = db.getConfig('setup_complete');
      res.json({
        projectDir: storedDir || projectDir || '',
        numWorkers: storedWorkers ? parseInt(storedWorkers) : 4,
        githubRepo: storedRepo || '',
        setupComplete: setupDone === '1',
        scriptDir: resolvedScriptDir,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save config without running full setup
  app.post('/api/config', (req, res) => {
    try {
      const { projectDir: newDir, githubRepo, numWorkers } = req.body;
      if (newDir) {
        if (!SAFE_PATH_RE.test(newDir)) {
          return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
        }
        db.setConfig('project_dir', newDir);
      }
      if (githubRepo !== undefined) {
        if (githubRepo && !REPO_RE.test(githubRepo)) {
          return res.status(400).json({ ok: false, error: 'Invalid GitHub repo format. Expected owner/repo.' });
        }
        db.setConfig('github_repo', githubRepo);
      }
      if (numWorkers !== undefined) {
        db.setConfig('num_workers', String(Math.min(Math.max(parseInt(numWorkers) || 4, 1), 8)));
      }
      // Auto-save as preset when both project dir and repo are set
      const dir = newDir || db.getConfig('project_dir');
      const repo = githubRepo !== undefined ? githubRepo : db.getConfig('github_repo');
      const workers = numWorkers !== undefined ? Math.min(Math.max(parseInt(numWorkers) || 4, 1), 8) : parseInt(db.getConfig('num_workers') || '4');
      if (dir && repo) {
        const presetName = repo || path.basename(dir);
        db.savePreset(presetName, dir, repo, workers);
      }
      db.log('gui', 'config_updated', { projectDir: newDir, githubRepo, numWorkers });
      res.json({ ok: true, message: 'Config saved. Relaunch masters to apply.' });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- Preset endpoints ---

  app.get('/api/presets', (req, res) => {
    try {
      res.json(db.listPresets());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/presets', (req, res) => {
    try {
      const { name, projectDir: dir, githubRepo, numWorkers } = req.body;
      if (!name || !dir) {
        return res.status(400).json({ ok: false, error: 'name and projectDir are required' });
      }
      if (!SAFE_PATH_RE.test(dir)) {
        return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
      }
      if (githubRepo && !REPO_RE.test(githubRepo)) {
        return res.status(400).json({ ok: false, error: 'Invalid GitHub repo format' });
      }
      db.savePreset(name, dir, githubRepo || '', parseInt(numWorkers) || 4);
      db.log('gui', 'preset_saved', { name, projectDir: dir, githubRepo });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.delete('/api/presets/:id', (req, res) => {
    try {
      const id = parseStrictPositiveIntegerParam(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'Invalid preset id' });
      const deleted = db.deletePreset(id);
      if (!deleted) return res.status(404).json({ ok: false, error: 'Preset not found' });
      db.log('gui', 'preset_deleted', { id });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/setup', (req, res) => {
    const { projectDir: reqProjectDir, githubRepo, numWorkers } = req.body;
    if (!reqProjectDir) {
      return res.status(400).json({ ok: false, error: 'projectDir is required' });
    }
    if (!SAFE_PATH_RE.test(reqProjectDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
    }
    if (githubRepo && !REPO_RE.test(githubRepo)) {
      return res.status(400).json({ ok: false, error: 'Invalid GitHub repo format. Expected owner/repo.' });
    }
    if (setupProcess) {
      return res.status(409).json({ ok: false, error: 'Setup is already running' });
    }

    const workers = Math.min(Math.max(parseInt(numWorkers) || 4, 1), 8);
    const setupScript = path.join(resolvedScriptDir, 'setup.sh');

    // Save config
    try {
      db.setConfig('project_dir', reqProjectDir);
      db.setConfig('num_workers', String(workers));
      db.setConfig('setup_complete', '0');
      if (githubRepo) {
        db.setConfig('github_repo', githubRepo);
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to save config: ' + e.message });
    }

    db.log('gui', 'setup_started', { projectDir: reqProjectDir, numWorkers: workers });
    broadcast({ type: 'setup_log', line: `Starting setup: ${setupScript} ${reqProjectDir} ${workers}` });

    // Spawn setup.sh
    const env = Object.assign({}, process.env, {
      MAC10_GUI_DIR: path.join(resolvedScriptDir, 'gui', 'public'),
    });

    if (isWSL) {
      const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
      setupProcess = spawn('wsl.exe', ['-d', distro, '--', 'bash', setupScript, reqProjectDir, String(workers)], {
        cwd: resolvedScriptDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      setupProcess = spawn('bash', [setupScript, reqProjectDir, String(workers)], {
        cwd: resolvedScriptDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }

    // Stream stdout
    let buffer = '';
    setupProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer
      for (const line of lines) {
        broadcast({ type: 'setup_log', line });
      }
    });

    // Stream stderr
    let errBuffer = '';
    setupProcess.stderr.on('data', (chunk) => {
      errBuffer += chunk.toString();
      const lines = errBuffer.split('\n');
      errBuffer = lines.pop();
      for (const line of lines) {
        broadcast({ type: 'setup_log', line: '[stderr] ' + line });
      }
    });

    setupProcess.on('close', (code) => {
      // Flush remaining buffers
      if (buffer) broadcast({ type: 'setup_log', line: buffer });
      if (errBuffer) broadcast({ type: 'setup_log', line: '[stderr] ' + errBuffer });

      if (code === 0) {
        try {
          db.setConfig('setup_complete', '1');
          // Auto-save as preset on successful setup
          const dir = db.getConfig('project_dir');
          const repo = db.getConfig('github_repo');
          const w = parseInt(db.getConfig('num_workers') || '4');
          if (dir && repo) {
            db.savePreset(repo || path.basename(dir), dir, repo, w);
          }
        } catch {}
      }
      db.log('gui', 'setup_finished', { code });
      broadcast({ type: 'setup_complete', code: code || 0 });
      setupProcess = null;
    });

    setupProcess.on('error', (err) => {
      broadcast({ type: 'setup_log', line: '[error] ' + err.message });
      broadcast({ type: 'setup_complete', code: 1 });
      db.log('gui', 'setup_error', { error: err.message });
      setupProcess = null;
    });

    res.json({ ok: true, message: 'Setup started' });
  });

  // --- Agent launch helper ---
  // Uses launch-agent.sh wrapper to avoid semicolons in WT command line
  // (Windows Terminal treats `;` as its own command separator)

  const launchScript = path.join(resolvedScriptDir, 'scripts', 'launch-agent.sh');

  function launchAgent(title, windowName, modelAlias, slashCmd, logTag, res) {
    const repoDir = db.getConfig('project_dir') || projectDir;
    if (!repoDir) {
      return res.status(400).json({ ok: false, error: 'No project directory configured' });
    }
    if (!SAFE_PATH_RE.test(repoDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
    }
    if (!fs.existsSync(repoDir)) {
      return res.status(400).json({ ok: false, error: 'Project directory does not exist' });
    }

    if (isWSL) {
      const user = process.env.USER || process.env.LOGNAME || 'owner';
      const wt = `/mnt/c/Users/${user}/AppData/Local/Microsoft/WindowsApps/wt.exe`;
      const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';

      const proc = spawn(wt, [
        '-w', '0', 'new-tab', '--title', title, '--',
        'wsl.exe', '-d', distro, '--',
        'bash', launchScript, repoDir, modelAlias, slashCmd
      ], {
        stdio: 'ignore',
        detached: true,
      });
      proc.unref();

      db.log('gui', logTag, { projectDir: repoDir });
      return res.json({ ok: true, message: `${title} terminal opened` });
    }

    // macOS / Linux: open in tmux
    const tmux = require('./tmux');
    try {
      tmux.createWindow(windowName, `bash "${launchScript}" "${repoDir}" ${modelAlias} ${slashCmd}`, repoDir);
      db.log('gui', logTag, { projectDir: repoDir, method: 'tmux' });
      return res.json({ ok: true, message: `${title} launched in tmux window "${windowName}"` });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // --- Architect (Master-2) launch endpoint ---

  app.post('/api/architect/launch', (req, res) => {
    launchAgent('Master-2 (Architect)', 'architect', 'deep', '/architect-loop', 'architect_launched', res);
  });

  // --- Master-1 (Interface) launch endpoint ---

  app.post('/api/master1/launch', (req, res) => {
    launchAgent('Master-1 (Interface)', 'master-1', 'fast', '/master-loop', 'master1_launched', res);
  });

  // --- Master-3 (Allocator) launch endpoint ---

  app.post('/api/master3/launch', (req, res) => {
    launchAgent('Master-3 (Allocator)', 'master-3', 'fast', '/allocate-loop', 'master3_launched', res);
  });

  // --- Git push endpoint ---

  app.post('/api/git/push', (req, res) => {
    const repoDir = db.getConfig('project_dir') || projectDir;
    const repo = db.getConfig('github_repo');
    if (!repoDir) {
      return res.status(400).json({ ok: false, error: 'No project directory configured' });
    }
    if (!SAFE_PATH_RE.test(repoDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
    }
    if (!repo) {
      return res.status(400).json({ ok: false, error: 'No GitHub repo configured. Set it in the Setup panel.' });
    }
    if (!REPO_RE.test(repo)) {
      return res.status(400).json({ ok: false, error: 'Invalid GitHub repo format. Expected owner/repo.' });
    }

    db.log('gui', 'git_push_started', { repo, projectDir: repoDir });

    // Ensure remote is set, then push
    // Uses env vars (MAC10_REPO, MAC10_REPO_DIR) to avoid shell interpolation
    const script = [
      'set -e',
      'CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")',
      'TARGET="https://github.com/${MAC10_REPO}.git"',
      'SSH_TARGET="git@github.com:${MAC10_REPO}.git"',
      'if [ "$CURRENT_REMOTE" != "$TARGET" ] && [ "$CURRENT_REMOTE" != "$SSH_TARGET" ]; then',
      '  if [ -z "$CURRENT_REMOTE" ]; then',
      '    git remote add origin "$TARGET"',
      '    echo "Added remote origin: $TARGET"',
      '  else',
      '    git remote set-url origin "$TARGET"',
      '    echo "Updated remote origin: $TARGET"',
      '  fi',
      'fi',
      'echo "Remote: $(git remote get-url origin)"',
      'echo "Branch: $(git branch --show-current)"',
      'echo ""',
      'git push -u origin "$(git branch --show-current)" 2>&1',
    ].join('\n');

    const pushEnv = { ...process.env, MAC10_REPO: repo, MAC10_REPO_DIR: repoDir };
    let pushProc;
    if (isWSL) {
      const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
      pushProc = spawn('wsl.exe', ['-d', distro, '--', 'bash', '-c', script], {
        cwd: repoDir,
        env: pushEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      pushProc = spawn('bash', ['-c', script], {
        cwd: repoDir,
        env: pushEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }

    let buf = '';
    pushProc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        broadcast({ type: 'git_push_log', line });
      }
    });

    let errBuf = '';
    pushProc.stderr.on('data', (chunk) => {
      errBuf += chunk.toString();
      const lines = errBuf.split('\n');
      errBuf = lines.pop();
      for (const line of lines) {
        broadcast({ type: 'git_push_log', line });
      }
    });

    pushProc.on('close', (code) => {
      if (buf) broadcast({ type: 'git_push_log', line: buf });
      if (errBuf) broadcast({ type: 'git_push_log', line: errBuf });
      db.log('gui', 'git_push_finished', { code, repo });
      broadcast({ type: 'git_push_complete', code: code || 0 });
    });

    pushProc.on('error', (err) => {
      broadcast({ type: 'git_push_log', line: 'Error: ' + err.message });
      broadcast({ type: 'git_push_complete', code: 1 });
      db.log('gui', 'git_push_error', { error: err.message });
    });

    res.json({ ok: true, message: 'Push started' });
  });

  // --- Instance management endpoints ---

  app.get('/api/instances', (req, res) => {
    try {
      const instances = instanceRegistry.list();
      res.json(instances.map(inst => ({
        ...inst,
        isSelf: inst.port === port,
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/instances/launch', async (req, res) => {
    const { projectDir: reqDir, githubRepo, numWorkers } = req.body;
    if (!reqDir) {
      return res.status(400).json({ ok: false, error: 'projectDir is required' });
    }
    if (!SAFE_PATH_RE.test(reqDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
    }

    // Check for duplicate
    const existing = instanceRegistry.findByProject(reqDir, namespace);
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: `A coordinator is already running for this project in namespace "${namespace}"`,
        port: existing.port,
      });
    }

    try {
      // Validate project directory exists (do not create arbitrary directories)
      if (!fs.existsSync(reqDir)) {
        return res.status(400).json({ ok: false, error: 'Project directory does not exist' });
      }

      const newPort = await instanceRegistry.acquirePort(3100);
      const env = { ...process.env, MAC10_PORT: String(newPort), MAC10_NAMESPACE: namespace };

      const indexPath = path.join(__dirname, 'index.js');
      let child;
      if (isWSL) {
        const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
        child = spawn('wsl.exe', ['-d', distro, '--', 'node', indexPath, reqDir], {
          env,
          stdio: 'ignore',
          detached: true,
        });
      } else {
        child = spawn('node', [indexPath, reqDir], {
          env,
          stdio: 'ignore',
          detached: true,
        });
      }
      child.unref();

      const childPid = child.pid;
      const readiness = await waitForCoordinatorReady(newPort, childPid);
      if (!readiness.ok) {
        cleanupFailedLaunch(childPid, newPort);
        return res.status(502).json({
          ok: false,
          stage: 'startup',
          port: newPort,
          error: 'Launched coordinator failed readiness verification',
          details: readiness.error,
        });
      }

      const seedConfig = await seedCoordinatorConfig(newPort, {
        projectDir: reqDir,
        githubRepo: githubRepo || '',
        numWorkers: parseInt(numWorkers) || 4,
      });
      if (!seedConfig.ok) {
        cleanupFailedLaunch(childPid, newPort);
        return res.status(502).json({
          ok: false,
          stage: 'config_seed',
          port: newPort,
          error: 'Launched coordinator failed config seeding',
          details: seedConfig.error,
          statusCode: seedConfig.statusCode,
        });
      }

      const name = path.basename(reqDir);
      db.log('gui', 'instance_launched', { projectDir: reqDir, port: newPort, githubRepo });
      res.json({ ok: true, port: newPort, name });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/instances/stop', (req, res) => {
    const { port: targetPort } = req.body;
    if (!targetPort || targetPort === port) {
      return res.status(400).json({ ok: false, error: 'Cannot stop self or missing port' });
    }
    try {
      const instances = instanceRegistry.list();
      const target = instances.find(i => i.port === targetPort);
      if (!target) {
        return res.status(404).json({ ok: false, error: 'Instance not found' });
      }
      if (!Number.isInteger(target.pid) || target.pid <= 0) {
        return res.status(400).json({ ok: false, error: 'Invalid PID for target instance' });
      }
      try {
        process.kill(target.pid, 'SIGTERM');
      } catch {}
      instanceRegistry.deregister(targetPort);
      db.log('gui', 'instance_stopped', { port: targetPort, pid: target.pid });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- Changes endpoints ---

  app.get('/api/changes', (req, res) => {
    try {
      const filters = {};
      if (req.query.domain) filters.domain = req.query.domain;
      if (req.query.status) filters.status = req.query.status;
      res.json(db.listChanges(filters));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/changes', (req, res) => {
    try {
      const { description, domain, file_path, function_name, tooltip, status } = req.body;
      if (!description) {
        return res.status(400).json({ ok: false, error: 'description is required' });
      }
      const id = db.createChange({ description, domain, file_path, function_name, tooltip, status });
      const change = db.getChange(id);
      db.log('gui', 'change_created', { change_id: id, description });
      broadcast({ type: 'change_created', change });
      res.json({ ok: true, change_id: id, change });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.patch('/api/changes/:id', (req, res) => {
    try {
      const id = parseStrictPositiveIntegerParam(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'Invalid change id' });
      const existing = db.getChange(id);
      if (!existing) return res.status(404).json({ ok: false, error: 'Change not found' });
      const allowed = ['enabled', 'status', 'description', 'tooltip'];
      const fields = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) fields[k] = req.body[k];
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ ok: false, error: 'No valid fields to update' });
      }
      db.updateChange(id, fields);
      const updated = db.getChange(id);
      broadcast({ type: 'change_updated', change: updated });
      res.json({ ok: true, change: updated });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- Loop endpoints ---

  app.get('/api/loops', (req, res) => {
    try {
      const status = req.query.status || undefined;
      res.json(db.listLoops(status));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/loops/:id', (req, res) => {
    try {
      const loop = db.getLoop(parseInt(req.params.id));
      if (!loop) return res.status(404).json({ error: 'Loop not found' });
      res.json(loop);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/loops', (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ ok: false, error: 'prompt is required and must be a string' });
      }
      const id = db.createLoop(prompt);
      if (handlers.onLoopCreated) handlers.onLoopCreated(id, prompt);
      broadcast({ type: 'loop_created', loop_id: id });
      res.json({ ok: true, loop_id: id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/loops/:id/stop', (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const loop = db.getLoop(id);
      if (!loop) return res.status(404).json({ ok: false, error: 'Loop not found' });
      db.stopLoop(id);
      broadcast({ type: 'loop_stopped', loop_id: id });
      res.json({ ok: true, loop_id: id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // WebSocket for live updates
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {}); // prevent unhandled error crashes

    // Send initial state
    try {
      ws.send(JSON.stringify({
        type: 'init',
        data: buildStatePayload({ includeLoops: true }),
      }));
    } catch {}
  });

  // Periodic broadcast of state
  broadcastIntervalId = setInterval(() => {
    broadcast({
      type: 'state',
      data: buildStatePayload({ includeLoops: true }),
    });
  }, 2000);

  // Ping/pong to detect and terminate stale WebSocket connections
  pingIntervalId = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 30000);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`WARNING: Port ${port} already in use — web dashboard not started. Coordinator continues without GUI.`);
      db.log('coordinator', 'web_server_port_conflict', { port, error: err.message });
    } else {
      console.error(`Web server error: ${err.message}`);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    db.log('coordinator', 'web_server_started', { port, host: '127.0.0.1' });
  });

  return server;
}

function broadcast(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  });
}

function stop() {
  if (broadcastIntervalId) { clearInterval(broadcastIntervalId); broadcastIntervalId = null; }
  if (pingIntervalId) { clearInterval(pingIntervalId); pingIntervalId = null; }
  if (setupProcess) {
    try { setupProcess.kill(); } catch {}
    setupProcess = null;
  }
  if (wss) { wss.close(); wss = null; }
  if (server) { server.close(); server = null; }
}

module.exports = { start, stop, broadcast };
