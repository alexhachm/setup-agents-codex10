# Change Summaries

## [46] FIX: merge conflict for task #24 — 2026-03-09
- Domain: coordinator
- Files: coordinator/src/cli-server.js
- What changed: Use completion-state cursor when recovering merge queue entries so retry/refresh logic uses stable task completion ordering and does not rely on timestamp strings.
- PR: not provided (local branch)


Workers append summaries here after completing each task. Newest entries at the top.

## [16] UI refinement: smaller borders, smaller title text — 2026-02-27
- Domain: frontend
- Files: gui/public/styles.css, gui/public/popout.html
- What changed: Softened panel/card borders from #30363d to #21262d for a subtler appearance, and reduced h2 title text from 14px to 12px.
- PR: https://github.com/alexhachm/setup-agents-mac10/pull/2
