---
name: asset-creation
description: Generate documents, charts, presentations, and other assets
triggers:
  - create document
  - generate chart
  - make presentation
  - create spreadsheet
  - generate PDF
agent_type: creator
model_preference: fast
---

# Asset Creation Skill

Generate documents, charts, and other assets from structured data.

## Supported Formats

- **PDF** — Reports and formatted documents
- **DOCX** — Word documents with formatting
- **XLSX** — Spreadsheets with data and formulas
- **PPTX** — Presentations with slides
- **Charts** — Bar, line, pie, doughnut, scatter (SVG/PNG)

## Protocol

1. Determine the asset type from the request
2. Gather and structure the content
3. Apply appropriate formatting and styling
4. Generate the asset file
5. Return the file path and metadata

## Guidelines

- Use clear, professional formatting
- Include appropriate headers and labels
- Ensure data accuracy in charts and tables
- Generate accessible content where possible
