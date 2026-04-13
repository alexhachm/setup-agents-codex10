#!/usr/bin/env bash
# take-screenshot.sh — Platform visual testing: capture a PNG screenshot
# Usage: bash scripts/take-screenshot.sh <url> [output_path]
# Returns: path to the saved PNG
# Works with the configured agent provider.
set -euo pipefail

URL="${1:?Usage: take-screenshot.sh <url> [output_path]}"
OUTPUT="${2:-/tmp/mac10-screenshot-$(date +%s).png}"

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
  await page.screenshot({ path: process.argv[2], fullPage: false });
  await browser.close();
  console.log(process.argv[2]);
})().catch(e => { console.error(e.message); process.exit(1); });
" "$URL" "$OUTPUT"
