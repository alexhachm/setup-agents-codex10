# Topic
Latest Perplexity Computer changelog/updates (official + implications)

## Sources (URLs)
- https://www.perplexity.ai/changelog/what-we-shipped---march-6-2026
- https://www.perplexity.ai/changelog/what-we-shipped---march-13-2026

## Relevance to 10.2
These releases materially expand Perplexity Computer’s “agent OS” surface area (custom skills, multi-model consensus, voice control, coding subagent, Slack + Enterprise rollout, MCP-based custom connectors, and document auditing), all of which should be tracked for feature-parity planning in mac10 10.2.

## Findings
- Computer shipped **Custom Skills** (teach once, reuse automatically) and **Model Council** (parallel runs of GPT-5.4, Claude Opus 4.6, Gemini 3.1 Pro with synthesis), plus **Voice Mode** for hands-free iterative instruction. [Perplexity changelog – Mar 6, 2026](https://www.perplexity.ai/changelog/what-we-shipped---march-6-2026)
- Computer added a dedicated coding subagent powered by **GPT-5.3-Codex**, positioned as capable of building/debugging/deploying and “pushing directly to GitHub.” [Perplexity changelog – Mar 6, 2026](https://www.perplexity.ai/changelog/what-we-shipped---march-6-2026)
- Computer expanded availability to **all Pro subscribers** on web + iOS, and to **Enterprise** (including **Slack integration** for running workflows from DMs/channel mentions). [Perplexity changelog – Mar 13, 2026](https://www.perplexity.ai/changelog/what-we-shipped---march-13-2026)
- Perplexity announced **Bring Your Own Connector via MCP**: users can add custom remote connectors by supplying an MCP server URL, with OAuth/API key/open auth options, plus enterprise sharing/admin controls. [Perplexity changelog – Mar 13, 2026](https://www.perplexity.ai/changelog/what-we-shipped---march-13-2026)
- “Final Pass: Document Reviewer” adds an **independent auditing pass** for documents (logic/structure/factual checks), explicitly positioned as “without rewriting from scratch.” [Perplexity changelog – Mar 13, 2026](https://www.perplexity.ai/changelog/what-we-shipped---march-13-2026)

## Recommended Action
- Add to parity tracker: (1) reusable skill authoring + auto-application, (2) built-in multi-model consensus mode, (3) voice-driven iteration during long tasks, (4) dedicated coding subagent with repo push, (5) Slack-first agent UX, (6) MCP remote connector UX + org governance, (7) document auditing “final pass” workflow.

## Priority
High
