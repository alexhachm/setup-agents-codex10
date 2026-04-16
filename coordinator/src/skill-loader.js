'use strict';

/**
 * Skill Loader — parses SKILL.md files with YAML frontmatter.
 * Skills define reusable capabilities that agents can invoke.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse YAML-like frontmatter from a SKILL.md file.
 * Supports simple key: value pairs and lists.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return { metadata: {}, body: content };

  const yamlStr = match[1];
  const metadata = {};
  let currentKey = null;

  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // List item
    if (trimmed.startsWith('- ') && currentKey) {
      if (!Array.isArray(metadata[currentKey])) {
        metadata[currentKey] = [];
      }
      metadata[currentKey].push(trimmed.slice(2).trim());
      continue;
    }

    // Key: value
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      currentKey = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      if (value) {
        // Try to parse boolean/number
        if (value === 'true') metadata[currentKey] = true;
        else if (value === 'false') metadata[currentKey] = false;
        else if (/^\d+$/.test(value)) metadata[currentKey] = parseInt(value, 10);
        else metadata[currentKey] = value;
      } else {
        metadata[currentKey] = null; // Will be filled by list items
      }
    }
  }

  const body = content.slice(match[0].length).trim();
  return { metadata, body };
}

/**
 * Load a single SKILL.md file.
 */
function loadSkillFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { metadata, body } = parseFrontmatter(content);

  return {
    name: metadata.name || path.basename(filePath, '.md'),
    description: metadata.description || '',
    triggers: metadata.triggers || metadata.keywords || [],
    model: metadata.model || 'fast',
    tools: metadata.tools || metadata['allowed-tools'] || [],
    agent_type: metadata.agent_type || metadata['agent-type'] || 'general',
    body,
    path: filePath,
    metadata,
  };
}

/**
 * Load all SKILL.md files from a directory.
 */
function loadSkillsFromDir(dirPath) {
  const skills = [];
  if (!fs.existsSync(dirPath)) return skills;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        skills.push(loadSkillFile(path.join(dirPath, entry.name)));
      } catch (err) {
        // Skip malformed skill files
      }
    }
    if (entry.isDirectory()) {
      // Recurse into subdirectories
      const subSkills = loadSkillsFromDir(path.join(dirPath, entry.name));
      skills.push(...subSkills);
    }
  }

  return skills;
}

/**
 * Load skills from all standard locations.
 */
function loadAllSkills(projectDir) {
  const allSkills = [];

  // Built-in skills
  const builtInDir = path.join(projectDir, '.claude', 'skills', 'built-in');
  allSkills.push(...loadSkillsFromDir(builtInDir));

  // Project skills
  const projectSkillsDir = path.join(projectDir, '.claude', 'skills');
  allSkills.push(...loadSkillsFromDir(projectSkillsDir).filter(
    s => !s.path.includes('built-in')
  ));

  // Template-based skills
  const templatesDir = path.join(projectDir, 'templates', 'agents');
  allSkills.push(...loadSkillsFromDir(templatesDir));

  return allSkills;
}

module.exports = {
  parseFrontmatter,
  loadSkillFile,
  loadSkillsFromDir,
  loadAllSkills,
};
