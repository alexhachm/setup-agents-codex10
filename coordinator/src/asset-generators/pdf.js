'use strict';

/**
 * PDF generator — creates PDF documents from content.
 * Uses minimal PDF spec (no external dependencies).
 */

const fs = require('fs');

function generatePdf(content, opts = {}) {
  const title = opts.title || 'Document';
  const lines = content.split('\n');

  // Minimal PDF 1.4 document
  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');

  // Page object
  objects.push(`3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj`);

  // Text content stream
  const textLines = lines.map((line, i) => {
    const y = 750 - (i * 14);
    if (y < 50) return null;
    return `BT /F1 12 Tf 50 ${y} Td (${escapePdf(line)}) Tj ET`;
  }).filter(Boolean);

  const stream = textLines.join('\n');
  objects.push(`4 0 obj
<< /Length ${stream.length} >>
stream
${stream}
endstream
endobj`);

  // Font
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');

  const body = objects.join('\n\n');
  const xrefOffset = body.length + 20;

  const pdf = `%PDF-1.4
${body}

xref
0 6
0000000000 65535 f
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF`;

  return {
    type: 'pdf',
    title,
    content: pdf,
    lineCount: lines.length,
  };
}

function escapePdf(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

async function savePdf(content, outputPath, opts = {}) {
  const doc = generatePdf(content, opts);
  fs.writeFileSync(outputPath, doc.content, 'utf-8');
  return { path: outputPath, ...doc };
}

module.exports = { generatePdf, savePdf, escapePdf };
