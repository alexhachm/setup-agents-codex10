# Competing agent platforms updates (OpenAI Operator/CUA, Devin multi-agent + ACP)

## Sources (URLs)
- https://openai.com/index/introducing-operator/
- https://openai.com/index/computer-using-agent/
- https://docs.devinenterprise.com/release-notes/2026

## Relevance to 10.2
Perplexity Computer competes directly with “computer-use” agent products. The differentiators increasingly appear to be safety/confirmation patterns, browser parity, and ecosystem/connector surfaces.

## Findings
- OpenAI’s Operator announcement states that Operator was integrated into ChatGPT as “ChatGPT agent” (July 17, 2025 update), accessed via “agent mode” in the composer, and that the standalone Operator site would sunset. ([OpenAI Operator](https://openai.com/index/introducing-operator/))
- OpenAI describes Operator as powered by the Computer-Using Agent (CUA) model, trained to interact with GUIs via screenshots + mouse/keyboard actions, and emphasizes explicit safeguards: takeover mode for sensitive inputs, user confirmations before significant actions, and additional defenses against prompt injection on websites. ([OpenAI Operator](https://openai.com/index/introducing-operator/))
- The CUA page reports benchmark results for a universal interface agent: 38.1% on OSWorld, 58.1% on WebArena, and 87.0% on WebVoyager, positioning this as a headline competitive metric cluster for “computer use.” ([OpenAI CUA](https://openai.com/index/computer-using-agent/))
- Devin’s March–April 2026 release notes show rapid productization of multi-agent/team workflows (e.g., “Devin Manages Devins,” Agents tab for child sessions) and protocol work: “Richer ACP Methods and @-Mentions” expands Agent Client Protocol methods including listing repositories, saving secrets, approving deploys, and attaching to the interactive browser. ([Devin release notes](https://docs.devinenterprise.com/release-notes/2026))
- Devin also claims “One-Click MCP OAuth Install” and “Personal MCP Servers,” pointing to a connector ecosystem moving toward smoother OAuth install flows and per-user authorization rather than only org-shared credentials. ([Devin release notes](https://docs.devinenterprise.com/release-notes/2026))

## Recommended Action
- Track (and potentially adopt) OSWorld/WebArena/WebVoyager-style evaluation for Computer as competitive benchmarks, since OpenAI is anchoring its positioning on them. ([OpenAI CUA](https://openai.com/index/computer-using-agent/))
- Mirror Operator’s safety UX: explicit takeover mode, confirmation checkpoints, and prompt-injection defenses that are stated in product copy (not just internal docs), because this is now part of competitive differentiation. ([OpenAI Operator](https://openai.com/index/introducing-operator/))
- For ecosystem parity, prioritize “OAuth install” UX for connectors/MCP-like servers and support per-user credential binding (not only org-wide), as Devin is advertising both. ([Devin release notes](https://docs.devinenterprise.com/release-notes/2026))

## Priority
High
