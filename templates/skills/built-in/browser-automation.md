---
name: browser-automation
description: Web browsing, scraping, and interactive form filling
triggers:
  - browse
  - open website
  - scrape
  - fill form
  - screenshot
agent_type: browser
model_preference: economy
---

# Browser Automation Skill

Navigate websites, extract content, fill forms, and capture screenshots.

## Protocol

1. Parse the browsing intent (read, interact, extract)
2. Launch browser session via browser engine
3. Navigate to the target URL
4. Execute the requested actions
5. Extract and return relevant content
6. Close the browser session

## Capabilities

- **Navigate** — Go to URLs, follow links
- **Extract** — Get text, tables, structured data
- **Interact** — Click buttons, fill forms, select options
- **Screenshot** — Capture full page or element screenshots
- **Wait** — Wait for elements, network idle

## Guidelines

- Respect robots.txt and rate limits
- Log all outbound requests through egress proxy
- Scan extracted content for injection patterns
- Handle authentication via connector framework
- Set reasonable timeouts (30s default)
