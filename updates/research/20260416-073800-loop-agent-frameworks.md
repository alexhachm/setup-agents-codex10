# Open-Source Agent Framework Releases — April 2026

## Sources

- https://github.com/langchain-ai/langgraph/releases (LangGraph GitHub Releases)
- https://www.langchain.com/blog/langgraph-0-3-release-prebuilt-agents (LangGraph 0.3 blog, April 9 2026)
- https://docs.crewai.com/en/changelog (CrewAI official changelog, accessed April 16 2026)
- https://github.com/OpenHands/OpenHands/releases (OpenHands GitHub Releases)
- https://openhands.dev/blog/openhands-product-update---march-2026 (OpenHands March 2026 update)
- https://pypi.org/project/openhands/ (OpenHands PyPI — v1.7.1 released April 2, 2026)
- https://x.com/OpenHandsDev/status/2044068158567338229 (OpenHands Twitter, April 14 2026)
- https://www.getpanto.ai/blog/crewai-platform-statistics (CrewAI stats, April 2 2026)
- https://www.firecrawl.dev/blog/best-open-source-agent-frameworks (Firecrawl framework overview, Feb 2026)
- https://gurusup.com/blog/best-multi-agent-frameworks-2026 (GuruSup framework comparison, April 4 2026)
- https://till-freitag.com/blog/langgraph-crewai-autogen-compared (Till Freitag comparison, April 8 2026)
- https://openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared (OpenAgents comparison, Feb 2026)
- https://www.businesswire.com/news/home/20260309511426/en/Dify-Raises-$30-million-Series-Pre-A (Dify Series Pre-A, March 9 2026)
- https://www.devflokers.com/blog/open-source-ai-projects-released-last-24-hours-april-2026 (Devflokers, April 3 2026)

## Relevance to 10.2

10.2 likely involves agent orchestration choices. Understanding the latest releases, version milestones, and capability changes in LangGraph, CrewAI, OpenHands, and other frameworks informs which runtime best fits 10.2's requirements. Recent security patches in these frameworks (especially CVE patches in April 2026) are directly relevant if any are dependencies.

## Findings

### LangGraph (LangChain)

**Current version:** `1.1.7a2` (alpha, released April 14, 2026)
**Stable milestone:** `1.0.0` (released April 2026 — exact date from GitHub shows rc progression culminating in v1.0.0)

**LangGraph 0.3 / Prebuilt Agents (Released ~April 9, 2026):**
- Splitting `create_react_agent` out of main `langgraph` package into new `langgraph-prebuilt` package
- New prebuilt agents released over the past 3 weeks (as of April 9):
  - **Trustcall** — reliable structured extraction
  - **LangGraph Supervisor** — supervisor multi-agent architecture quickstart
  - **LangMem** — long-term memory
  - **LangGraph Swarm** — swarm multi-agent architecture quickstart
- Core philosophy: still "as low level as possible, no hidden prompts or enforced cognitive architectures"
- Used in production by: Replit, Klarna, LinkedIn, Uber

**Checkpointers 3.0 (April 2026):**
- `checkpointpostgres==3.0.0` — breaking changes from 2.x
- `checkpoint==3.0.0` — unified checkpoint API
- Dropped Python 3.9 support; added Python 3.14 cursory support

**GitHub Stars:** 24.8k–25k+
**Monthly Downloads:** 34.5M (as of Feb 2026 Firecrawl report)
**Position:** Leads in enterprise production deployments; standard runtime for all LangChain agents

**Key strengths:** Stateful graph execution, time-travel debugging (LangSmith), checkpointing, human-in-the-loop, LangGraph Cloud managed hosting

---

### CrewAI

**Latest stable release:** `v1.14.1` (April 9, 2026)
**Latest alpha:** `v1.14.2rc1` (April 16, 2026 — most recent)

**April 2026 Release Summary:**

