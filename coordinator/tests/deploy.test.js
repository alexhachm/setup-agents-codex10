'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const deployCmd = require('../src/commands/deploy');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-deploy-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Deploy command', () => {
  describe('listProviders', () => {
    it('should list all deploy providers', () => {
      const providers = deployCmd.listProviders();
      assert.ok(Array.isArray(providers));
      assert.ok(providers.length >= 3);
      const names = providers.map(p => p.name);
      assert.ok(names.includes('vercel'));
      assert.ok(names.includes('netlify'));
      assert.ok(names.includes('github-pages'));
    });

    it('should include availability flag', () => {
      const providers = deployCmd.listProviders();
      for (const p of providers) {
        assert.strictEqual(typeof p.available, 'boolean');
      }
    });
  });

  describe('detectProvider', () => {
    it('should detect vercel from vercel.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'vercel.json'), '{}');
      assert.strictEqual(deployCmd.detectProvider(tmpDir), 'vercel');
    });

    it('should detect netlify from netlify.toml', () => {
      fs.writeFileSync(path.join(tmpDir, 'netlify.toml'), '[build]');
      assert.strictEqual(deployCmd.detectProvider(tmpDir), 'netlify');
    });

    it('should default to vercel', () => {
      assert.strictEqual(deployCmd.detectProvider(tmpDir), 'vercel');
    });
  });

  describe('runDeploy', () => {
    it('should reject unknown provider', () => {
      const result = deployCmd.runDeploy(['--provider', 'nonexistent'], tmpDir);
      assert.ok(result.error);
    });
  });

  describe('runPreview', () => {
    it('should reject unknown provider', () => {
      const result = deployCmd.runPreview(['--provider', 'nonexistent'], tmpDir);
      assert.ok(result.error);
    });
  });
});

describe('Vercel adapter', () => {
  const vercel = require('../src/deploy/vercel');

  it('should export correct interface', () => {
    assert.strictEqual(vercel.name, 'vercel');
    assert.strictEqual(typeof vercel.isAvailable, 'function');
    assert.strictEqual(typeof vercel.deploy, 'function');
    assert.strictEqual(typeof vercel.preview, 'function');
  });

  it('should return boolean from isAvailable', () => {
    const result = vercel.isAvailable();
    assert.strictEqual(typeof result, 'boolean');
  });
});

describe('Netlify adapter', () => {
  const netlify = require('../src/deploy/netlify');

  it('should export correct interface', () => {
    assert.strictEqual(netlify.name, 'netlify');
    assert.strictEqual(typeof netlify.isAvailable, 'function');
    assert.strictEqual(typeof netlify.deploy, 'function');
    assert.strictEqual(typeof netlify.preview, 'function');
  });
});

describe('GitHub Pages adapter', () => {
  const ghPages = require('../src/deploy/github-pages');

  it('should export correct interface', () => {
    assert.strictEqual(ghPages.name, 'github-pages');
    assert.strictEqual(typeof ghPages.isAvailable, 'function');
    assert.strictEqual(typeof ghPages.deploy, 'function');
    assert.strictEqual(typeof ghPages.preview, 'function');
  });

  it('should report preview unsupported', () => {
    const result = ghPages.preview(tmpDir);
    assert.strictEqual(result.status, 'unsupported');
  });
});
