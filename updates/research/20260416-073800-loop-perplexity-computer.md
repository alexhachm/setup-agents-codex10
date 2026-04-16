# Perplexity Computer Latest Updates — April 2026

## Sources

- https://releasebot.io/updates/perplexity-ai (Releasebot — Perplexity Release Notes March 2026)
- https://www.perplexity.ai/changelog (Official Perplexity Changelog, latest entry 2026-03-27)
- https://docs.perplexity.ai/docs/resources/changelog (Perplexity API Changelog, accessed 2026-04-14)
- https://www.perplexity.ai/changelog/what-we-shipped---march-6-2026 (March 6 What We Shipped)
- https://linas.substack.com/p/perplexity-computer-guide (Linas's Newsletter, April 2026 guide)
- https://blog.mean.ceo/perplexity-news-april-2026/ (Mean CEO Blog, April 9 2026)
- https://www.reddit.com/r/perplexity_ai/comments/1skcnwi/ (Reddit r/perplexity_ai bug report, April 13 2026)
- https://techcrunch.com/2026/02/27/perplexitys-new-computer-is-another-bet-that-users-need-many-ai-models/ (TechCrunch)
- https://www.alphamatch.ai/blog/perplexity-computer-ai-agent-19-models (Alpha Match Technology)

## Relevance to 10.2

Perplexity Computer is the primary platform this project is being built within. Understanding the current feature state, pricing, available models, connector ecosystem, and known pain points directly informs 10.2 architecture decisions around subagent design, connector integration, credit consumption, and UX expectations.

## Findings

### Launch & Growth Context
- Perplexity Computer launched **February 25, 2026** for Max subscribers ($200/month).
- By March 2026, Perplexity ARR surpassed **$450M**, roughly doubling from ~$200M in February — spike driven by Computer adoption and shift to usage-based pricing.
- Enterprise access opened at the **Ask 2026 developer conference** (early March); 100+ enterprises requested access within one weekend.
- By April 2026, Computer is available to **Pro subscribers** (expanded from Max-only on March 13) and all Enterprise Max/Pro subscribers.

### April 2026 Specific Updates (API / Platform)

**Perplexity API Changelog (April 2026):**
- **New Integration: n8n** — native Perplexity node with full API coverage (Chat Completions, Agent, Search, Embeddings); models load dynamically.
- **New Integration: OpenClaw** — OpenClaw terminal AI agent supports Perplexity Search API as native web search provider. Structured results (`title`, `url`, `snippet`) inside terminal workflows.
- **AWS Marketplace listing** — API credits purchasable via AWS Marketplace for consolidated billing.
- **`/v1/models` endpoint** — new `GET /v1/models` lists all available Agent API models in OpenAI-compatible format; no auth required.
- **Third-party models in Agent API** — GPT-5.4, NVIDIA Nemotron, Claude Sonnet 4.6, and Gemini 3.1 Pro Preview now available via Agent API for tool-calling and structured outputs.
- **Location filtering in search** — user location filtering now supported in search API.
- **Image uploads for all users** — multimodal image uploads now available via Sonar.

### March 2026 Shipped Features (Directly Relevant Runway Context)

**March 27 Update:**
- **Comet iOS launch** across major platforms.
- **Inline editing for Computer-generated assets** — draw a selection box over a doc/slide/sheet, type a short instruction; Computer edits in place.
- **Scheduled task management** — homescreen view shows all scheduled tasks; individual pause/cancel controls.
- **Smarter long conversations** — Computer detects long conversations and offers: extend full context (richer, more expensive) or summarize and continue (lower cost). Appears inline, non-blocking.
- **Live credit counter** — running credit total visible in real-time as Computer works.
- **Multi-select bulk delete** for tasks; single-task deletion now has confirmation dialog.
- **Computer Enterprise Workflows** — 6 total workflows available (2 new): website generation, website audit (SEO/GEO, accessibility, brand positioning).
- **Connector updates**: Added **Vercel connector**; improved **Box connector** (read/write); attachments now sendable via email (e.g., email a generated report).
- **Deep Research → structured outputs**: Deep Research and Pro Search can now create presentations, spreadsheets, dashboards, and websites directly.

