'use strict';

function handleLoopCommand(command, args, deps) {
  const {
    db,
    handlers = {},
    bridgeToHandoff,
    getLoopSyncWithOriginConfig,
    normalizeLoopRequestSetConfigValue,
    parseBudgetStateConfig,
    syncBudgetStateFromScalarFallback,
    clampWorkerLimit,
    constants,
  } = deps;

  const {
    LOOP_SYNC_WITH_ORIGIN_KEY,
    ROUTING_BUDGET_STATE_KEY,
    ROUTING_BUDGET_REMAINING_KEY,
    ROUTING_BUDGET_THRESHOLD_KEY,
    LEGACY_BUDGET_REMAINING_KEY,
    LEGACY_BUDGET_THRESHOLD_KEY,
    ROUTING_BUDGET_SCALAR_LEGACY_KEY_MAP,
    SPARK_MODEL_KEYS,
  } = constants;

  switch (command) {
    case 'loop': {
      const prompt = args.prompt;
      if (prompt.trim().length === 0) {
        return { ok: false, error: 'prompt must be a non-empty string' };
      }
      const loopId = db.createLoop(prompt);
      if (handlers.onLoopCreated) handlers.onLoopCreated(loopId, prompt);
      return { ok: true, loop_id: loopId };
    }

    case 'stop-loop': {
      const loop = db.getLoop(args.loop_id);
      if (!loop) {
        return { ok: false, error: 'Loop not found' };
      }
      db.stopLoop(args.loop_id);
      return { ok: true, loop_id: args.loop_id };
    }

    case 'loop-status': {
      const loops = db.listLoops();
      return { ok: true, loops };
    }

    case 'loop-checkpoint': {
      const cpLoop = db.getLoop(args.loop_id);
      if (!cpLoop) {
        return { ok: false, error: 'Loop not found' };
      }
      if (cpLoop.status !== 'active') {
        return { ok: false, error: `Loop is ${cpLoop.status}, not active` };
      }
      db.updateLoop(args.loop_id, {
        last_checkpoint: args.summary,
        iteration_count: cpLoop.iteration_count + 1,
        last_heartbeat: new Date().toISOString(),
      });
      db.log('coordinator', 'loop_checkpoint', {
        loop_id: args.loop_id,
        iteration: cpLoop.iteration_count + 1,
        summary: args.summary.slice(0, 200),
      });
      return { ok: true, iteration: cpLoop.iteration_count + 1 };
    }

    case 'loop-heartbeat': {
      const hbLoop = db.getLoop(args.loop_id);
      if (!hbLoop) {
        return { ok: false, error: 'Loop not found' };
      }
      if (hbLoop.status !== 'active') {
        return { ok: false, error: `Loop is ${hbLoop.status}, not active` };
      }
      db.updateLoop(args.loop_id, { last_heartbeat: new Date().toISOString() });
      return { ok: true, status: hbLoop.status };
    }

    case 'set-config': {
      const { key, value } = args;
      // Allowlist of configurable keys to prevent arbitrary DB manipulation
      const ALLOWED_KEYS = [
        'watchdog_warn_sec', 'watchdog_nudge_sec', 'watchdog_triage_sec', 'watchdog_terminate_sec',
        'watchdog_interval_ms', 'allocator_interval_ms', 'max_workers',
        'primary_branch',
        LOOP_SYNC_WITH_ORIGIN_KEY,
        'loop_request_quality_gate',
        'loop_request_min_description_chars',
        'loop_request_min_interval_sec',
        'loop_request_max_per_hour',
        'loop_request_similarity_threshold',
        'model_flagship', 'model_spark', 'model_mini',
        'model_xhigh', 'model_high', 'model_mid',
        'reasoning_xhigh', 'reasoning_high', 'reasoning_mid', 'reasoning_spark', 'reasoning_mini',
        ROUTING_BUDGET_STATE_KEY,
        ROUTING_BUDGET_REMAINING_KEY,
        ROUTING_BUDGET_THRESHOLD_KEY,
      ];
      if (!ALLOWED_KEYS.includes(key)) {
        return { error: `Key '${key}' is not configurable. Allowed: ${ALLOWED_KEYS.join(', ')}` };
      }
      const dbConn = db.getDb();
      const upsertConfig = dbConn.prepare('INSERT INTO config(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      const normalizedLoopConfigValue = normalizeLoopRequestSetConfigValue(key, value);
      if (!normalizedLoopConfigValue.ok) {
        return { error: normalizedLoopConfigValue.error };
      }

      let storedValue = normalizedLoopConfigValue.value;
      const isSparkModelKey = SPARK_MODEL_KEYS.includes(key);
      if (key === 'max_workers') {
        storedValue = String(clampWorkerLimit(value));
        upsertConfig.run('max_workers', storedValue);
        upsertConfig.run('num_workers', storedValue);
      } else {
        if (key === ROUTING_BUDGET_STATE_KEY) {
          const parsedState = parseBudgetStateConfig(value);
          if (parsedState.parsed) {
            storedValue = JSON.stringify(parsedState.parsed);
          }
        }
        if (isSparkModelKey) {
          for (const sparkModelKey of SPARK_MODEL_KEYS) {
            upsertConfig.run(sparkModelKey, storedValue);
          }
        } else {
          upsertConfig.run(key, storedValue);
        }
      }

      if (key === ROUTING_BUDGET_STATE_KEY) {
        const parsedState = parseBudgetStateConfig(storedValue);
        if (parsedState.remaining !== null) {
          db.setConfig(ROUTING_BUDGET_REMAINING_KEY, String(parsedState.remaining));
          db.setConfig(LEGACY_BUDGET_REMAINING_KEY, String(parsedState.remaining));
        }
        if (parsedState.threshold !== null) {
          db.setConfig(ROUTING_BUDGET_THRESHOLD_KEY, String(parsedState.threshold));
          db.setConfig(LEGACY_BUDGET_THRESHOLD_KEY, String(parsedState.threshold));
        }
      } else if (Object.prototype.hasOwnProperty.call(ROUTING_BUDGET_SCALAR_LEGACY_KEY_MAP, key)) {
        const legacyKey = ROUTING_BUDGET_SCALAR_LEGACY_KEY_MAP[key];
        db.setConfig(legacyKey, storedValue);
        const synchronizedState = syncBudgetStateFromScalarFallback(
          db.getConfig(ROUTING_BUDGET_STATE_KEY),
          db.getConfig
        );
        db.setConfig(ROUTING_BUDGET_STATE_KEY, JSON.stringify(synchronizedState));
      }

      db.log('coordinator', 'config_set', { key, value: storedValue });
      return { ok: true, key, value: storedValue };
    }

    case 'loop-prompt': {
      const promptLoop = db.getLoop(args.loop_id);
      if (!promptLoop) {
        return { ok: false, error: 'Loop not found' };
      }
      return {
        ok: true,
        loop_id: promptLoop.id,
        prompt: promptLoop.prompt,
        status: promptLoop.status,
        last_checkpoint: promptLoop.last_checkpoint,
        iteration_count: promptLoop.iteration_count,
        loop_sync_with_origin: getLoopSyncWithOriginConfig(),
      };
    }

    case 'loop-refresh-prompt': {
      const refreshed = db.refreshLoopPrompt(args.loop_id, args.prompt);
      if (!refreshed.ok) {
        return { ok: false, error: refreshed.error };
      }
      db.log('coordinator', 'loop_prompt_refreshed', {
        loop_id: args.loop_id,
        result: 'updated',
        status: refreshed.loop.status,
        prompt_preview: refreshed.loop.prompt.slice(0, 200),
      });
      return {
        ok: true,
        loop_id: refreshed.loop.id,
        prompt: refreshed.loop.prompt,
        status: refreshed.loop.status,
        last_checkpoint: refreshed.loop.last_checkpoint,
        iteration_count: refreshed.loop.iteration_count,
      };
    }

    case 'loop-set-prompt': {
      const updated = db.setLoopPrompt(args.loop_id, args.prompt, ['active', 'paused']);
      if (!updated.ok) {
        return { ok: false, error: updated.error };
      }
      db.log('coordinator', 'loop_prompt_updated', {
        loop_id: args.loop_id,
        status: updated.loop.status,
        prompt_preview: updated.loop.prompt.slice(0, 200),
      });
      return {
        ok: true,
        loop_id: updated.loop.id,
        prompt: updated.loop.prompt,
        status: updated.loop.status,
        last_checkpoint: updated.loop.last_checkpoint,
        iteration_count: updated.loop.iteration_count,
      };
    }

    case 'loop-request': {
      const lrLoop = db.getLoop(args.loop_id);
      if (!lrLoop) {
        return { ok: false, error: 'Loop not found' };
      }
      if (lrLoop.status !== 'active') {
        return { ok: false, error: `Loop is ${lrLoop.status}, not active` };
      }
      const lrResult = db.createLoopRequest(args.description, args.loop_id);
      if (!lrResult.deduplicated) bridgeToHandoff(lrResult.id, args.description);
      return {
        ok: true,
        request_id: lrResult.id,
        deduplicated: lrResult.deduplicated,
        superseded_target: lrResult.superseded_target || null,
      };
    }

    case 'loop-requests': {
      const lrqLoop = db.getLoop(args.loop_id);
      if (!lrqLoop) {
        return { ok: false, error: 'Loop not found' };
      }
      const loopReqs = db.listLoopRequests(args.loop_id);
      return { ok: true, requests: loopReqs };
    }

    default:
      throw new Error(`Unknown loop command: ${command}`);
  }
}

module.exports = {
  handleLoopCommand,
};
