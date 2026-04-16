# Topic
New open-source agent frameworks or major releases: Microsoft Agent Framework 1.0

## Sources (URLs)
- https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/

## Relevance to 10.2
Microsoft Agent Framework 1.0 is a major, production-positioned orchestration SDK that explicitly names **MCP** interoperability and multi-agent patterns; it is a likely “reference competitor” for how to package agent orchestration + memory + workflows for enterprise users.

## Findings
- Microsoft announced **Agent Framework 1.0** for both **.NET and Python**, describing it as production-ready with stable APIs and long-term support. [Microsoft Agent Framework blog](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)
- The announcement frames the framework as a unification of **Semantic Kernel** foundations with **AutoGen** orchestration patterns into an open-source SDK. [Microsoft Agent Framework blog](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)
- 1.0 feature surface includes: pluggable **agent memory/context providers** (KV state + vector retrieval, with backends like Mem0/Redis/Neo4j), a **graph-based workflow engine** with checkpointing/hydration for long-running processes, and stable multi-agent orchestration patterns (sequential, concurrent, handoff, group chat, Magentic-One). [Microsoft Agent Framework blog](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)
- The release explicitly calls out **MCP support** for dynamic tool discovery/invocation and mentions **A2A** (agent-to-agent) protocol support “coming soon.” [Microsoft Agent Framework blog](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/)

## Recommended Action
- Treat Agent Framework as a parity benchmark: confirm what “MCP support” means in practice (client-side discovery UX, auth handling, streaming tool results), and compare its checkpointing/hydration approach to mac10 10.2’s long-running task model.

## Priority
Medium-High
