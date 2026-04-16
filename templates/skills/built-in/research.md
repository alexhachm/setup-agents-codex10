---
name: research
description: Multi-source research with citation tracking and synthesis
triggers:
  - research
  - find information about
  - look up
  - investigate
agent_type: researcher
model_preference: deep
---

# Research Skill

Conduct multi-source research on a topic using available search verticals.

## Protocol

1. Parse the research query to identify key concepts and constraints
2. Select appropriate search verticals (academic, finance, general, etc.)
3. Execute parallel searches across selected verticals
4. Deduplicate and rank results by relevance
5. Store citations in the citation database
6. Synthesize findings into a structured summary

## Output Format

```
## Research: {topic}

### Key Findings
- Finding 1 [Source](url)
- Finding 2 [Source](url)

### Sources
1. {title} — {url} (accessed {date})

### Confidence
{high|medium|low} — based on source agreement and quality
```

## Guidelines

- Always cite sources with URLs
- Cross-reference claims across multiple sources
- Flag contradictory findings
- Prefer primary sources over secondary
- Note recency of information
