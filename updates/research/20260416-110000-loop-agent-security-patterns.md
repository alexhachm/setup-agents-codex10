# Topic
Security patterns for AI agents (prompt injection defense, sandbox escape prevention)

## Sources (URLs)
- https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/
- https://arxiv.org/abs/2601.04795
- https://arxiv.org/abs/2603.02277

## Relevance to 10.2
Perplexity Computer parity requires safe tool execution, robust handling of untrusted tool outputs/web content, and strong isolation for code execution.

## Findings
- OWASP published a dedicated **Top 10 for Agentic Applications** with categories ASI01–ASI10 (Agent Goal Hijack; Tool Misuse; Identity & Privilege Abuse; Agentic Supply Chain Vulnerabilities; Unexpected Code Execution; Memory & Context Poisoning; Insecure Inter-Agent Communication; Cascading Failures; Human-Agent Trust Exploitation; Rogue Agents). ([OWASP Agentic Top 10 blog](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/))
- The OWASP categories map cleanly onto “Computer” agent design: (1) untrusted inputs (web/pages/tool results) → ASI01/ASI02, (2) connector identity + session tokens → ASI03/ASI07, (3) tool registry / MCP ecosystem trust → ASI04, (4) code execution sandboxing → ASI05, (5) persistent memory controls → ASI06/ASI10. ([OWASP Agentic Top 10 blog](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/))
- A Jan 2026 paper proposes defending against **indirect prompt injection** by providing LLMs with precise data via tool-result parsing while filtering injected malicious content, targeting lower attack success rates versus prompt-only defenses. ([arXiv:2601.04795](https://arxiv.org/abs/2601.04795))
- A Mar 2026 paper introduces **SANDBOXESCAPEBENCH**, a benchmark to measure an LLM agent’s ability to escape container sandboxes (Docker/OCI) via misconfiguration, privilege mistakes, kernel flaws, and orchestration weaknesses—implying that “container-only” isolation is increasingly testable and may be insufficient for hostile-code settings. ([arXiv:2603.02277](https://arxiv.org/abs/2603.02277))

## Recommended Action
- Implement an “untrusted-content boundary”: tool outputs and web text must be treated as data, not instructions (parse/structure tool results; strip/ignore instruction-like content).
- Build a security backlog mapped to ASI01–ASI10 (threat model + mitigations) so feature parity work doesn’t ignore agent-specific risks.
- For code execution, adopt stronger isolation than vanilla containers (microVM/gVisor class) and validate via a benchmark suite (consider using SANDBOXESCAPEBENCH-style evaluations).

## Priority
High
