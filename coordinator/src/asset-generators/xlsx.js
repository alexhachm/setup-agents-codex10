'use strict';

/**
 * XLSX generator — creates Excel spreadsheets from data.
 * Uses Open XML format.
 */

const fs = require('fs');

function generateXlsx(data, opts = {}) {
  const sheetName = opts.sheetName || 'Sheet1';
  const headers = opts.headers || (data.length > 0 ? Object.keys(data[0]) : []);

  // Build sheet XML
  const rows = [];

  // Header row
  if (headers.length > 0) {
    const headerCells = headers.map((h, i) =>
      `<c r="${colRef(i)}1" t="inlineStr"><is><t>${escapeXml(String(h))}</t></is></c>`
    );
    rows.push(`<row r="1">${headerCells.join('')}</row>`);
  }

  // Data rows
  for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx];
    const rowNum = rowIdx + 2;
    const cells = headers.map((h, colIdx) => {
      const value = row[h];
      if (typeof value === 'number') {
        return `<c r="${colRef(colIdx)}${rowNum}"><v>${value}</v></c>`;
      }
      return `<c r="${colRef(colIdx)}${rowNum}" t="inlineStr"><is><t>${escapeXml(String(value || ''))}</t></is></c>`;
    });
    rows.push(`<row r="${rowNum}">${cells.join('')}</row>`);
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rows.join('\n    ')}</sheetData>
</worksheet>`;

  return {
    type: 'xlsx',
    sheetName,
    xml: sheetXml,
    rowCount: data.length,
    columnCount: headers.length,
  };
}

function colRef(index) {
  let ref = '';
  let i = index;
  do {
    ref = String.fromCharCode(65 + (i % 26)) + ref;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return ref;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function saveXlsx(data, outputPath, opts = {}) {
  const doc = generateXlsx(data, opts);
  fs.writeFileSync(outputPath, doc.xml, 'utf-8');
  return { path: outputPath, ...doc };
}

module.exports = { generateXlsx, saveXlsx, colRef, escapeXml };
