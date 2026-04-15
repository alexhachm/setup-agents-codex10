'use strict';

function createConfigRepository(context) {
  const {
    getDb,
  } = context;

  function getConfig(key) {
    const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
  }
  
  function setConfig(key, value) {
    getDb().prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value));
  }
  
  function savePreset(name, projectDir, githubRepo, numWorkers, opts = {}) {
    const { provider = null, fast_model = null, deep_model = null, economy_model = null } = opts;
    getDb().prepare(`
      INSERT INTO presets (name, project_dir, github_repo, num_workers, provider, fast_model, deep_model, economy_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        project_dir = excluded.project_dir,
        github_repo = excluded.github_repo,
        num_workers = excluded.num_workers,
        provider = excluded.provider,
        fast_model = excluded.fast_model,
        deep_model = excluded.deep_model,
        economy_model = excluded.economy_model,
        updated_at = datetime('now')
    `).run(name, projectDir, githubRepo || '', numWorkers || 4, provider, fast_model, deep_model, economy_model);
  }
  
  function listPresets() {
    return getDb().prepare('SELECT * FROM presets ORDER BY updated_at DESC').all();
  }
  
  function getPreset(id) {
    return getDb().prepare('SELECT * FROM presets WHERE id = ?').get(id);
  }
  
  function deletePreset(id) {
    const result = getDb().prepare('DELETE FROM presets WHERE id = ?').run(id);
    return result.changes > 0;
  }

  return {
    getConfig,
    setConfig,
    savePreset,
    listPresets,
    getPreset,
    deletePreset,
  };
}

module.exports = { createConfigRepository };
