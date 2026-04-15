#!/usr/bin/env bash
# take-dom-snapshot.sh — Platform visual testing: accessibility tree snapshot
# Usage: bash scripts/take-dom-snapshot.sh <url>
# Returns: accessibility tree JSON to stdout (~4k tokens, 10-50x cheaper than screenshots)
# Works with the configured agent provider.
set -euo pipefail

URL="${1:?Usage: take-dom-snapshot.sh <url>}"

# Auto-detect Playwright installation
if ! node -e "require('playwright')" 2>/dev/null; then
  echo "ERROR: Playwright not installed. Install with:" >&2
  echo "  npm install -g playwright && npx playwright install chromium" >&2
  exit 1
fi

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
