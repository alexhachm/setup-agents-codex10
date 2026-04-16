'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const searchEngine = require('../src/search/engine');
const settingsManager = require('../src/settings-manager');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-search-'));
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
  searchEngine.reset();
});

afterEach(() => {
  searchEngine.reset();
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SearchEngine', () => {
  describe('registerAdapter', () => {
    it('should register and list adapters', () => {
      searchEngine.registerAdapter('test', {
        isAvailable: () => true,
        search: async () => ({ items: [] }),
      });
      const available = searchEngine.getAvailableAdapters();
      assert.ok(available.includes('test'));
    });
  });

  describe('getAvailableAdapters', () => {
    it('should filter unavailable adapters', () => {
      searchEngine.registerAdapter('available', {
        isAvailable: () => true,
        search: async () => ({ items: [] }),
      });
      searchEngine.registerAdapter('unavailable', {
        isAvailable: () => false,
        search: async () => ({ items: [] }),
      });
      const available = searchEngine.getAvailableAdapters();
      assert.ok(available.includes('available'));
      assert.ok(!available.includes('unavailable'));
    });
  });

  describe('getDefaultAdapter', () => {
    it('should return null when no adapters available', () => {
      assert.strictEqual(searchEngine.getDefaultAdapter(), null);
    });

    it('should return preferred adapter if available', () => {
      settingsManager.set('search.default_provider', 'test');
      searchEngine.registerAdapter('test', {
        isAvailable: () => true,
        search: async () => ({ items: [] }),
      });
      assert.strictEqual(searchEngine.getDefaultAdapter(), 'test');
    });

    it('should fall back to first available', () => {
      settingsManager.set('search.default_provider', 'missing');
      searchEngine.registerAdapter('fallback', {
        isAvailable: () => true,
        search: async () => ({ items: [] }),
      });
      assert.strictEqual(searchEngine.getDefaultAdapter(), 'fallback');
    });
  });

  describe('search', () => {
    it('should execute search through adapter', async () => {
      searchEngine.registerAdapter('mock', {
        isAvailable: () => true,
        search: async (query, opts) => ({
          items: [
            { title: 'Result 1', url: 'https://example.com', snippet: 'A snippet' },
          ],
          total: 1,
        }),
      });
      settingsManager.set('search.default_provider', 'mock');

      const result = await searchEngine.search('test query');
      assert.strictEqual(result.provider, 'mock');
      assert.strictEqual(result.query, 'test query');
      assert.strictEqual(result.results.length, 1);
      assert.strictEqual(result.citations.length, 1);
      assert.strictEqual(result.citations[0].index, 1);
      assert.strictEqual(result.citations[0].url, 'https://example.com');
    });

    it('should throw when no adapter available', async () => {
      await assert.rejects(
        () => searchEngine.search('test'),
        /No search adapter available/
      );
    });

    it('should use specified provider', async () => {
      searchEngine.registerAdapter('specific', {
        isAvailable: () => true,
        search: async () => ({ items: [{ title: 'Specific', url: 'https://s.com', snippet: '' }] }),
      });
      const result = await searchEngine.search('test', { provider: 'specific' });
      assert.strictEqual(result.provider, 'specific');
    });
  });

  describe('searchWithCitations', () => {
    it('should return citations with answer', async () => {
      searchEngine.registerAdapter('mock', {
        isAvailable: () => true,
        search: async () => ({
          items: [{ title: 'R1', url: 'https://r1.com', snippet: 'Answer text' }],
        }),
      });
      settingsManager.set('search.default_provider', 'mock');

      const result = await searchEngine.searchWithCitations('test');
      assert.ok(result.answer);
      assert.ok(result.citations);
      assert.strictEqual(result.citations.length, 1);
    });
  });

  describe('fetchUrl', () => {
    it('should use adapter fetchUrl if available', async () => {
      searchEngine.registerAdapter('fetcher', {
        isAvailable: () => true,
        search: async () => ({ items: [] }),
        fetchUrl: async (url) => ({ url, content: 'fetched', status: 200 }),
      });
      settingsManager.set('search.default_provider', 'fetcher');

      const result = await searchEngine.fetchUrl('https://example.com');
      assert.strictEqual(result.content, 'fetched');
    });
  });

  describe('reset', () => {
    it('should clear all adapters', () => {
      searchEngine.registerAdapter('test', {
        isAvailable: () => true,
        search: async () => ({ items: [] }),
      });
      searchEngine.reset();
      assert.strictEqual(searchEngine.getAvailableAdapters().length, 0);
    });
  });
});

