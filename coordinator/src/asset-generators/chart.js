'use strict';

/**
 * Chart Generator — generate charts for embedding in documents.
 * Uses SVG generation (no canvas dependency required for basic charts).
 * Falls back to chartjs-node-canvas when available.
 */

const fs = require('fs');
const path = require('path');

let _chartjs = null;
try {
  _chartjs = require('chartjs-node-canvas');
} catch {
  // chartjs-node-canvas not installed — use SVG fallback
}

const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut', 'scatter'];
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 400;

/**
 * Generate a chart image.
 * @param {Object} config - Chart.js compatible config
 * @param {Object} opts - { width, height, outputPath, format }
 * @returns {Promise<Object>} - { path, format, width, height }
 */
async function generate(config, opts = {}) {
  const width = opts.width || DEFAULT_WIDTH;
  const height = opts.height || DEFAULT_HEIGHT;
  const format = opts.format || 'svg';

  if (_chartjs && format === 'png') {
    return generateWithChartJS(config, { width, height, ...opts });
  }

  return generateSVG(config, { width, height, ...opts });
}

async function generateWithChartJS(config, opts) {
  const { ChartJSNodeCanvas } = _chartjs;
  const canvas = new ChartJSNodeCanvas({ width: opts.width, height: opts.height });
  const buffer = await canvas.renderToBuffer(config);
  if (opts.outputPath) {
    fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
    fs.writeFileSync(opts.outputPath, buffer);
    return { path: opts.outputPath, format: 'png', width: opts.width, height: opts.height, size: buffer.length };
  }
  return { buffer, format: 'png', width: opts.width, height: opts.height, size: buffer.length };
}

function generateSVG(config, opts) {
  const { width, height } = opts;
  const type = config.type || 'bar';
  const datasets = (config.data && config.data.datasets) || [];
  const labels = (config.data && config.data.labels) || [];
  const title = (config.options && config.options.plugins && config.options.plugins.title && config.options.plugins.title.text) || '';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;

  // Title
  if (title) {
    svg += `<text x="${width / 2}" y="30" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold">${escapeXml(title)}</text>`;
  }

  const margin = { top: title ? 50 : 20, right: 30, bottom: 50, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  if (type === 'bar' && datasets.length > 0) {
    svg += generateBarSVG(datasets, labels, margin, chartWidth, chartHeight);
  } else if (type === 'line' && datasets.length > 0) {
    svg += generateLineSVG(datasets, labels, margin, chartWidth, chartHeight);
  } else if ((type === 'pie' || type === 'doughnut') && datasets.length > 0) {
    svg += generatePieSVG(datasets, labels, width, height, type === 'doughnut');
  }

  // X-axis labels
  if (type !== 'pie' && type !== 'doughnut') {
    const step = chartWidth / Math.max(labels.length, 1);
    labels.forEach((label, i) => {
      const x = margin.left + step * i + step / 2;
      svg += `<text x="${x}" y="${height - 10}" text-anchor="middle" font-family="Arial" font-size="11">${escapeXml(String(label))}</text>`;
    });
  }

  svg += '</svg>';

  if (opts.outputPath) {
    fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
    fs.writeFileSync(opts.outputPath, svg);
    return { path: opts.outputPath, format: 'svg', width, height, size: svg.length };
  }
  return { svg, format: 'svg', width, height, size: svg.length };
}

function generateBarSVG(datasets, labels, margin, chartWidth, chartHeight) {
  const data = datasets[0].data || [];
  const max = Math.max(...data, 1);
  const barWidth = chartWidth / Math.max(data.length, 1) * 0.7;
  const gap = chartWidth / Math.max(data.length, 1) * 0.3;
  const colors = datasets[0].backgroundColor || ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f'];
  let svg = '';

  data.forEach((value, i) => {
    const barHeight = (value / max) * chartHeight;
    const x = margin.left + i * (barWidth + gap) + gap / 2;
    const y = margin.top + chartHeight - barHeight;
    const color = Array.isArray(colors) ? colors[i % colors.length] : colors;
    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="2"/>`;
    svg += `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" font-family="Arial" font-size="11">${value}</text>`;
  });

  return svg;
}

function generateLineSVG(datasets, labels, margin, chartWidth, chartHeight) {
  const data = datasets[0].data || [];
  const max = Math.max(...data, 1);
  const step = chartWidth / Math.max(data.length - 1, 1);
  const color = datasets[0].borderColor || '#4e79a7';
  let svg = '';

  const points = data.map((value, i) => {
    const x = margin.left + i * step;
    const y = margin.top + chartHeight - (value / max) * chartHeight;
    return `${x},${y}`;
  });

  svg += `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
  data.forEach((value, i) => {
    const x = margin.left + i * step;
    const y = margin.top + chartHeight - (value / max) * chartHeight;
    svg += `<circle cx="${x}" cy="${y}" r="4" fill="${color}"/>`;
  });

  return svg;
}

function generatePieSVG(datasets, labels, width, height, isDoughnut) {
  const data = datasets[0].data || [];
  const total = data.reduce((sum, v) => sum + v, 0) || 1;
  const colors = datasets[0].backgroundColor || ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2', '#59a14f', '#edc949'];
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 40;
  const innerR = isDoughnut ? r * 0.5 : 0;
  let svg = '';
  let startAngle = -Math.PI / 2;

  data.forEach((value, i) => {
    const sliceAngle = (value / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const color = Array.isArray(colors) ? colors[i % colors.length] : colors;

    if (isDoughnut) {
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);
      svg += `<path d="M${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} L${ix2},${iy2} A${innerR},${innerR} 0 ${largeArc} 0 ${ix1},${iy1} Z" fill="${color}"/>`;
    } else {
      svg += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z" fill="${color}"/>`;
    }

    // Label
    const labelAngle = startAngle + sliceAngle / 2;
    const labelR = r * 0.7;
    const lx = cx + labelR * Math.cos(labelAngle);
    const ly = cy + labelR * Math.sin(labelAngle);
    const label = labels[i] || '';
    if (label && sliceAngle > 0.2) {
      svg += `<text x="${lx}" y="${ly}" text-anchor="middle" font-family="Arial" font-size="11" fill="#fff">${escapeXml(String(label))}</text>`;
    }

    startAngle = endAngle;
  });

  return svg;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  CHART_TYPES,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  generate,
  generateSVG,
};