| Version | Date | Key Changes |
|---|---|---|
| v1.14.2rc1 | Apr 16 | Fix cyclic JSON schemas in MCP tool resolution; CVE patches (python-multipart, pypdf) |
| v1.14.2a5 | Apr 15 | Docs only |
| v1.14.2a4 | Apr 15 | Resume hints in devtools; Bedrock Converse strict mode fix; pytest CVE GHSA-6w46-j5rx-g56g |
| v1.14.2a3 | Apr 13 | Deploy validation CLI; LLM init improvements; CVE-2026-40260, GHSA-pjjw-68hj-v9mw, requests CVE temp file; enterprise A2A docs |
| v1.14.2a2 | Apr 10 | **Checkpoint TUI** with tree view + fork support + editable I/O; LLM token tracking (reasoning + cache tokens); `from_checkpoint` kickoff param; checkpoint forking with lineage; NL2SQLTool hardened (read-only default, query validation, parameterized queries) |
| v1.14.2a1 | Apr 9 | Fix HITL flow_finished event; CVE-2026-39892 (cryptography) |
| **v1.14.1** | **Apr 9** | **STABLE**: Async checkpoint TUI browser; `aclose()`/async context manager for streaming; CVE-2026-1839 (transformers) |
| v1.14.0 | Apr 7 | Checkpoint list/info CLI; SqliteProvider; CheckpointConfig; runtime state checkpointing; SSRF + path traversal protections; RAG tool path/URL validation; CVE-2026-35030 (litellm) |
| v1.13.0 | Apr 2 | RuntimeState RootModel; A2UI extension (v0.8/v0.9); telemetry spans; GPT-5.x support; SSO guide; RBAC permissions matrix |

**GitHub Stars:** 47.8k (as of April 2, 2026)
**PyPI Downloads:** 27M total, 5M in last month, 168K/day
**Agentic Executions:** ~2B in the prior 12 months (as of January 2026)

**Key April 2026 themes:**
- **Checkpointing** is the dominant feature focus — full checkpoint TUI, forking, lineage tracking, SqliteProvider, async browser
- **Security patching** — 7 CVEs addressed in April alone (CVE-2026-40260, CVE-2026-39892, CVE-2026-35030, CVE-2026-1839, GHSA-pjjw-68hj-v9mw, GHSA-6w46-j5rx-g56g, requests temp file CVE)
- **A2A (Agent-to-Agent)** — enterprise A2A documentation added
- **Removed CodeInterpreterTool** — deprecated in v1.14.0; code execution params removed

---

### OpenHands (formerly OpenDevin)

**Latest stable:** `1.6.0` (March 30, 2026)
**Latest CLI:** `1.7.1` (released April 2, 2026 on PyPI)
**GitHub Position:** #4 by GitHub stars in 2026 coding agent landscape (per OSSInsight analysis cited April 14)

**Release History (2026):**
| Version | Date | Notes |
|---|---|---|
| 1.7.1 (CLI) | Apr 2, 2026 | PyPI release of CLI tool |
| 1.6.0 | Mar 30, 2026 | Latest stable |
| 1.5.0 | Mar 11, 2026 | — |
| 1.4.0 | Feb 17, 2026 | — |
| 1.3.0 | Feb 2, 2026 | — |

**March 2026 Update Features:**
- **Planning Mode (BETA)** — Planning Agent with Plan/Code mode switching; generates structured `PLAN.md` file from high-level direction; asks clarifying questions for vague prompts
- **GUI Slash Menu** — type `/` to see loaded Agent Skills and select; future: native slash commands for plugins

**Version cadence:** Monthly major releases (1.x.0 every 3–4 weeks)

---

### AutoGen / Microsoft Agent Framework

**Status:** AutoGen in **maintenance mode** (only bug fixes and security patches since October 2025)
- Microsoft merged AutoGen + Semantic Kernel into unified **Microsoft Agent Framework** in October 2025
- Microsoft Agent Framework GA targeted end of Q1 2026 — now shipped (no specific April 2026 release found)
- GitHub Stars: 54.6k (AutoGen), growing
- Primary use case in 2026: research pipelines, conversational multi-agent

---

### Dify

**Recent news:** Raised **$30M Series Pre-A** at $180M valuation (March 9, 2026)
**GitHub Stars:** 70k+ (major enterprise knowledge base / compliance AI framework)
**April 2026:** New updates adding multi-tenant support and expanded observability tooling

