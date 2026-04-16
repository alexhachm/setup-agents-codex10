'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-s1-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Sprint 1: Search Enhancement', () => {
  it('should load all search verticals', () => {
    const academic = require('../src/search/verticals/academic');
    const people = require('../src/search/verticals/people');
    const image = require('../src/search/verticals/image');
    const video = require('../src/search/verticals/video');
    const shopping = require('../src/search/verticals/shopping');
    const finance = require('../src/search/verticals/finance');

    assert.strictEqual(academic.name, 'academic');
    assert.strictEqual(people.name, 'people');
    assert.strictEqual(image.name, 'image');
    assert.strictEqual(video.name, 'video');
    assert.strictEqual(shopping.name, 'shopping');
    assert.strictEqual(finance.name, 'finance');
  });

  it('should have finance vertical with all providers', () => {
    const finance = require('../src/search/verticals/finance');
    assert.ok(finance.PROVIDERS.sec_edgar);
    assert.ok(finance.PROVIDERS.fred);
    assert.ok(finance.PROVIDERS.alpha_vantage);
  });

  it('should have citation DB with required fields', () => {
    const research = require('../src/db/research');
    research.init(db);

    const ids = research.storeCitations(
      [{ url: 'https://example.com', title: 'Test', snippet: 'Test passage' }],
      { query: 'test', provider: 'test', request_id: null }
    );
    assert.strictEqual(ids.length, 1);

    const citations = research.getRecentCitations(10);
    assert.strictEqual(citations.length, 1);
    assert.ok(citations[0].url); // source_url
    assert.ok(citations[0].snippet); // passage
    assert.ok(citations[0].created_at); // timestamp

    research.reset();
  });

  it('should search academic vertical with formatCitation', () => {
    const academic = require('../src/search/verticals/academic');
    const citation = academic.formatCitation({ title: 'Test Paper', url: 'https://arxiv.org/123' }, 'apa');
    assert.ok(citation.includes('Test Paper'));
    assert.ok(citation.includes('https://arxiv.org/123'));
  });
});
