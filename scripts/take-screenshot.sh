#!/usr/bin/env bash
# take-screenshot.sh — Standalone Playwright screenshot fallback (non-MCP path)
# Usage: bash scripts/take-screenshot.sh <url> [output_path]
# Returns: path to the saved PNG
set -euo pipefail

URL="${1:?Usage: take-screenshot.sh <url> [output_path]}"
OUTPUT="${2:-/tmp/mac10-screenshot-$(date +%s).png}"

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