---

### n8n

**Updated April 2, 2026** — 162k GitHub stars
- Native AI + MCP client/server support
- Fair-code workflow automation

---

### AutoGPT

**Updated April 2, 2026** — 182k GitHub stars
- Platform for building, deploying, and running autonomous AI agents at scale

---

### Framework Comparison Matrix (April 2026)

| Framework | GitHub Stars | Monthly Downloads | Production Readiness | Best For |
|---|---|---|---|---|
| LangGraph | 24.8k | 34.5M | ⭐⭐⭐⭐⭐ | Stateful workflows, enterprise |
| CrewAI | 47.8k | 5M | ⭐⭐⭐⭐ | Fast prototyping, role-based teams |
| AutoGen | 54.6k | 856k | ⭐⭐⭐ (maintenance) | Research, conversational |
| OpenHands | N/A (top 4) | — | ⭐⭐⭐⭐ | Coding agents |
| Dify | 70k+ | — | ⭐⭐⭐⭐ | Visual builder, RAG, enterprise |
| Google ADK | 17.8k | 3.3M | ⭐⭐⭐ (newest) | A2A, multimodal, Vertex |
| OpenAI Agents SDK | 19k | 10.3M | ⭐⭐⭐⭐ | Handoffs, guardrails |

---

### Emerging Trend: Kimi K2.5 Swarm

Multiple framework comparison sources mention **Kimi K2.5 Swarm** as a best-of-breed for parallel data gathering — 100 agents, zero framework overhead. Moonshot AI's open-source reasoning model, hosted on Perplexity's inference stack. Native Agent Swarm capability is a distinct deployment pattern separate from LangGraph/CrewAI.

---

### Security-Relevant Patches (April 2026, CrewAI)

Four CVEs addressed in CrewAI during April alone (directly relevant if using CrewAI as dependency):
- **CVE-2026-40260** — pypdf vulnerability (patched in v1.14.2a3)
- **CVE-2026-39892** — cryptography library (patched in v1.14.2a1)
- **CVE-2026-35030** — litellm (patched in v1.14.0)
- **CVE-2026-1839** — transformers library (patched in v1.14.1)
- **GHSA-pjjw-68hj-v9mw** — uv (patched in v1.14.2a3)
- **GHSA-6w46-j5rx-g56g** — pytest (patched in v1.14.2a4)
- **VU#221883** — CrewAI multiple vulnerabilities allowing prompt injection → RCE, SSRF, file read (Code Interpreter, default configs) — reported in Adversa AI April 2026 roundup

## Recommended Action

1. **If using CrewAI:** Pin to **v1.14.1 or later** immediately — critical security patches for CVE-2026-39892, CVE-2026-35030, and the Code Interpreter RCE chain (VU#221883). Remove any use of `CodeInterpreterTool` (deprecated in v1.14.0).
2. **If using LangGraph:** Evaluate upgrade to **v1.0.0** stable; Checkpointers 3.0 is a breaking change from 2.x — plan migration. The new prebuilt agents (LangGraph Supervisor, LangGraph Swarm) can reduce custom orchestration code for 10.2.
3. **OpenHands Planning Mode** — if 10.2 involves a planning phase before execution, the new Planning Agent + PLAN.md pattern is worth evaluating.
4. **Consider Kimi K2.5 Swarm** for parallel data gathering within 10.2 workflows — zero framework overhead for high-parallelism subtasks.
5. **Watch for Microsoft Agent Framework GA** — if AutoGen is in use, plan migration; AutoGen is maintenance-mode only.
6. **CrewAI Checkpoint TUI** (v1.14.2a2) — strong debugging tool for 10.2 development; checkpoint forking with lineage tracking enables rapid iteration on agent workflows.

## Priority

**HIGH for security patches** — CrewAI has 6+ CVEs patched in April 2026 alone; if it's a dependency, update immediately.

**MEDIUM for feature tracking** — LangGraph 0.3 prebuilt agents and CrewAI checkpoint TUI are valuable new capabilities but not blocking. Monitor LangGraph v1.0.0 stable for production upgrade path.
