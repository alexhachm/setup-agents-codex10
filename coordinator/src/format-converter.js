'use strict';

/**
 * Format conversion pipeline — convert between common document/data formats.
 * Supports: JSON ↔ CSV, Markdown → HTML, YAML ↔ JSON, XML → JSON.
 */

const fs = require('fs');
const path = require('path');

const CONVERTERS = {
  'json-to-csv': jsonToCsv,
  'csv-to-json': csvToJson,
  'markdown-to-html': markdownToHtml,
  'yaml-to-json': yamlToJson,
  'json-to-yaml': jsonToYaml,
  'xml-to-json': xmlToJson,
};

function listFormats() {
  return Object.keys(CONVERTERS);
}

function convert(format, input, opts = {}) {
  const converter = CONVERTERS[format];
  if (!converter) throw new Error(`Unsupported conversion: ${format}. Available: ${listFormats().join(', ')}`);
  return converter(input, opts);
}

function convertFile(format, inputPath, outputPath) {
  if (!fs.existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
  const input = fs.readFileSync(inputPath, 'utf-8');
  const result = convert(format, input);
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, result.output, 'utf-8');
    return { ...result, outputPath };
  }
  return result;
}

// ── Converters ────────────────────────────────────────────────────────────────

function jsonToCsv(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!Array.isArray(data)) throw new Error('JSON input must be an array of objects');
  if (data.length === 0) return { output: '', rows: 0 };

  const headers = [...new Set(data.flatMap(obj => Object.keys(obj)))];
  const lines = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  }

  return { output: lines.join('\n'), rows: data.length, columns: headers.length };
}

function csvToJson(input) {
  const lines = input.trim().split('\n');
  if (lines.length === 0) return { output: '[]', rows: 0 };

  const headers = parseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j] || '';
    }
    rows.push(obj);
  }

  return { output: JSON.stringify(rows, null, 2), rows: rows.length, columns: headers.length };
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function markdownToHtml(input) {
  let html = input;

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Line breaks → paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p><(h[1-6])>/g, '<$1>');
  html = html.replace(/<\/(h[1-6])><\/p>/g, '</$1>');

  return { output: html, format: 'html' };
}

function yamlToJson(input) {
  // Simple YAML parser for common cases
  const result = {};
  const lines = input.split('\n');
  let currentKey = null;
  let currentIndent = 0;
  const stack = [result];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const match = line.match(/^(\s*)([^:]+):\s*(.*)/);
    if (match) {
      const indent = match[1].length;
      const key = match[2].trim();
      let value = match[3].trim();

      if (value === '') {
        // Nested object
        stack[0][key] = {};
        stack.unshift(stack[0][key]);
        currentIndent = indent;
      } else {
        // Simple value
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (value === 'null') value = null;
        else if (!isNaN(value) && value !== '') value = Number(value);
        else if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);

        stack[0][key] = value;
      }
    }
  }

  return { output: JSON.stringify(result, null, 2), format: 'json' };
}

function jsonToYaml(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const output = toYaml(data, 0);
  return { output, format: 'yaml' };
}

function toYaml(obj, indent) {
  const prefix = '  '.repeat(indent);
  const lines = [];

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        lines.push(`${prefix}- `);
        lines.push(toYaml(item, indent + 1));
      } else {
        lines.push(`${prefix}- ${yamlValue(item)}`);
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        lines.push(`${prefix}${key}:`);
        lines.push(toYaml(value, indent + 1));
      } else {
        lines.push(`${prefix}${key}: ${yamlValue(value)}`);
      }
    }
  }

  return lines.join('\n');
}

function yamlValue(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (v.includes(':') || v.includes('#') || v.includes('\n')) {
      return `"${v.replace(/"/g, '\\"')}"`;
    }
    return v;
  }
  return String(v);
}

function xmlToJson(input) {
  // Simple XML to JSON parser
  const result = {};
  const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = tagRegex.exec(input)) !== null) {
    const tag = match[1];
    const content = match[3].trim();

    // Check if content has nested tags
    if (content.match(/<\w+[^>]*>/)) {
      result[tag] = xmlToJson(content).output ?
        JSON.parse(xmlToJson(content).output) : content;
    } else {
      result[tag] = content;
    }
  }

  return { output: JSON.stringify(result, null, 2), format: 'json' };
}

module.exports = {
  convert,
  convertFile,
  listFormats,
  jsonToCsv,
  csvToJson,
  markdownToHtml,
  yamlToJson,
  jsonToYaml,
  xmlToJson,
  parseCsvLine,
};
