/**
 * Detects gaps (missing integers) in a sorted sequence of numbers.
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