describe('Search Adapters', () => {
  describe('perplexity', () => {
    it('should export required interface', () => {
      const adapter = require('../src/search/adapters/perplexity');
      assert.strictEqual(adapter.name, 'perplexity');
      assert.strictEqual(typeof adapter.isAvailable, 'function');
      assert.strictEqual(typeof adapter.search, 'function');
    });
  });

  describe('brave', () => {
    it('should export required interface', () => {
      const adapter = require('../src/search/adapters/brave');
      assert.strictEqual(adapter.name, 'brave');
      assert.strictEqual(typeof adapter.isAvailable, 'function');
      assert.strictEqual(typeof adapter.search, 'function');
    });
  });

  describe('google', () => {
    it('should export required interface', () => {
      const adapter = require('../src/search/adapters/google');
      assert.strictEqual(adapter.name, 'google');
      assert.strictEqual(typeof adapter.isAvailable, 'function');
      assert.strictEqual(typeof adapter.search, 'function');
    });
  });

  describe('tavily', () => {
    it('should export required interface', () => {
      const adapter = require('../src/search/adapters/tavily');
      assert.strictEqual(adapter.name, 'tavily');
      assert.strictEqual(typeof adapter.isAvailable, 'function');
      assert.strictEqual(typeof adapter.search, 'function');
    });
  });
});

describe('Search Verticals', () => {
  describe('academic', () => {
    it('should export search and formatCitation', () => {
      const v = require('../src/search/verticals/academic');
      assert.strictEqual(v.name, 'academic');
      assert.strictEqual(typeof v.search, 'function');
      assert.strictEqual(typeof v.formatCitation, 'function');
    });

    it('should format APA citation', () => {
      const v = require('../src/search/verticals/academic');
      const citation = v.formatCitation({ title: 'Test Paper', url: 'https://example.com' }, 'apa');
      assert.ok(citation.includes('Test Paper'));
      assert.ok(citation.includes('https://example.com'));
    });

    it('should format MLA citation', () => {
      const v = require('../src/search/verticals/academic');
      const citation = v.formatCitation({ title: 'Test Paper', url: 'https://example.com' }, 'mla');
      assert.ok(citation.includes('Test Paper'));
    });
  });

  describe('people', () => {
    it('should export search and extractProfile', () => {
      const v = require('../src/search/verticals/people');
      assert.strictEqual(v.name, 'people');
      assert.strictEqual(typeof v.extractProfile, 'function');
    });

    it('should extract profiles from results', () => {
      const v = require('../src/search/verticals/people');
      const profiles = v.extractProfile([
        { title: 'John Doe', url: 'https://linkedin.com/in/johndoe', snippet: 'CEO' },
      ]);
      assert.strictEqual(profiles[0].name, 'John Doe');
      assert.strictEqual(profiles[0].source, 'linkedin.com');
    });
  });

  describe('image', () => {
    it('should filter by image type', () => {
      const v = require('../src/search/verticals/image');
      const filtered = v.filterByType([
        { url: 'https://example.com/photo.jpg' },
        { url: 'https://example.com/doc.pdf' },
        { url: 'https://example.com/icon.png' },
      ]);
      assert.strictEqual(filtered.length, 2);
    });
  });

  describe('video', () => {
    it('should extract video info', () => {
      const v = require('../src/search/verticals/video');
      const videos = v.extractVideoInfo([
        { title: 'Tutorial', url: 'https://youtube.com/watch?v=123', snippet: 'desc' },
        { title: 'Demo', url: 'https://vimeo.com/456', snippet: 'desc' },
      ]);
      assert.strictEqual(videos[0].platform, 'youtube');
      assert.strictEqual(videos[1].platform, 'vimeo');
    });
  });

  describe('shopping', () => {
    it('should extract products', () => {
      const v = require('../src/search/verticals/shopping');
      const products = v.extractProducts([
        { title: 'Product X', url: 'https://amazon.com/dp/123', snippet: '$29.99' },
      ]);
      assert.strictEqual(products[0].store, 'amazon.com');
    });
  });
});

describe('Search Commands', () => {
  describe('fetch-url', () => {
    it('should extract main content from HTML', () => {
      const fetchUrl = require('../src/commands/fetch-url');
      const html = '<html><body><script>alert(1)</script><p>Hello <b>world</b></p></body></html>';
      const text = fetchUrl.extractMainContent(html);
      assert.ok(text.includes('Hello'));
      assert.ok(text.includes('world'));
      assert.ok(!text.includes('alert'));
    });
  });
});

describe('Citation DB', () => {
  const db = require('../src/db');
  const research = require('../src/db/research');

  it('should store and retrieve citations', () => {
    const citDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-cit-'));
    fs.mkdirSync(path.join(citDir, '.claude', 'state'), { recursive: true });
    db.init(citDir);
    try {
      research.init(db);
      const ids = research.storeCitations(
        [
          { title: 'Test', url: 'https://example.com', snippet: 'A test', index: 1 },
          { title: 'Test2', url: 'https://example2.com', snippet: 'Another', index: 2 },
        ],
        { request_id: 'req-1', query: 'test query', provider: 'mock' }
      );
      assert.strictEqual(ids.length, 2);

      const byReq = research.getCitationsForRequest('req-1');
      assert.strictEqual(byReq.length, 2);

      const byQuery = research.getCitationsByQuery('test query');
      assert.strictEqual(byQuery.length, 2);

      const byUrl = research.getCitationsByUrl('https://example.com');
      assert.strictEqual(byUrl.length, 1);

      const recent = research.getRecentCitations(10);
      assert.ok(recent.length >= 2);
    } finally {
      research.reset();
      db.close();
      fs.rmSync(citDir, { recursive: true, force: true });
    }
  });
});
