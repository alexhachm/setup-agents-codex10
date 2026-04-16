---
name: deep-research
description: Extended multi-step research with iterative refinement
triggers:
  - deep research
  - comprehensive analysis
  - thorough investigation
  - deep dive
agent_type: researcher
model_preference: deep
---

# Deep Research Skill

Conduct extended, multi-step research with iterative query refinement.

## Protocol

1. Decompose the research question into sub-questions
2. For each sub-question:
   a. Search multiple verticals (academic, general, finance)
   b. Browse top results for detailed content
   c. Extract key facts and store citations
3. Cross-reference findings across sub-questions
4. Identify gaps and generate follow-up queries
5. Iterate until sufficient coverage is achieved
6. Synthesize into a comprehensive report

## Output Format

```
## Deep Research: {topic}

### Executive Summary
{2-3 paragraph overview}

### Detailed Findings
#### {Sub-topic 1}
{findings with inline citations}

#### {Sub-topic 2}
{findings with inline citations}

### Knowledge Gaps
- {areas needing further investigation}

### Sources ({count} total)
1. {citation}
```

## Guidelines

- Maximum 5 research iterations per topic
- Minimum 3 sources per key claim
- Always include confidence levels
- Flag outdated information (>1 year old)
- Store all citations for future reference
