'use strict';

/**
 * CLI command: mac10 generate <format> [options]
 *
 * Subcommands:
 *   mac10 generate docx --title "Title" --content "Content" --output file.docx
 *   mac10 generate pdf --title "Title" --content "Content" --output file.pdf
 *   mac10 generate xlsx --data '[{...}]' --output file.xlsx
 *   mac10 generate pptx --slides '[{title,bullets}]' --output file.pptx
 */

const path = require('path');

async function run(args, projectDir) {
  const format = args[0];
  if (!format) {
    return { error: 'Usage: mac10 generate <docx|pdf|xlsx|pptx> [options]' };
  }

  const opts = parseArgs(args.slice(1));

  try {
    const generator = require(`../asset-generators/${format}`);

    switch (format) {
      case 'docx': {
        const content = opts.content || 'Empty document';
        const outputPath = opts.output || path.join(projectDir, `output.${format}`);
        const result = await generator.saveDocx(content, outputPath, { title: opts.title });
        return { ...result, message: `Generated ${format} at ${outputPath}` };
      }
      case 'pdf': {
        const content = opts.content || 'Empty document';
        const outputPath = opts.output || path.join(projectDir, `output.${format}`);
        const result = await generator.savePdf(content, outputPath, { title: opts.title });
        return { ...result, message: `Generated ${format} at ${outputPath}` };
      }
      case 'xlsx': {
        const data = opts.data ? JSON.parse(opts.data) : [{ col1: 'value1' }];
        const outputPath = opts.output || path.join(projectDir, `output.${format}`);
        const result = await generator.saveXlsx(data, outputPath, { sheetName: opts.sheet });
        return { ...result, message: `Generated ${format} at ${outputPath}` };
      }
      case 'pptx': {
        const slides = opts.slides ? JSON.parse(opts.slides) : [{ title: 'Slide 1', bullets: ['Item 1'] }];
        const outputPath = opts.output || path.join(projectDir, `output.${format}`);
        const result = await generator.savePptx(slides, outputPath, { title: opts.title });
        return { ...result, message: `Generated ${format} at ${outputPath}` };
      }
      default:
        return { error: `Unsupported format: ${format}. Use docx, pdf, xlsx, or pptx.` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1]) {
      opts[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return opts;
}

module.exports = { run };
