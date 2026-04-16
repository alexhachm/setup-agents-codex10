---
name: research-queue
description: Manage the external research pipeline. Use when workers need external info, research results need inspection, or the research pipeline is stalled.
---

# Research Queue

Manage the mac10 external research pipeline.

## Overview

Workers cannot perform web searches directly. They submit research intents to a queue, processed by `chatgpt-driver.py` in batches. Results stored in `.codex/knowledge/research/topics/`.

## Commands

```bash
mac10 queue-research <topic> "<question>"   # Submit research question
mac10 research-status                        # Check pipeline status
mac10 research-results <topic>               # View results for a topic
mac10 research-batch-run                     # Force a batch run
```

## Research Pipeline

```
Worker submits intent → research_intents table (queued)
  → allocator signals batch availability (every 30s)
  → chatgpt-driver.py picks up batch
  → results stored in .codex/knowledge/research/topics/<topic>/
  → _rollup.md generated per topic
  → overlay.js injects relevant excerpts into future task overlays
```

## Intent States
| State | Meaning |
|-------|---------|
| `queued` | Awaiting batch pickup |
| `running` | Being processed |
| `complete` | Results available |
| `partial_failed` | Some results, retry eligible |
| `failed` | Will not retry |

## Troubleshooting

- **Intents stuck in `queued`**: Check if research driver is running
- **No batch signaling**: Verify allocator loop is active
- **Results not in overlays**: Confirm topic name matches task domain

## Research Source
Ref: coordinator-extensions rollup (research quota/batching), allocator.js (batch signaling)
