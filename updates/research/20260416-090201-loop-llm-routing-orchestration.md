# LLM routing/orchestration research (deterministic multi-agent routing)

## Sources (URLs)
- https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1748735/full
- https://github.com/lm-sys/routellm

## Relevance to 10.2
Computer-style agents need predictable tool-routing and multi-model cost control. Deterministic orchestration patterns reduce debugging pain and make production behavior reproducible.

## Findings
- ORCH (Frontiers in AI, Feb 2026) proposes a deterministic “Many Analyses, One Merge” multi-agent orchestrator for discrete-choice reasoning, motivated by common problems in multi-agent systems: non-determinism, high cost, and poor reproducibility. ([Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1748735/full))
- ORCH’s optional routing module uses exponential moving averages (EMA) of per-agent quality/latency/cost/stability signals to score agents and guide selection, with the explicit goal of stable routing rather than stochastic sampling. ([Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1748735/full))
- The paper is focused on benchmarkable tasks (MMLU, MMLU-Pro, GSM8K) but the architectural idea generalizes: (1) normalize the task, (2) run multiple specialized analyses in parallel, (3) merge via a dedicated “arbiter,” and (4) optionally adjust which agents are invoked based on smoothed historical performance signals. ([Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1748735/full))
- RouteLLM (LM-SYS) remains the most widely referenced open framework for serving/evaluating LLM routers, but its main public artifact is still the GitHub repo; no new 2026-specific update surfaced in this run. ([RouteLLM repo](https://github.com/lm-sys/routellm))

## Recommended Action
- For Computer 10.2, consider a deterministic orchestration mode as the default (especially for tool execution), with a strict merge/arbiter step rather than “best of N” free-form outputs; determinism improves debuggability and safety reviews. ([Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1748735/full))
- If multi-model routing is used, use EMA-smoothed operational signals (success rate, timeouts, latency, approximate cost) to avoid thrash; avoid stochastic routers in production unless explicitly configured for exploration. ([Frontiers](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2026.1748735/full))

## Priority
Medium
