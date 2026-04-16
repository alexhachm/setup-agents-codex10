'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const skillLoader = require('../src/skill-loader');
const skillMatcher = require('../src/skill-matcher');
const cronScheduler = require('../src/cron-scheduler');
const synthesis = require('../src/synthesis');
const db = require('../src/db');
const settingsManager = require('../src/settings-manager');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-skills-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '.claude', 'skills', 'built-in'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'templates', 'agents'), { recursive: true });
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
  db.init(tmpDir);
});

afterEach(() => {
  cronScheduler.stop();
  skillMatcher.reset();
  settingsManager.reset();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SkillLoader', () => {
  describe('parseFrontmatter', () => {
    it('should parse YAML frontmatter', () => {
      const content = `---
name: test-skill
description: A test skill
model: fast
triggers:
  - test
  - check
---

# Skill Body

Instructions here.`;
      const { metadata, body } = skillLoader.parseFrontmatter(content);
      assert.strictEqual(metadata.name, 'test-skill');
      assert.strictEqual(metadata.description, 'A test skill');
      assert.strictEqual(metadata.model, 'fast');
      assert.deepStrictEqual(metadata.triggers, ['test', 'check']);
      assert.ok(body.includes('Skill Body'));
    });

    it('should handle content without frontmatter', () => {
      const { metadata, body } = skillLoader.parseFrontmatter('Just a plain file');
      assert.deepStrictEqual(metadata, {});
      assert.strictEqual(body, 'Just a plain file');
    });

    it('should parse boolean values', () => {
      const content = `---
enabled: true
disabled: false
count: 42
---
Body`;
      const { metadata } = skillLoader.parseFrontmatter(content);
      assert.strictEqual(metadata.enabled, true);
      assert.strictEqual(metadata.disabled, false);
      assert.strictEqual(metadata.count, 42);
    });
  });

  describe('loadSkillFile', () => {
    it('should load a skill file', () => {
      const skillPath = path.join(tmpDir, '.claude', 'skills', 'built-in', 'test.md');
      fs.writeFileSync(skillPath, `---
name: test-skill
description: Test
triggers:
  - test
model: fast
---
Body content`);

      const skill = skillLoader.loadSkillFile(skillPath);
      assert.strictEqual(skill.name, 'test-skill');
      assert.strictEqual(skill.description, 'Test');
      assert.deepStrictEqual(skill.triggers, ['test']);
    });
  });

  describe('loadSkillsFromDir', () => {
    it('should load all skills from directory', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'skills', 'built-in', 'a.md'),
        '---\nname: skill-a\n---\nBody A'
      );
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'skills', 'built-in', 'b.md'),
        '---\nname: skill-b\n---\nBody B'
      );

      const skills = skillLoader.loadSkillsFromDir(
        path.join(tmpDir, '.claude', 'skills', 'built-in')
      );
      assert.strictEqual(skills.length, 2);
    });

    it('should return empty for non-existent directory', () => {
      const skills = skillLoader.loadSkillsFromDir('/nonexistent');
      assert.strictEqual(skills.length, 0);
    });
  });

  describe('loadAllSkills', () => {
    it('should load from all standard locations', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.claude', 'skills', 'built-in', 'builtin.md'),
        '---\nname: builtin\n---\nBuilt-in skill'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'templates', 'agents', 'template.md'),
        '---\nname: template\n---\nTemplate skill'
      );

      const skills = skillLoader.loadAllSkills(tmpDir);
      assert.ok(skills.length >= 2);
    });
  });
});

describe('SkillMatcher', () => {
  beforeEach(() => {
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'skills', 'built-in', 'code.md'),
      '---\nname: code\ndescription: Write code and implement features\ntriggers:\n  - code\n  - implement\n  - build\n---\nCode skill'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'skills', 'built-in', 'review.md'),
      '---\nname: review\ndescription: Review code for quality\ntriggers:\n  - review\n  - audit\n---\nReview skill'
    );
    skillMatcher.init(tmpDir);
  });

  describe('tokenize', () => {
    it('should tokenize text', () => {
      const tokens = skillMatcher.tokenize('Implement a new feature');
      assert.deepStrictEqual(tokens, ['implement', 'a', 'new', 'feature']);
    });
  });

  describe('match', () => {
    it('should match skills by trigger', () => {
      const matches = skillMatcher.match('implement a feature');
      assert.ok(matches.length > 0);
      assert.strictEqual(matches[0].name, 'code');
    });

    it('should match by description keywords', () => {
      const matches = skillMatcher.match('write quality code');
      assert.ok(matches.length > 0);
    });

    it('should return empty for unrelated query', () => {
      const matches = skillMatcher.match('xyzzy nonexistent gibberish');
      assert.strictEqual(matches.length, 0);
    });
  });

  describe('bestMatch', () => {
    it('should return single best match', () => {
      const match = skillMatcher.bestMatch('review my code');
      assert.ok(match);
      assert.strictEqual(match.name, 'review');
    });

    it('should return null for no match', () => {
      const match = skillMatcher.bestMatch('xyzzy');
      assert.strictEqual(match, null);
    });
  });

  describe('listSkills', () => {
    it('should list all loaded skills', () => {
      const skills = skillMatcher.listSkills();
      assert.ok(skills.length >= 2);
    });
  });

  describe('getSkill', () => {
    it('should get skill by name', () => {
      const skill = skillMatcher.getSkill('code');
      assert.ok(skill);
      assert.strictEqual(skill.name, 'code');
    });

    it('should return null for unknown skill', () => {
      assert.strictEqual(skillMatcher.getSkill('nonexistent'), null);
    });
  });
});

