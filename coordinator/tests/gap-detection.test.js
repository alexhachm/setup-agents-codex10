'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { detectGaps } = require('../src/gap-detection');

describe('detectGaps', () => {
  it('should return empty array for empty input', () => {
    assert.deepStrictEqual(detectGaps([]), []);
  });

  it('should return empty array for null/non-array', () => {
    assert.deepStrictEqual(detectGaps(null), []);
    assert.deepStrictEqual(detectGaps(undefined), []);
  });

  it('should return empty array for consecutive sequence', () => {
    assert.deepStrictEqual(detectGaps([1, 2, 3, 4, 5]), []);
  });

  it('should detect a single gap', () => {
    assert.deepStrictEqual(detectGaps([1, 2, 4, 5]), [3]);
  });

  it('should detect multiple gaps', () => {
    assert.deepStrictEqual(detectGaps([1, 3, 5]), [2, 4]);
  });

  it('should handle unsorted input', () => {
    assert.deepStrictEqual(detectGaps([5, 1, 3]), [2, 4]);
  });

  it('should return empty for single element', () => {
    assert.deepStrictEqual(detectGaps([7]), []);
  });
});
