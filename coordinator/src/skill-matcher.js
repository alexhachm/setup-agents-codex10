'use strict';

/**
 * Skill Matcher — keyword-based skill matching.
 * Given a task description, find the most relevant skill(s).
 */

const skillLoader = require('./skill-loader');

let _skills = [];
let _projectDir = null;

function init(projectDir) {
  _projectDir = projectDir;
  _skills = skillLoader.loadAllSkills(projectDir);
}

function reload() {
  if (_projectDir) {
    _skills = skillLoader.loadAllSkills(_projectDir);
  }
}

/**
 * Tokenize text into normalized words.
 */
function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score a skill against a query.
 */
function scoreSkill(skill, queryTokens) {
  let score = 0;
  const triggers = Array.isArray(skill.triggers)
    ? skill.triggers.map(t => t.toLowerCase())
    : [];
  const nameTokens = tokenize(skill.name);
  const descTokens = tokenize(skill.description);

  for (const token of queryTokens) {
    // Exact trigger match
    if (triggers.includes(token)) score += 10;
    // Partial trigger match
    if (triggers.some(t => t.includes(token) || token.includes(t))) score += 5;
    // Name match
    if (nameTokens.includes(token)) score += 3;
    // Description match
    if (descTokens.includes(token)) score += 1;
  }

  return score;
}

/**
 * Find matching skills for a query.
 * @param {string} query - Natural language task description
 * @param {Object} opts - { limit, minScore }
 * @returns {Array} - Sorted by relevance
 */
function match(query, opts = {}) {
  const limit = opts.limit || 5;
  const minScore = opts.minScore || 1;
  const queryTokens = tokenize(query);

  const scored = _skills
    .map(skill => ({ ...skill, score: scoreSkill(skill, queryTokens) }))
    .filter(s => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/**
 * Find the single best matching skill.
 */
function bestMatch(query) {
  const matches = match(query, { limit: 1 });
  return matches[0] || null;
}

/**
 * Get all loaded skills.
 */
function listSkills() {
  return _skills.map(s => ({
    name: s.name,
    description: s.description,
    triggers: s.triggers,
    agent_type: s.agent_type,
    model: s.model,
  }));
}

function getSkill(name) {
  return _skills.find(s => s.name === name) || null;
}

function getSkillCount() {
  return _skills.length;
}

function reset() {
  _skills = [];
  _projectDir = null;
}

module.exports = {
  init,
  reload,
  match,
  bestMatch,
  listSkills,
  getSkill,
  getSkillCount,
  reset,
  tokenize,
  scoreSkill,
};
