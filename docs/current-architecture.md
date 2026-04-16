# mac10 10.2 — Current Architecture

## Overview

mac10 is a multi-agent orchestration system that coordinates parallel AI workers
for software engineering tasks. Version 10.2 adds Perplexity Computer feature
parity: multi-provider LLM support, browser automation, search/research,
connectors, media generation, and deployment pipelines.

## Core Components

### Coordinator (`coordinator/src/`)

The coordinator is the central process that manages all state and lifecycle:

- **index.js** — Entry point, starts all subsystems
- **db.js** — SQLite WAL database abstraction (4600+ lines)
- **cli-server.js** — Unix socket IPC for `mac10` commands
- **allocator.js** — 2s tick loop: promotes tasks, signals worker assignment
- **watchdog.js** — Worker health monitoring, stale recovery
- **merger.js** — PR merge orchestration with circuit breaker
- **auto-sync.js** — Periodic git fetch + rebase

### Settings & Providers (Sprint 0)

- **settings-manager.js** — Loads `~/.mac10/settings.json` + `.mac10/settings.json`
  - Dev mode: workers spawn via `claude`/`codex` CLI in tmux
  - Live mode: direct API calls through api-backend
- **model-router.js** — Maps routing classes (fast/deep/economy/code/research/browser)
  to provider + model. Checks: task override → DB rules → settings → defaults
- **provider-fallback.js** — Retry + fallback chain execution
- **api-backend.js** — Direct HTTP API calls (Anthropic, OpenAI, Google, DeepSeek)
- **plugins/agents/** — Provider plugins (codex, deepseek, gemini)

### Search & Research (Sprint 1)

- **search/engine.js** — Multi-provider search coordinator
- **search/adapters/** — Perplexity, Brave, Google, Tavily
- **search/verticals/** — Academic, People, Image, Video, Shopping
- **commands/search.js** — `mac10 search` CLI
- **commands/fetch-url.js** — `mac10 fetch-url` CLI
- **db/research.js** — Citation tracking

### Browser Automation (Sprint 2)

- **browser-engine.js** — Playwright browser executor
- **browser-agent.js** — LLM-driven DOM observation → action selection
- **browser-workflow.js** — Multi-step workflow orchestrator
- **commands/confirm.js** — Safety confirmation gate
- Wired to: browser_sessions, browser_research_jobs, browser_callback_events tables

### Skills & Assets (Sprint 3)

- **skill-loader.js** — SKILL.md parser with YAML frontmatter
- **skill-matcher.js** — Keyword matching for skill selection
- **asset-generators/** — Document generation (docx, pdf, xlsx, pptx)
- **cron-scheduler.js** — Scheduled task execution
- **synthesis.js** — Worker output synthesis

### Connectors (Sprint 4)

- **connectors/framework.js** — OAuth flow, token storage, refresh
- **connectors/gmail.js** — Gmail integration
- **connectors/slack.js** — Slack integration
- **connectors/notion.js** — Notion pages/databases
- **connectors/linear.js** — Linear issues/projects
- **connectors/plaid.js** — Financial data (scaffold)
- **egress-proxy.js** — Credential injection for outbound requests

### Media (Sprint 5)

- **media/image-gen.js** — DALL-E image generation
- **media/vision.js** — Multimodal image analysis
- **media/tts.js** — Text-to-speech (OpenAI TTS)
- **media/transcribe.js** — Audio transcription (Whisper)

### Deployment (Sprint 5)

- **deploy/vercel.js** — Vercel deployment
- **deploy/netlify.js** — Netlify deployment
- **deploy/github-pages.js** — GitHub Pages deployment
- **notifier.js** — Multi-channel notifications (webhook, Slack, desktop, email)

### Database Connectors (Sprint 6)

- **connectors/databases/framework.js** — Unified query interface
- **connectors/databases/snowflake.js** — Snowflake adapter
- **connectors/databases/postgresql.js** — PostgreSQL adapter
- **connectors/databases/mysql.js** — MySQL adapter

### Enterprise (Sprint 7)

- **auth/rbac.js** — Role-based access control
- **audit-export.js** — Activity log export (JSON/CSV)
- **api-server.js** — REST + WebSocket API
- **connectors/video-gen.js** — Video generation scaffold

## Database Schema

SQLite WAL mode with 600+ lines of schema. Key tables:

| Table | Purpose |
|-------|---------|
| requests | User requests with tier-based triage |
| tasks | Decomposed work items with dependencies |
| workers | Worker pool (1-8) with tmux sessions |
| mail | Message queue for actor-based routing |
| model_routing_rules | Provider/model routing configuration |
| confirmations | Safety confirmation gate |
| scheduled_tasks | Cron-scheduled automation |
| oauth_credentials | Connector OAuth tokens |
| connector_configs | Connector configuration |
| notification_channels | Notification delivery channels |
| rbac_roles | RBAC role definitions |
| rbac_user_roles | User-role assignments |
| audit_exports | Export tracking |
| research_intents | Research batching |
| browser_sessions | Browser automation sessions |
| project_memory_snapshots | Versioned project context |
| merge_queue | PR merge orchestration |

## Worker Isolation

Priority chain: microsandbox (msb) → Docker → tmux

Decision: Docker remains primary backend. See `docs/isolation-decision.md`.

## Modes

- **Dev mode** (default): Workers spawn via `claude`/`codex` CLI in tmux.
  All orchestration happens through file-based IPC and the coordinator.
- **Live mode**: Direct API calls via api-backend.js. Supports multi-provider
  routing with automatic fallback.

## Testing

- Node.js built-in test runner (`node --test`)
- 900+ tests across 25+ test suites
- Run: `cd coordinator && node --test tests/*.test.js`

## CLI

All commands via `mac10`:
- `mac10 settings` — Mode/provider configuration
- `mac10 search` — Multi-provider search
- `mac10 media` — Image/vision/TTS/transcription
- `mac10 deploy` — Deploy to Vercel/Netlify/GitHub Pages
- `mac10 connect` — Connector management
- `mac10 generate` — Asset generation
- `mac10 schedule` — Cron scheduling
- `mac10 approve/deny` — Safety confirmations
- `mac10 emergency-stop` — Kill all workers
