---
name: coordinator-status
description: Query and interpret mac10 coordinator state, task progress, worker health, and merge queue. Use when asked about system status or diagnosing operational issues.
---

# Coordinator Status

Query and interpret mac10 coordinator state for operational awareness.

## Commands

```bash
mac10 status                 # Overall system status
mac10 status --tasks         # Detailed task list
mac10 status --workers       # Worker health
mac10 status --merges        # Merge queue
mac10 diagnostics            # 24h failure counters
```

## Interpretation Guide

### Request States
| State | Meaning |
|-------|---------|
| `created` | Submitted, not yet triaged |
| `triaging` | Architect decomposing into tasks |
| `ready` | Tasks created, awaiting assignment |
| `working` | At least one task in progress |
| `integrating` | All tasks done, merge in progress |
| `complete` | All tasks merged to main |
| `failed` | Unrecoverable failure |

### Worker States
| State | Meaning |
|-------|---------|
| `idle` | Available for assignment |
| `assigned` | Task assigned, not yet started |
| `working` | Actively coding |
| `complete` | Task finished, PR shipped |

### Merge States
| State | Meaning |
|-------|---------|
| `queued` | Waiting in merge pipeline |
| `merging` | Merge in progress |
| `merged` | Successfully merged to main |
| `conflict` | Needs resolution |

## Troubleshooting Patterns

- **Stuck in `assigned`**: Worker may have crashed before starting. Check for stale heartbeats.
- **Stuck in `merging`**: Merger may be blocked. Check diagnostics for merge timeout errors.
- **Worker `idle` but tasks `ready`**: Allocator may not be running. Verify coordinator process.
- **Request stuck in `triaging`**: Architect agent may be down. Check Master-2 tmux window.

## Research Source
Ref: coordinator-core rollup (state machine lifecycle), coordinator-routing rollup (assignment flow), status rollup (entity lifecycle tracking)
