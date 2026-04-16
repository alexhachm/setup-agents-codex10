'use strict';

/**
 * DOCX generator — creates Word documents from content.
 * Uses basic Open XML format (no external dependencies).
 */

const fs = require('fs');
const path = require('path');

function generateDocx(content, opts = {}) {
  const title = opts.title || 'Document';
  const author = opts.author || 'mac10';

  // Simple DOCX is a ZIP of XML files — use a minimal template approach
  // For production, would use a library like docx or officegen
  const paragraphs = content.split('\n').filter(Boolean);

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>
    ${paragraphs.map(p => `<w:p><w:r><w:t>${escapeXml(p)}</w:t></w:r></w:p>`).join('\n    ')}
  </w:body>
</w:document>`;

  return {
    type: 'docx',
    title,
    xml: docXml,
    paragraphCount: paragraphs.length,
  };
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function saveDocx(content, outputPath, opts = {}) {
  const doc = generateDocx(content, opts);
  // Write the XML representation (actual DOCX ZIP creation needs a library)
  fs.writeFileSync(outputPath, doc.xml, 'utf-8');
  return { path: outputPath, ...doc };
}

module.exports = { generateDocx, saveDocx, escapeXml };
