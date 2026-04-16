# Topic
Document generation best practices (PDF/Office generation reliability + security)

## Sources (URLs)
- https://doc.courtbouillon.org/weasyprint/stable/changelog.html

## Relevance to 10.2
10.2 needs dependable, secure document generation (reports, PDFs) and should avoid common pitfalls around remote asset fetching, redirects, and rendering differences across PDF viewers.

## Findings
- WeasyPrint 68.0 (2026-01-19) is a security update addressing CVE-2025-68616, and the project “strongly recommend[s]” upgrading if you use `default_url_fetcher()` or its `allowed_protocols` parameter ([WeasyPrint changelog](https://doc.courtbouillon.org/weasyprint/stable/changelog.html)).
- WeasyPrint 68.0 deprecates `default_url_fetcher()` in favor of a new `URLFetcher` class and notes a Python API change where `DocumentMetadata.generate_rdf_metadata` becomes a method override rather than a parameter, implying downstream wrappers need to be updated to keep PDF metadata customization working ([WeasyPrint changelog](https://doc.courtbouillon.org/weasyprint/stable/changelog.html)).
- WeasyPrint 68.1 (2026-02-06) includes fixes that matter for real-world HTML-to-PDF stability and fidelity, including transparency rendering fixes for Acrobat/Edge and multiple SVG robustness improvements ([WeasyPrint changelog](https://doc.courtbouillon.org/weasyprint/stable/changelog.html)).

## Recommended Action
- If 10.2 uses HTML-to-PDF conversion with remote asset fetching, treat URL fetcher behavior as security-sensitive: explicitly model redirect handling and allowed protocols, and prefer audited fetcher implementations (mirroring WeasyPrint’s move to `URLFetcher`) ([WeasyPrint changelog](https://doc.courtbouillon.org/weasyprint/stable/changelog.html)).
- Add a regression test suite that renders representative PDFs and validates them in multiple viewers (Acrobat/Chromium) to catch transparency/SVG/layout differences early ([WeasyPrint changelog](https://doc.courtbouillon.org/weasyprint/stable/changelog.html)).

## Priority
Medium