describe('Asset Generators', () => {
  describe('docx', () => {
    const docx = require('../src/asset-generators/docx');

    it('should generate DOCX XML', () => {
      const result = docx.generateDocx('Hello\nWorld', { title: 'Test Doc' });
      assert.strictEqual(result.type, 'docx');
      assert.strictEqual(result.title, 'Test Doc');
      assert.ok(result.xml.includes('Hello'));
      assert.strictEqual(result.paragraphCount, 2);
    });

    it('should escape XML entities', () => {
      assert.strictEqual(docx.escapeXml('A & B'), 'A &amp; B');
      assert.strictEqual(docx.escapeXml('<tag>'), '&lt;tag&gt;');
    });

    it('should save to file', async () => {
      const outPath = path.join(tmpDir, 'test.docx');
      const result = await docx.saveDocx('Test content', outPath);
      assert.ok(fs.existsSync(outPath));
      assert.strictEqual(result.path, outPath);
    });
  });

  describe('pdf', () => {
    const pdf = require('../src/asset-generators/pdf');

    it('should generate PDF content', () => {
      const result = pdf.generatePdf('Line 1\nLine 2', { title: 'Test' });
      assert.strictEqual(result.type, 'pdf');
      assert.ok(result.content.includes('%PDF-1.4'));
    });

    it('should escape PDF special characters', () => {
      assert.strictEqual(pdf.escapePdf('(test)'), '\\(test\\)');
    });

    it('should save to file', async () => {
      const outPath = path.join(tmpDir, 'test.pdf');
      await pdf.savePdf('Content', outPath);
      assert.ok(fs.existsSync(outPath));
    });
  });

  describe('xlsx', () => {
    const xlsx = require('../src/asset-generators/xlsx');

    it('should generate XLSX XML', () => {
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];
      const result = xlsx.generateXlsx(data);
      assert.strictEqual(result.type, 'xlsx');
      assert.strictEqual(result.rowCount, 2);
      assert.strictEqual(result.columnCount, 2);
      assert.ok(result.xml.includes('Alice'));
    });

    it('should handle column references', () => {
      assert.strictEqual(xlsx.colRef(0), 'A');
      assert.strictEqual(xlsx.colRef(25), 'Z');
      assert.strictEqual(xlsx.colRef(26), 'AA');
    });
  });

  describe('pptx', () => {
    const pptx = require('../src/asset-generators/pptx');

    it('should generate PPTX slides', () => {
      const slides = [
        { title: 'Slide 1', bullets: ['Point A', 'Point B'] },
        { title: 'Slide 2', bullets: ['Point C'] },
      ];
      const result = pptx.generatePptx(slides);
      assert.strictEqual(result.type, 'pptx');
      assert.strictEqual(result.slideCount, 2);
    });
  });
});