**March 13 Update:**
- Computer available to **all Pro subscribers** (web + iOS App Store).
- Computer for **Enterprise** (Snowflake, Salesforce, HubSpot integration); Computer in Slack.
- Model access expanded: 20+ advanced models, prebuilt and custom skills, 400+ connectors.

**March 6 Update:**
- **Custom Skills** — automate repeating tasks.
- **Model Council** — parallel frontier models in one conversation.
- **Voice Mode** launched.
- **GPT-5.3-Codex subagent** — dedicated coding subagent; can write thousands of lines, fix bugs via browser dev tools, push directly to GitHub.
- **GPT-5.4 and GPT-5.4 Thinking** — available to Pro and Max subscribers.

### Model Roster (as of April 2026)
| Model | Primary Role |
|---|---|
| Claude Opus 4.6 | Core orchestration, coding (Max default) |
| Claude Sonnet 4.6 | Comet agent (Pro default) |
| GPT-5.4 / GPT-5.4 Thinking | Reasoning, coding, creative |
| GPT-5.3-Codex | Dedicated coding subagent |
| Gemini 3.1 Pro | Deep research, sub-agent creation |
| Grok | Speed-sensitive lightweight tasks |
| Veo 3.1 | Video generation |
| Nano Banana | Image generation |
| Kimi K2.5 | Open-source reasoning, low latency |
| NVIDIA Nemotron | Available via Agent API |
| +8 additional | Domain-specific subtasks |

### Known User Complaints / Bugs (April 2026)

1. **Task/history data loss on org removal** — Reddit r/perplexity_ai (April 13, 2026): User lost all saved Computer tasks and search history after removing an organization from their account. Support response time: 10+ days with no human reply. High-frustration signal for $200/month tier.
2. **Support responsiveness** — multiple reports of 4–10 day waits for support on billing issues (missing receipts, subscription problems).
3. **Credit limit frustrations** — some users report feeling constrained on credit limits, considering cancellation.
4. **Perplexity canceled a press demo** (at launch, late February) hours before it was scheduled after discovering product flaws — suggests rapid-iteration culture with occasional instability.
5. **Output watermarks** — "Created with Perplexity Computer" watermarks on generated apps (similar to other AI builders).

### Pricing & Access (Current)
- **Max**: $200/month (10,000 credits included; computer tasks deduct from credits)
- **Pro**: Computer now included (expanded March 13); lower spend limits, no monthly credits baseline
- **Enterprise**: Max and Pro tiers; Snowflake, Salesforce, HubSpot integrations, Slack workflows, granular admin controls, expanded audit logs

### Competitive Positioning
- Perplexity frames Computer as winning the **orchestration layer** above model vendors.
- Key differentiator: **19–20 specialized models** vs. single-model competitors (Claude Cowork uses Anthropic-only models).
- Personal Computer (Mac mini, local hybrid): announced at Ask 2026, initially for Max subscribers.
- ARR growth from ~$200M → $450M in ~6 weeks post-launch = strongest validation signal in Perplexity's history.

## Recommended Action

1. **Account for live credit counter in UX** — users want real-time cost transparency; 10.2 agent workflows should surface credit consumption estimates before executing long tasks.
2. **Test inline editing and structured output pipelines** — the March 27 inline editing and Deep Research → deliverable pipeline are directly relevant to 10.2 output workflows.
3. **Build against Agent API with GPT-5.4 + Sonnet 4.6 fallback chain** — Agent API now supports both; use `/v1/models` endpoint for dynamic model selection.
4. **Incorporate n8n connector** — n8n native Perplexity node enables visual workflow automation; strong candidate for 10.2 orchestration layer.
5. **Monitor support lag risk** — if 10.2 deploys enterprise workloads, plan for self-service recovery from data loss scenarios (do not rely on Perplexity support for time-sensitive issues).
6. **Scheduled task management** — leverage the new homescreen scheduled task view and individual pause/cancel controls for long-running 10.2 agent workflows.

## Priority

**HIGH** — Direct platform dependency. The April API updates (n8n integration, Agent API model expansion, `/v1/models` endpoint) are immediately actionable for 10.2 implementation. The credit counter and inline editing features should inform UX design in the current sprint.
