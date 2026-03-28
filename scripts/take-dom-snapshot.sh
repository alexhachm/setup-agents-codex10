#!/usr/bin/env bash
# take-dom-snapshot.sh — Standalone Playwright accessibility tree snapshot (non-MCP path)
# Usage: bash scripts/take-dom-snapshot.sh <url>
# Returns: accessibility tree text to stdout (much cheaper than screenshots)
set -euo pipefail

URL="${1:?Usage: take-dom-snapshot.sh <url>}"

node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(process.argv[1], { waitUntil: 'networkidle', timeout: 30000 });
  const snapshot = await page.accessibility.snapshot();
  console.log(JSON.stringify(snapshot, null, 2));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
" "$URL"
