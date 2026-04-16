# Topic
Cost management and token tracking patterns for multi-model systems

## Sources (URLs)
- https://uptrace.dev/blog/opentelemetry-ai-systems
- https://langfuse.com/integrations/native/opentelemetry
- https://oneuptime.com/blog/post/2026-02-06-track-token-usage-prompt-costs-model-latency-opentelemetry/view
- https://lobehub.com/mcp/wn01011-llm-token-tracker

## Relevance to 10.2
Perplexity Computer parity needs reliable per-tool/per-model cost attribution, alerting for runaway loops, and privacy-safe observability across agent spans.

## Findings
- OpenTelemetry’s GenAI semantic conventions are converging as the “lingua franca” for token and agent observability, with common span attributes like `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens`, plus token counters like `gen_ai.client.token.usage` segmented by model and token type. ([Uptrace](https://uptrace.dev/blog/opentelemetry-ai-systems))
- A practical cost-control pattern is to alert on sudden token-rate spikes (e.g., `gen_ai.client.token.usage` rate > 2× baseline over 10 minutes) as a detection signal for runaway agent loops or prompt injection–driven tool spam. ([Uptrace](https://uptrace.dev/blog/opentelemetry-ai-systems))
- Privacy pattern: log prompt/completion content as span *events* (not attributes), cap lengths (e.g., 500–1000 chars), and optionally redact/hash at the OTEL Collector layer to avoid indexing PII while still enabling debugging. ([Uptrace](https://uptrace.dev/blog/opentelemetry-ai-systems))
- Langfuse is positioning an “OTEL-native SDK” (v3) that converts OTEL spans into its own observation model and adds first-class helpers for token usage, cost tracking, prompt linking, and scoring; it also emphasizes propagating trace-level attributes like user/session IDs via OpenTelemetry baggage. ([Langfuse](https://langfuse.com/integrations/native/opentelemetry))
- A concrete reference implementation for OTEL-based tracking includes histograms/counters for input/output/total tokens, cost (USD), latency, errors, and time-to-first-token for streaming, with labels for model and feature attribution to support per-feature budgets. ([OneUptime](https://oneuptime.com/blog/post/2026-02-06-track-token-usage-prompt-costs-model-latency-opentelemetry/view))
- MCP ecosystem is starting to publish dedicated “token tracker” servers (example listed on LobeHub) that can provide session-level remaining/used tokens and costs and can be integrated like any other tool endpoint. ([LobeHub](https://lobehub.com/mcp/wn01011-llm-token-tracker))

## Recommended Action
- Adopt OTEL GenAI attribute names as the canonical internal schema for Computer’s observability layer (even if exported elsewhere) to ease interoperability with existing tooling.
- Implement “runaway detection” based on token-rate anomalies and tool-call bursts, wired into an automatic circuit-breaker (pause + require human confirmation) for high-risk actions.
- Ensure content logging is event-based and collector-redactable by design; default to no prompt logging in production with opt-in sampling for debugging.
- Evaluate whether a lightweight MCP token/cost server is worth adding to the 10.2 tool ecosystem as a standard capability, especially for multi-provider routing.

## Priority
High
