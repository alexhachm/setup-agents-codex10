'use strict';

/**
 * PPTX generator — creates PowerPoint presentations from content.
 */

const fs = require('fs');

function generatePptx(slides, opts = {}) {
  const title = opts.title || 'Presentation';

  const slideXmls = slides.map((slide, i) => {
    const slideTitle = slide.title || `Slide ${i + 1}`;
    const bullets = (slide.bullets || []).map(b =>
      `<a:p><a:r><a:t>${escapeXml(b)}</a:t></a:r></a:p>`
    ).join('\n          ');

    return `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
     xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:rPr lang="en-US" sz="2800" b="1"/><a:t>${escapeXml(slideTitle)}</a:t></a:r></a:p>
          ${bullets}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
  });

  return {
    type: 'pptx',
    title,
    slides: slideXmls,
    slideCount: slides.length,
  };
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function savePptx(slides, outputPath, opts = {}) {
  const doc = generatePptx(slides, opts);
  const combined = doc.slides.join('\n\n');
  fs.writeFileSync(outputPath, combined, 'utf-8');
  return { path: outputPath, ...doc };
}

module.exports = { generatePptx, savePptx, escapeXml };