describe('CronScheduler', () => {
  describe('matchesCron', () => {
    it('should match wildcard expression', () => {
      assert.strictEqual(cronScheduler.matchesCron('* * * * *', new Date()), true);
    });

    it('should match specific minute', () => {
      const date = new Date(2024, 0, 1, 10, 30);
      assert.strictEqual(cronScheduler.matchesCron('30 10 * * *', date), true);
      assert.strictEqual(cronScheduler.matchesCron('31 10 * * *', date), false);
    });

    it('should match step values', () => {
      const date = new Date(2024, 0, 1, 10, 15);
      assert.strictEqual(cronScheduler.matchesCron('*/15 * * * *', date), true);
      assert.strictEqual(cronScheduler.matchesCron('*/7 * * * *', date), false);
    });

    it('should match day of week', () => {
      const monday = new Date(2024, 0, 1); // Jan 1 2024 = Monday
      assert.strictEqual(cronScheduler.matchesCron('* * * * 1', monday), true);
    });

    it('should match ranges', () => {
      assert.strictEqual(cronScheduler.matchesField(3, '1-5'), true);
      assert.strictEqual(cronScheduler.matchesField(6, '1-5'), false);
    });

    it('should match lists', () => {
      assert.strictEqual(cronScheduler.matchesField(3, '1,3,5'), true);
      assert.strictEqual(cronScheduler.matchesField(2, '1,3,5'), false);
    });
  });

  describe('CRUD', () => {
    it('should create and get scheduled tasks', () => {
      const id = cronScheduler.createScheduledTask({
        name: 'test-task',
        cron_expression: '*/5 * * * *',
        command: 'mac10 status',
      });
      assert.ok(id > 0);
      const task = cronScheduler.getScheduledTask(id);
      assert.strictEqual(task.name, 'test-task');
      assert.strictEqual(task.enabled, 1);
    });

    it('should list scheduled tasks', () => {
      cronScheduler.createScheduledTask({
        name: 'task-1',
        cron_expression: '0 * * * *',
        command: 'cmd1',
      });
      cronScheduler.createScheduledTask({
        name: 'task-2',
        cron_expression: '0 0 * * *',
        command: 'cmd2',
        enabled: false,
      });
      const all = cronScheduler.listScheduledTasks();
      assert.ok(all.length >= 2);
      const enabled = cronScheduler.listScheduledTasks(true);
      assert.ok(enabled.length >= 1);
    });

    it('should update and delete tasks', () => {
      const id = cronScheduler.createScheduledTask({
        name: 'to-delete',
        cron_expression: '0 0 * * *',
        command: 'test',
      });
      cronScheduler.updateScheduledTask(id, { enabled: 0 });
      assert.strictEqual(cronScheduler.getScheduledTask(id).enabled, 0);
      assert.strictEqual(cronScheduler.deleteScheduledTask(id), true);
    });
  });

  describe('getNextRunTime', () => {
    it('should find next run time', () => {
      const next = cronScheduler.getNextRunTime('0 * * * *');
      assert.ok(next);
      assert.strictEqual(next.getMinutes(), 0);
    });

    it('should return null for impossible expressions', () => {
      const next = cronScheduler.getNextRunTime('0 0 31 2 *'); // Feb 31
      assert.strictEqual(next, null);
    });
  });
});

describe('Synthesis', () => {
  it('should synthesize simple results', () => {
    const results = [
      { id: 1, subject: 'Task 1', status: 'completed', result: 'Done task 1', pr_url: 'https://pr/1' },
      { id: 2, subject: 'Task 2', status: 'failed', result: 'Error occurred' },
    ];
    const output = synthesis.synthesizeSimple(results);
    assert.strictEqual(output.completed_count, 1);
    assert.strictEqual(output.failed_count, 1);
    assert.ok(output.summary.includes('Task 1'));
    assert.ok(output.summary.includes('Task 2'));
  });

  it('should gather task results for a request', () => {
    const reqId = db.createRequest('Test request');
    db.createTask({
      request_id: reqId,
      subject: 'Task A',
      description: 'Do A',
    });
    const results = synthesis.gatherTaskResults(reqId);
    assert.strictEqual(results.length, 1);
  });
});

describe('Schedule Command', () => {
  const scheduleCmd = require('../src/commands/schedule');

  it('should create a scheduled task', () => {
    const result = scheduleCmd.run(['daily-check', '0 9 * * *', 'mac10 status'], tmpDir);
    assert.ok(result.id);
    assert.strictEqual(result.name, 'daily-check');
  });

  it('should list tasks', () => {
    scheduleCmd.run(['task1', '*/5 * * * *', 'cmd1'], tmpDir);
    const result = scheduleCmd.run(['list'], tmpDir);
    assert.ok(result.tasks);
    assert.ok(result.tasks.length >= 1);
  });

  it('should delete tasks', () => {
    const created = scheduleCmd.run(['to-delete', '0 0 * * *', 'cmd'], tmpDir);
    const result = scheduleCmd.run(['delete', String(created.id)], tmpDir);
    assert.ok(result.deleted);
  });

  it('should schedule one-time task', () => {
    const result = scheduleCmd.runOnce(['one-shot', '5', 'mac10 search test'], tmpDir);
    assert.ok(result.id);
    assert.ok(result.run_at);
  });
});

describe('Generate Command', () => {
  const generateCmd = require('../src/commands/generate');

  it('should generate docx', async () => {
    const outPath = path.join(tmpDir, 'test.docx');
    const result = await generateCmd.run(['docx', '--content', 'Hello world', '--output', outPath], tmpDir);
    assert.ok(result.message);
    assert.ok(fs.existsSync(outPath));
  });

  it('should generate pdf', async () => {
    const outPath = path.join(tmpDir, 'test.pdf');
    const result = await generateCmd.run(['pdf', '--content', 'Hello world', '--output', outPath], tmpDir);
    assert.ok(result.message);
  });

  it('should error on missing format', async () => {
    const result = await generateCmd.run([], tmpDir);
    assert.ok(result.error);
  });
});
