'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { helloWorld } = require('../src/hello-test');

describe('helloWorld', () => {
  it('should return "Hello World"', () => {
    assert.strictEqual(helloWorld(), 'Hello World');
  });
});
