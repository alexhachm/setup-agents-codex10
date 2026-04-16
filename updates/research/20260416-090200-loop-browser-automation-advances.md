# Browser automation advances (Playwright Agents, Browser Use, Devin browser parity)

## Sources (URLs)
- https://browser-use.com/changelog
- https://browser-use.com/changelog/12-4-2026
- https://dev.to/playwright/playwright-agents-planner-generator-and-healer-in-action-5ajh
- https://getdecipher.com/blog/whats-new-with-playwright-in-2026
- https://docs.devinenterprise.com/release-notes/2026
- https://github.com/Skyvern-AI/skyvern/releases

## Relevance to 10.2
Perplexity Computer parity depends on robust browser-control primitives (dialog handling, file choosers, navigation guards), plus higher-level “agent loops” (plan → generate → repair) that can be packaged as reusable skills.

## Findings
- Browser Use is explicitly pushing toward “agent-safe” credential handling: its April 12, 2026 changelog entry highlights BYOK (“bring your own keys”), a Code Mode to generate reusable automation scripts, and “pass secrets securely,” implying an opinionated interface for secret injection into automation runs. ([Browser Use changelog](https://browser-use.com/changelog))
- Browser Use’s March 22, 2026 changelog entry calls out “CLI 2.0” plus stealth upgrades, reinforcing that CDP-based control + stealth browser infra is becoming table-stakes for real-site automation at scale. ([Browser Use changelog](https://browser-use.com/changelog))
- Playwright is productizing a plan/generate/repair loop as a first-class workflow: Playwright Agents (v1.56) consist of Planner (test plan), Generator (test files), and Healer (debug/fix failing tests), created via `npx playwright init-agents --loop=...`. ([DEV Community post](https://dev.to/playwright/playwright-agents-planner-generator-and-healer-in-action-5ajh))
- A 2026 Playwright recap notes that the 1.58 line focuses on debugging ergonomics (HTML report Timeline, UI/Trace Viewer polish) and highlights that Playwright Test Agents entered earlier (1.56) as planner/generator/healer loops—evidence of “agent workflows” moving into mainstream automation tooling. ([Decipher AI](https://getdecipher.com/blog/whats-new-with-playwright-in-2026))
- Devin’s April 10, 2026 release notes claim “Browser Tool Parity Improvements”: handling native browser dialogs, intercepting file chooser prompts, respecting navigation guards, and restoring focus correctly—concrete examples of low-level parity gaps that usually break automation agents. ([Devin release notes](https://docs.devinenterprise.com/release-notes/2026))
- Skyvern’s latest tagged OSS release shown (v0.2.13, Sep 10, 2025) includes incremental fixes and “CloudStorageBlock” support; while not new in 2026, it remains a reference implementation for block-based browser/workflow execution patterns. ([Skyvern releases](https://github.com/Skyvern-AI/skyvern/releases))

## Recommended Action
- Add a “browser parity checklist” for Computer: dialogs, file chooser interception, navigation guards, focus/active element restoration, downloads/filenames, iframe typing/clicking; treat as release-gating items because competitors are explicitly advertising them. (Devin notes give a good seed list.) ([Devin release notes](https://docs.devinenterprise.com/release-notes/2026))
- Implement a Playwright-Agents-inspired “Plan → Execute → Heal” loop as a reusable higher-level skill template for Perplexity Computer tasks; keep the loop provider-agnostic (could run on Playwright, CDP, or proprietary control). ([DEV Community post](https://dev.to/playwright/playwright-agents-planner-generator-and-healer-in-action-5ajh))
- For secret handling, consider adopting Browser Use’s framing: BYOK + secure secret passing + code generation mode for repeatability, so users can run automations without sharing provider keys or leaking credentials into logs. ([Browser Use changelog](https://browser-use.com/changelog))

## Priority
High
