# Document Templates

Pre-built templates for asset generation by mac10 workers.

## Available Templates

### DOCX — Report Template (`report-template.md`)
Markdown-based report template with structured sections. Workers use this as a starting point for generating documentation deliverables.

Sections: Title, Executive Summary, Findings, Recommendations, Appendix.

### PPTX — Slide Layout Guide (`slide-layouts.md`)
Slide layout definitions for presentation generation. Defines standard slide types and content placement.

Layouts: Title Slide, Section Header, Content + Image, Two-Column, Data Table, Summary.

## Usage

Workers reference these templates when tasks require document generation:
```bash
# In task overlay, workers see:
# "Use templates/documents/report-template.md as the base structure"
```

## Format Notes

Templates are in Markdown format for maximum compatibility. Workers convert to final format (DOCX/PPTX) using available tools:
- **DOCX**: `pandoc` with custom reference doc, or direct markdown
- **PPTX**: `pandoc` with slide reference, or `python-pptx` for programmatic generation
- **PDF**: `pandoc` or `weasyprint` from HTML/markdown
