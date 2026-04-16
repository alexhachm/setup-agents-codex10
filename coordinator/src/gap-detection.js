/**
 * Detects gaps (missing integers) in a sorted sequence of numbers.
 * Used to identify missing task IDs, worker IDs, or sequential state gaps.
 * Ref: coordinator-core rollup — gap detection for merge conflict/stall patterns.
 * @param {number[]} sequence - Array of integers (need not be sorted)
 * @returns {number[]} Array of missing integers between min and max of sequence
 */
function detectGaps(sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) return [];
  const sorted = [...sequence].sort((a, b) => a - b);
  const gaps = [];
  for (let i = sorted[0]; i <= sorted[sorted.length - 1]; i++) {
    if (!sorted.includes(i)) {
      gaps.push(i);
    }
  }
  return gaps;
}

module.exports = { detectGaps };
