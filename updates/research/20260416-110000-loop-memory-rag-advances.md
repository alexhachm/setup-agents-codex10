# Topic
Memory and RAG advances (new embedding models, retrieval strategies, MemGPT/Letta)

## Sources (URLs)
- https://blogs.bing.com/search/April-2026/Microsoft-Open-Sources-Industry-Leading-Embedding-Model
- https://www.letta.com/blog/memgpt-and-letta

## Relevance to 10.2
Perplexity Computer feature parity depends on (a) strong, multilingual retrieval/grounding and (b) memory that persists across sessions without contaminating future behavior.

## Findings
- Microsoft open-sourced a new embedding model family, **Harrier**, positioned for “agentic web” grounding, supporting 100+ languages and a 32k context window, with fixed-size embeddings intended for vector search integration. ([Microsoft Bing blog](https://blogs.bing.com/search/April-2026/Microsoft-Open-Sources-Industry-Leading-Embedding-Model))
- Microsoft claims Harrier ranks 1st on the multilingual MTEB-v2 benchmark (as of April 6, 2026), with Harrier-OSS-v1-27B reported at 74.27 mean score and smaller distilled variants (-0.6B and -270M) providing lower-cost deployment options. ([Microsoft Bing blog](https://blogs.bing.com/search/April-2026/Microsoft-Open-Sources-Industry-Leading-Embedding-Model))
- Microsoft frames improved embeddings as reducing cost/latency by enabling “better first-pass retrieval” and “smaller contexts” (fewer retries, less prompt stuffing), implying a direct link between embedding quality and agent stability/cost. ([Microsoft Bing blog](https://blogs.bing.com/search/April-2026/Microsoft-Open-Sources-Industry-Leading-Embedding-Model))
- Letta formalized MemGPT’s transition under the Letta umbrella, explicitly stating they will maintain the open-source MemGPT repository while focusing commercial efforts on deployability; they also describe “Letta Code” as a runtime combining git-backed memory, skills, subagents, and multi-model deployment. ([Letta blog](https://www.letta.com/blog/memgpt-and-letta))
- Letta introduced a “Context Constitution” concept (principles governing how agents manage context to learn from experience), which is directly relevant to designing memory write policies and preventing accidental long-term contamination. ([Letta blog](https://www.letta.com/blog/memgpt-and-letta))

## Recommended Action
- Evaluate Harrier as a candidate embedding backbone for multilingual grounding and retrieval; if self-hosting isn’t feasible, mirror its design assumptions (multilingual + long-input embedding) when selecting providers.
- Treat “smaller context via better retrieval” as a cost lever: prioritize high-recall embeddings + reranking over prompt-length increases.
- For memory, adopt a “constitution”-style policy: explicit criteria for what gets written to persistent memory, plus segmentation (per task/project/user) and reviewability to reduce memory poisoning risk.

## Priority
High
