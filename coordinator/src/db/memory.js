'use strict';

function createMemoryRepository(context) {
  const {
    getDb,
    log,
    currentSqlTimestamp,
    normalizeStructuredPayload,
    normalizeOptionalLineageId,
    normalizeProjectMemoryLineageType,
    normalizeProjectMemoryFingerprint,
    normalizeProjectMemoryRelevanceScore,
    normalizeOptionalText,
    normalizeProjectMemoryConfidenceScore,
    normalizeProjectMemoryValidationStatus,
    normalizePositiveInt,
  } = context;

  function normalizeProjectContextKey(projectContextKey) {
    const normalized = String(projectContextKey || '').trim();
    if (!normalized) {
      throw new Error('project_context_key is required');
    }
    return normalized;
  }

  function upsertProjectMemorySnapshotIndexEntry(database, snapshotRow) {
    database.prepare(`
      INSERT INTO project_memory_snapshot_index (
        project_context_key,
        latest_snapshot_id,
        latest_snapshot_version,
        latest_iteration,
        latest_snapshot_created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_context_key) DO UPDATE SET
        latest_snapshot_id = excluded.latest_snapshot_id,
        latest_snapshot_version = excluded.latest_snapshot_version,
        latest_iteration = excluded.latest_iteration,
        latest_snapshot_created_at = excluded.latest_snapshot_created_at,
        updated_at = excluded.updated_at
    `).run(
      snapshotRow.project_context_key,
      snapshotRow.id,
      snapshotRow.snapshot_version,
      snapshotRow.iteration,
      snapshotRow.created_at,
      currentSqlTimestamp()
    );
  }

  function insertProjectMemoryLineageLink(
    database,
    {
      snapshot_id = null,
      insight_artifact_id = null,
      request_id = null,
      task_id = null,
      run_id = null,
      lineage_type = 'origin',
      metadata = null,
    } = {}
  ) {
    const parsedSnapshotId = Number.parseInt(snapshot_id, 10);
    const normalizedSnapshotId = Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0
      ? parsedSnapshotId
      : null;
    const parsedInsightId = Number.parseInt(insight_artifact_id, 10);
    const normalizedInsightArtifactId = Number.isInteger(parsedInsightId) && parsedInsightId > 0
      ? parsedInsightId
      : null;
    if (!normalizedSnapshotId && !normalizedInsightArtifactId) {
      throw new Error('snapshot_id or insight_artifact_id is required for lineage link');
    }
    const normalizedRequestId = normalizeOptionalLineageId(request_id, 'request_id');
    const normalizedTaskId = normalizeOptionalLineageId(task_id, 'task_id');
    const normalizedRunId = normalizeOptionalLineageId(run_id, 'run_id');
    const normalizedLineageType = normalizeProjectMemoryLineageType(lineage_type, 'origin');
    const normalizedMetadata = metadata === null || metadata === undefined
      ? null
      : normalizeStructuredPayload(metadata, '{}');
    const result = database.prepare(`
      INSERT INTO project_memory_lineage_links (
        snapshot_id,
        insight_artifact_id,
        request_id,
        task_id,
        run_id,
        lineage_type,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizedSnapshotId,
      normalizedInsightArtifactId,
      normalizedRequestId,
      normalizedTaskId,
      normalizedRunId,
      normalizedLineageType,
      normalizedMetadata
    );
    return Number(result.lastInsertRowid);
  }

  function createProjectMemorySnapshot({
    project_context_key = null,
    snapshot_payload = null,
    snapshot_version = null,
    iteration = null,
    parent_snapshot_id = null,
    dedupe_fingerprint = null,
    relevance_score = null,
    request_id = null,
    task_id = null,
    run_id = null,
    source = null,
    confidence_score = null,
    validation_status = 'unvalidated',
    retention_policy = 'retain',
    retention_until = null,
    governance_metadata = null,
    lineage_type = 'origin',
    lineage_metadata = null,
  } = {}) {
    const normalizedProjectContextKey = normalizeProjectContextKey(project_context_key);
    const normalizedSnapshotPayload = normalizeStructuredPayload(snapshot_payload, '{}');
    const normalizedFingerprint = normalizeProjectMemoryFingerprint(
      `snapshot:${normalizedProjectContextKey}`,
      normalizedSnapshotPayload,
      dedupe_fingerprint
    );
    const normalizedRelevanceScore = normalizeProjectMemoryRelevanceScore(relevance_score, 0);
    const normalizedRequestId = normalizeOptionalLineageId(request_id, 'request_id');
    const normalizedTaskId = normalizeOptionalLineageId(task_id, 'task_id');
    const normalizedRunId = normalizeOptionalLineageId(run_id, 'run_id');
    const normalizedSource = normalizeOptionalText(source);
    const normalizedConfidenceScore = normalizeProjectMemoryConfidenceScore(confidence_score);
    const normalizedValidationStatus = normalizeProjectMemoryValidationStatus(validation_status, 'unvalidated');
    const normalizedRetentionPolicy = normalizeOptionalText(retention_policy) || 'retain';
    const normalizedRetentionUntil = normalizeOptionalText(retention_until);
    const normalizedGovernanceMetadata = governance_metadata === null || governance_metadata === undefined
      ? null
      : normalizeStructuredPayload(governance_metadata, '{}');
    const now = currentSqlTimestamp();
    const d = getDb();

    const created = d.transaction(() => {
      const latest = d.prepare(`
        SELECT *
        FROM project_memory_snapshots
        WHERE project_context_key = ?
        ORDER BY snapshot_version DESC, datetime(created_at) DESC, id DESC
        LIMIT 1
      `).get(normalizedProjectContextKey);
      const latestVersion = Number(latest?.snapshot_version) || 0;
      const parsedSnapshotVersion = Number.parseInt(String(snapshot_version ?? ''), 10);
      const normalizedSnapshotVersion = Number.isInteger(parsedSnapshotVersion) && parsedSnapshotVersion > 0
        ? parsedSnapshotVersion
        : (latestVersion + 1);
      if (normalizedSnapshotVersion <= latestVersion) {
        throw new Error(
          `snapshot_version ${normalizedSnapshotVersion} must be greater than latest version ${latestVersion}`
        );
      }

      const parsedParentSnapshotId = Number.parseInt(String(parent_snapshot_id ?? ''), 10);
      const normalizedParentSnapshotId = Number.isInteger(parsedParentSnapshotId) && parsedParentSnapshotId > 0
        ? parsedParentSnapshotId
        : (latest ? latest.id : null);
      if (normalizedParentSnapshotId) {
        const parentSnapshot = d.prepare('SELECT id FROM project_memory_snapshots WHERE id = ?').get(normalizedParentSnapshotId);
        if (!parentSnapshot) {
          throw new Error(`parent_snapshot_id ${normalizedParentSnapshotId} not found`);
        }
      }

      const parsedIteration = Number.parseInt(String(iteration ?? ''), 10);
      const normalizedIteration = Number.isInteger(parsedIteration) && parsedIteration > 0
        ? parsedIteration
        : normalizedSnapshotVersion;

      const insertResult = d.prepare(`
        INSERT INTO project_memory_snapshots (
          project_context_key,
          snapshot_version,
          iteration,
          parent_snapshot_id,
          snapshot_payload,
          dedupe_fingerprint,
          relevance_score,
          request_id,
          task_id,
          run_id,
          source,
          confidence_score,
          validation_status,
          retention_policy,
          retention_until,
          governance_metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalizedProjectContextKey,
        normalizedSnapshotVersion,
        normalizedIteration,
        normalizedParentSnapshotId,
        normalizedSnapshotPayload,
        normalizedFingerprint,
        normalizedRelevanceScore,
        normalizedRequestId,
        normalizedTaskId,
        normalizedRunId,
        normalizedSource,
        normalizedConfidenceScore,
        normalizedValidationStatus,
        normalizedRetentionPolicy,
        normalizedRetentionUntil,
        normalizedGovernanceMetadata,
        now
      );
      const snapshotId = Number(insertResult.lastInsertRowid);
      const snapshot = d.prepare('SELECT * FROM project_memory_snapshots WHERE id = ?').get(snapshotId);
      upsertProjectMemorySnapshotIndexEntry(d, snapshot);
      const lineageLinkId = (
        normalizedRequestId || normalizedTaskId || normalizedRunId
      )
        ? insertProjectMemoryLineageLink(d, {
          snapshot_id: snapshotId,
          request_id: normalizedRequestId,
          task_id: normalizedTaskId,
          run_id: normalizedRunId,
          lineage_type,
          metadata: lineage_metadata,
        })
        : null;
      return {
        ...snapshot,
        lineage_link_id: lineageLinkId,
      };
    })();

    log('coordinator', 'project_memory_snapshot_created', {
      snapshot_id: created.id,
      project_context_key: created.project_context_key,
      snapshot_version: created.snapshot_version,
      dedupe_fingerprint: created.dedupe_fingerprint,
      request_id: created.request_id,
      task_id: created.task_id,
      run_id: created.run_id,
    });
    return created;
  }

  function getProjectMemorySnapshot(id) {
    return getDb().prepare('SELECT * FROM project_memory_snapshots WHERE id = ?').get(id);
  }

  function getLatestProjectMemorySnapshot(project_context_key) {
    const normalizedProjectContextKey = normalizeProjectContextKey(project_context_key);
    const indexed = getDb().prepare(`
      SELECT pms.*
      FROM project_memory_snapshot_index pmsi
      JOIN project_memory_snapshots pms ON pms.id = pmsi.latest_snapshot_id
      WHERE pmsi.project_context_key = ?
    `).get(normalizedProjectContextKey);
    if (indexed) return indexed;
    return getDb().prepare(`
      SELECT *
      FROM project_memory_snapshots
      WHERE project_context_key = ?
      ORDER BY snapshot_version DESC, datetime(created_at) DESC, id DESC
      LIMIT 1
    `).get(normalizedProjectContextKey) || null;
  }

  function listProjectMemorySnapshots({
    project_context_key = null,
    request_id = null,
    task_id = null,
    run_id = null,
    dedupe_fingerprint = null,
    validation_status = null,
    min_relevance_score = null,
    limit = 100,
    offset = 0,
  } = {}) {
    const normalizedLimit = normalizePositiveInt(limit, 100, { min: 1, max: 1000 });
    const normalizedOffset = normalizePositiveInt(offset, 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
    let sql = 'SELECT * FROM project_memory_snapshots WHERE 1=1';
    const vals = [];
    if (project_context_key !== null && project_context_key !== undefined && String(project_context_key).trim()) {
      sql += ' AND project_context_key = ?';
      vals.push(normalizeProjectContextKey(project_context_key));
    }
    if (request_id !== null && request_id !== undefined && String(request_id).trim()) {
      sql += ' AND request_id = ?';
      vals.push(String(request_id).trim());
    }
    const parsedTaskId = Number.parseInt(String(task_id ?? ''), 10);
    if (Number.isInteger(parsedTaskId) && parsedTaskId > 0) {
      sql += ' AND task_id = ?';
      vals.push(parsedTaskId);
    }
    if (run_id !== null && run_id !== undefined && String(run_id).trim()) {
      sql += ' AND run_id = ?';
      vals.push(String(run_id).trim());
    }
    if (dedupe_fingerprint !== null && dedupe_fingerprint !== undefined && String(dedupe_fingerprint).trim()) {
      sql += ' AND dedupe_fingerprint = ?';
      vals.push(String(dedupe_fingerprint).trim());
    }
    if (validation_status !== null && validation_status !== undefined && String(validation_status).trim()) {
      sql += ' AND validation_status = ?';
      vals.push(normalizeProjectMemoryValidationStatus(validation_status, 'unvalidated'));
    }
    if (min_relevance_score !== null && min_relevance_score !== undefined && min_relevance_score !== '') {
      sql += ' AND relevance_score >= ?';
      vals.push(normalizeProjectMemoryRelevanceScore(min_relevance_score, 0));
    }
    sql += ' ORDER BY project_context_key ASC, snapshot_version DESC, datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?';
    vals.push(normalizedLimit, normalizedOffset);
    return getDb().prepare(sql).all(...vals);
  }

  function createInsightArtifact({
    project_context_key = null,
    snapshot_id = null,
    artifact_type = 'research_insight',
    artifact_key = null,
    artifact_version = null,
    artifact_payload = null,
    dedupe_fingerprint = null,
    relevance_score = null,
    request_id = null,
    task_id = null,
    run_id = null,
    source = null,
    confidence_score = null,
    validation_status = 'unvalidated',
    retention_policy = 'retain',
    retention_until = null,
    governance_metadata = null,
    lineage_type = 'origin',
    lineage_metadata = null,
  } = {}) {
    const normalizedArtifactType = String(artifact_type || 'research_insight').trim().toLowerCase() || 'research_insight';
    const normalizedArtifactPayload = normalizeStructuredPayload(artifact_payload, '{}');
    const normalizedArtifactKey = normalizeOptionalText(artifact_key);
    const normalizedSource = normalizeOptionalText(source);
    const normalizedRequestId = normalizeOptionalLineageId(request_id, 'request_id');
    const normalizedTaskId = normalizeOptionalLineageId(task_id, 'task_id');
    const normalizedRunId = normalizeOptionalLineageId(run_id, 'run_id');
    const normalizedConfidenceScore = normalizeProjectMemoryConfidenceScore(confidence_score);
    const normalizedValidationStatus = normalizeProjectMemoryValidationStatus(validation_status, 'unvalidated');
    const normalizedRetentionPolicy = normalizeOptionalText(retention_policy) || 'retain';
    const normalizedRetentionUntil = normalizeOptionalText(retention_until);
    const normalizedGovernanceMetadata = governance_metadata === null || governance_metadata === undefined
      ? null
      : normalizeStructuredPayload(governance_metadata, '{}');
    const parsedSnapshotId = Number.parseInt(String(snapshot_id ?? ''), 10);
    const normalizedSnapshotId = Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0
      ? parsedSnapshotId
      : null;
    const now = currentSqlTimestamp();
    const d = getDb();

    const created = d.transaction(() => {
      let inferredContextKey = normalizeOptionalText(project_context_key);
      if (normalizedSnapshotId) {
        const snapshot = d.prepare('SELECT id, project_context_key FROM project_memory_snapshots WHERE id = ?').get(normalizedSnapshotId);
        if (!snapshot) throw new Error(`snapshot_id ${normalizedSnapshotId} not found`);
        if (inferredContextKey && inferredContextKey !== snapshot.project_context_key) {
          throw new Error(
            `project_context_key ${inferredContextKey} does not match snapshot context ${snapshot.project_context_key}`
          );
        }
        inferredContextKey = snapshot.project_context_key;
      }
      const normalizedProjectContextKey = normalizeProjectContextKey(inferredContextKey);
      const normalizedFingerprint = normalizeProjectMemoryFingerprint(
        `insight:${normalizedProjectContextKey}:${normalizedArtifactType}`,
        normalizedArtifactPayload,
        dedupe_fingerprint
      );
      const normalizedRelevanceScore = normalizeProjectMemoryRelevanceScore(relevance_score, 0);
      const latestVersionRow = d.prepare(`
        SELECT MAX(artifact_version) AS max_version
        FROM insight_artifacts
        WHERE project_context_key = ?
          AND artifact_type = ?
          AND dedupe_fingerprint = ?
      `).get(normalizedProjectContextKey, normalizedArtifactType, normalizedFingerprint);
      const latestVersion = Number(latestVersionRow?.max_version) || 0;
      const parsedArtifactVersion = Number.parseInt(String(artifact_version ?? ''), 10);
      const normalizedArtifactVersion = Number.isInteger(parsedArtifactVersion) && parsedArtifactVersion > 0
        ? parsedArtifactVersion
        : (latestVersion + 1);
      if (normalizedArtifactVersion <= latestVersion) {
        throw new Error(
          `artifact_version ${normalizedArtifactVersion} must be greater than latest version ${latestVersion}`
        );
      }

      const insertResult = d.prepare(`
        INSERT INTO insight_artifacts (
          project_context_key,
          snapshot_id,
          artifact_type,
          artifact_key,
          artifact_version,
          artifact_payload,
          dedupe_fingerprint,
          relevance_score,
          request_id,
          task_id,
          run_id,
          source,
          confidence_score,
          validation_status,
          retention_policy,
          retention_until,
          governance_metadata,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalizedProjectContextKey,
        normalizedSnapshotId,
        normalizedArtifactType,
        normalizedArtifactKey,
        normalizedArtifactVersion,
        normalizedArtifactPayload,
        normalizedFingerprint,
        normalizedRelevanceScore,
        normalizedRequestId,
        normalizedTaskId,
        normalizedRunId,
        normalizedSource,
        normalizedConfidenceScore,
        normalizedValidationStatus,
        normalizedRetentionPolicy,
        normalizedRetentionUntil,
        normalizedGovernanceMetadata,
        now,
        now
      );
      const insightArtifactId = Number(insertResult.lastInsertRowid);
      const artifact = d.prepare('SELECT * FROM insight_artifacts WHERE id = ?').get(insightArtifactId);
      const lineageLinkId = (
        normalizedRequestId || normalizedTaskId || normalizedRunId || normalizedSnapshotId
      )
        ? insertProjectMemoryLineageLink(d, {
          snapshot_id: normalizedSnapshotId,
          insight_artifact_id: insightArtifactId,
          request_id: normalizedRequestId,
          task_id: normalizedTaskId,
          run_id: normalizedRunId,
          lineage_type,
          metadata: lineage_metadata,
        })
        : null;
      return {
        ...artifact,
        lineage_link_id: lineageLinkId,
      };
    })();

    log('coordinator', 'insight_artifact_created', {
      insight_artifact_id: created.id,
      project_context_key: created.project_context_key,
      artifact_type: created.artifact_type,
      artifact_version: created.artifact_version,
      dedupe_fingerprint: created.dedupe_fingerprint,
      relevance_score: created.relevance_score,
    });
    return created;
  }

  function getInsightArtifact(id) {
    return getDb().prepare('SELECT * FROM insight_artifacts WHERE id = ?').get(id);
  }

  function listInsightArtifacts({
    project_context_key = null,
    snapshot_id = null,
    artifact_type = null,
    dedupe_fingerprint = null,
    request_id = null,
    task_id = null,
    run_id = null,
    validation_status = null,
    min_relevance_score = null,
    limit = 100,
    offset = 0,
  } = {}) {
    const normalizedLimit = normalizePositiveInt(limit, 100, { min: 1, max: 1000 });
    const normalizedOffset = normalizePositiveInt(offset, 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
    let sql = 'SELECT * FROM insight_artifacts WHERE 1=1';
    const vals = [];
    if (project_context_key !== null && project_context_key !== undefined && String(project_context_key).trim()) {
      sql += ' AND project_context_key = ?';
      vals.push(normalizeProjectContextKey(project_context_key));
    }
    const parsedSnapshotId = Number.parseInt(String(snapshot_id ?? ''), 10);
    if (Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0) {
      sql += ' AND snapshot_id = ?';
      vals.push(parsedSnapshotId);
    }
    if (artifact_type !== null && artifact_type !== undefined && String(artifact_type).trim()) {
      sql += ' AND artifact_type = ?';
      vals.push(String(artifact_type).trim().toLowerCase());
    }
    if (dedupe_fingerprint !== null && dedupe_fingerprint !== undefined && String(dedupe_fingerprint).trim()) {
      sql += ' AND dedupe_fingerprint = ?';
      vals.push(String(dedupe_fingerprint).trim());
    }
    if (request_id !== null && request_id !== undefined && String(request_id).trim()) {
      sql += ' AND request_id = ?';
      vals.push(String(request_id).trim());
    }
    const parsedTaskId = Number.parseInt(String(task_id ?? ''), 10);
    if (Number.isInteger(parsedTaskId) && parsedTaskId > 0) {
      sql += ' AND task_id = ?';
      vals.push(parsedTaskId);
    }
    if (run_id !== null && run_id !== undefined && String(run_id).trim()) {
      sql += ' AND run_id = ?';
      vals.push(String(run_id).trim());
    }
    if (validation_status !== null && validation_status !== undefined && String(validation_status).trim()) {
      sql += ' AND validation_status = ?';
      vals.push(normalizeProjectMemoryValidationStatus(validation_status, 'unvalidated'));
    }
    if (min_relevance_score !== null && min_relevance_score !== undefined && min_relevance_score !== '') {
      sql += ' AND relevance_score >= ?';
      vals.push(normalizeProjectMemoryRelevanceScore(min_relevance_score, 0));
    }
    sql += ' ORDER BY relevance_score DESC, datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?';
    vals.push(normalizedLimit, normalizedOffset);
    return getDb().prepare(sql).all(...vals);
  }

  function createProjectMemoryLineageLink({
    snapshot_id = null,
    insight_artifact_id = null,
    request_id = null,
    task_id = null,
    run_id = null,
    lineage_type = 'origin',
    metadata = null,
  } = {}) {
    const d = getDb();
    const result = d.transaction(() => {
      const parsedSnapshotId = Number.parseInt(snapshot_id, 10);
      const normalizedSnapshotId = Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0
        ? parsedSnapshotId
        : null;
      const parsedInsightArtifactId = Number.parseInt(insight_artifact_id, 10);
      const normalizedInsightArtifactId = Number.isInteger(parsedInsightArtifactId) && parsedInsightArtifactId > 0
        ? parsedInsightArtifactId
        : null;
      if (!normalizedSnapshotId && !normalizedInsightArtifactId) {
        throw new Error('snapshot_id or insight_artifact_id is required');
      }
      if (normalizedSnapshotId) {
        const snapshot = d.prepare('SELECT id FROM project_memory_snapshots WHERE id = ?').get(normalizedSnapshotId);
        if (!snapshot) throw new Error(`snapshot_id ${normalizedSnapshotId} not found`);
      }
      if (normalizedInsightArtifactId) {
        const artifact = d.prepare('SELECT id FROM insight_artifacts WHERE id = ?').get(normalizedInsightArtifactId);
        if (!artifact) throw new Error(`insight_artifact_id ${normalizedInsightArtifactId} not found`);
      }
      const lineageLinkId = insertProjectMemoryLineageLink(d, {
        snapshot_id: normalizedSnapshotId,
        insight_artifact_id: normalizedInsightArtifactId,
        request_id,
        task_id,
        run_id,
        lineage_type,
        metadata,
      });
      return d.prepare('SELECT * FROM project_memory_lineage_links WHERE id = ?').get(lineageLinkId);
    })();

    log('coordinator', 'project_memory_lineage_link_created', {
      lineage_link_id: result.id,
      snapshot_id: result.snapshot_id,
      insight_artifact_id: result.insight_artifact_id,
      request_id: result.request_id,
      task_id: result.task_id,
      run_id: result.run_id,
      lineage_type: result.lineage_type,
    });
    return result;
  }

  function listProjectMemoryLineageLinks({
    snapshot_id = null,
    insight_artifact_id = null,
    request_id = null,
    task_id = null,
    run_id = null,
    lineage_type = null,
    limit = 200,
    offset = 0,
  } = {}) {
    const normalizedLimit = normalizePositiveInt(limit, 200, { min: 1, max: 5000 });
    const normalizedOffset = normalizePositiveInt(offset, 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
    let sql = 'SELECT * FROM project_memory_lineage_links WHERE 1=1';
    const vals = [];
    const parsedSnapshotId = Number.parseInt(String(snapshot_id ?? ''), 10);
    if (Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0) {
      sql += ' AND snapshot_id = ?';
      vals.push(parsedSnapshotId);
    }
    const parsedInsightArtifactId = Number.parseInt(String(insight_artifact_id ?? ''), 10);
    if (Number.isInteger(parsedInsightArtifactId) && parsedInsightArtifactId > 0) {
      sql += ' AND insight_artifact_id = ?';
      vals.push(parsedInsightArtifactId);
    }
    if (request_id !== null && request_id !== undefined && String(request_id).trim()) {
      sql += ' AND request_id = ?';
      vals.push(String(request_id).trim());
    }
    const parsedTaskId = Number.parseInt(String(task_id ?? ''), 10);
    if (Number.isInteger(parsedTaskId) && parsedTaskId > 0) {
      sql += ' AND task_id = ?';
      vals.push(parsedTaskId);
    }
    if (run_id !== null && run_id !== undefined && String(run_id).trim()) {
      sql += ' AND run_id = ?';
      vals.push(String(run_id).trim());
    }
    if (lineage_type !== null && lineage_type !== undefined && String(lineage_type).trim()) {
      sql += ' AND lineage_type = ?';
      vals.push(normalizeProjectMemoryLineageType(lineage_type, 'origin'));
    }
    sql += ' ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?';
    vals.push(normalizedLimit, normalizedOffset);
    return getDb().prepare(sql).all(...vals);
  }

  function rebuildProjectMemorySnapshotIndex() {
    const d = getDb();
    const result = d.transaction(() => {
      d.prepare('DELETE FROM project_memory_snapshot_index').run();
      const latestSnapshots = d.prepare(`
        SELECT pms.*
        FROM project_memory_snapshots pms
        JOIN (
          SELECT project_context_key, MAX(snapshot_version) AS max_snapshot_version
          FROM project_memory_snapshots
          GROUP BY project_context_key
        ) latest
        ON latest.project_context_key = pms.project_context_key
        AND latest.max_snapshot_version = pms.snapshot_version
        ORDER BY pms.project_context_key ASC, datetime(pms.created_at) DESC, pms.id DESC
      `).all();
      const insert = d.prepare(`
        INSERT INTO project_memory_snapshot_index (
          project_context_key,
          latest_snapshot_id,
          latest_snapshot_version,
          latest_iteration,
          latest_snapshot_created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_context_key) DO UPDATE SET
          latest_snapshot_id = excluded.latest_snapshot_id,
          latest_snapshot_version = excluded.latest_snapshot_version,
          latest_iteration = excluded.latest_iteration,
          latest_snapshot_created_at = excluded.latest_snapshot_created_at,
          updated_at = excluded.updated_at
      `);
      const seenContexts = new Set();
      let indexedCount = 0;
      for (const snapshot of latestSnapshots) {
        if (seenContexts.has(snapshot.project_context_key)) continue;
        seenContexts.add(snapshot.project_context_key);
        insert.run(
          snapshot.project_context_key,
          snapshot.id,
          snapshot.snapshot_version,
          snapshot.iteration,
          snapshot.created_at,
          currentSqlTimestamp()
        );
        indexedCount += 1;
      }
      return {
        indexed_count: indexedCount,
        project_context_count: seenContexts.size,
      };
    })();
    log('coordinator', 'project_memory_snapshot_index_rebuilt', result);
    return result;
  }

  return {
    createProjectMemorySnapshot,
    getProjectMemorySnapshot,
    getLatestProjectMemorySnapshot,
    listProjectMemorySnapshots,
    createInsightArtifact,
    getInsightArtifact,
    listInsightArtifacts,
    createProjectMemoryLineageLink,
    listProjectMemoryLineageLinks,
    rebuildProjectMemorySnapshotIndex,
  };
}

module.exports = { createMemoryRepository };
