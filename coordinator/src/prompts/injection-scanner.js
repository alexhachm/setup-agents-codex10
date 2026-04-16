'use strict';

/**
 * Injection Scanner — basic prompt injection detection in fetched content.
 * Scans for known injection patterns (system prompt overrides, role changes, ignore previous).
 * Logs warnings but does not block — defense-in-depth signal for monitoring.
 */

const INJECTION_PATTERNS = [
  // System prompt overrides
  { pattern: /\bignore\s+(all\s+)?previous\s+instructions?\b/i, category: 'instruction_override', severity: 'high' },
  { pattern: /\byou\s+are\s+now\s+a?\s+/i, category: 'role_change', severity: 'high' },
  { pattern: /\b(system|assistant)\s*:\s*/i, category: 'role_injection', severity: 'medium' },
  { pattern: /\bforget\s+(everything|all|your)\b/i, category: 'instruction_override', severity: 'high' },
  { pattern: /\bdisregard\s+(previous|all|your)\b/i, category: 'instruction_override', severity: 'high' },
  { pattern: /\bnew\s+instructions?\s*:/i, category: 'instruction_override', severity: 'high' },

  // Delimiter manipulation
  { pattern: /```\s*system\b/i, category: 'delimiter_injection', severity: 'medium' },
  { pattern: /<\|im_start\|>/i, category: 'delimiter_injection', severity: 'high' },
  { pattern: /<\|endoftext\|>/i, category: 'delimiter_injection', severity: 'high' },
  { pattern: /\[INST\]/i, category: 'delimiter_injection', severity: 'medium' },

  // Data exfiltration
  { pattern: /\brepeat\s+(back|all|the|your)\s+(system\s+)?(prompt|instructions?)\b/i, category: 'exfiltration', severity: 'high' },
  { pattern: /\bwhat\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)\b/i, category: 'exfiltration', severity: 'medium' },

  // Tool abuse
  { pattern: /\bexecute\s+(this\s+)?(command|code|script)\b/i, category: 'tool_abuse', severity: 'medium' },
  { pattern: /\brun\s+(the\s+following|this)\s+(bash|shell|command)\b/i, category: 'tool_abuse', severity: 'medium' },
];

function scan(content, opts = {}) {
  if (!content || typeof content !== 'string') {
    return { clean: true, findings: [] };
  }

  const source = opts.source || 'unknown';
  const findings = [];

  for (const rule of INJECTION_PATTERNS) {
    const match = content.match(rule.pattern);
    if (match) {
      findings.push({
        category: rule.category,
        severity: rule.severity,
        matched: match[0],
        index: match.index,
        source,
      });
    }
  }

  return {
    clean: findings.length === 0,
    findings,
    summary: findings.length > 0
      ? `${findings.length} potential injection(s) detected: ${[...new Set(findings.map(f => f.category))].join(', ')}`
      : null,
  };
}

function scanAndLog(content, opts = {}, logger) {
  const result = scan(content, opts);
  if (!result.clean && logger) {
    logger('security', 'injection_detected', {
      source: opts.source || 'unknown',
      findings: result.findings,
      summary: result.summary,
    });
  }
  return result;
}

function getPatternCount() {
  return INJECTION_PATTERNS.length;
}

module.exports = {
  INJECTION_PATTERNS,
  scan,
  scanAndLog,
  getPatternCount,
};
