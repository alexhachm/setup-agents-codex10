'use strict';

/**
 * CLI command: mac10 search <query>
 *
 * Options:
 *   --provider <name>   — force a specific search provider
 *   --max <n>           — max results (default 10)
 *   --vertical <name>   — academic, people, image, video, shopping
 *   --freshness <val>   — day, week, month
 *   --citations         — include formatted citations
 */

const searchEngine = require('../search/engine');

// Auto-register available adapters
function ensureAdaptersRegistered() {
  const adapters = ['perplexity', 'brave', 'google', 'tavily'];
  for (const name of adapters) {
    try {
      const adapter = require(`../search/adapters/${name}`);
      searchEngine.registerAdapter(name, adapter);
    } catch {}
  }
}

async function run(args, projectDir) {
  ensureAdaptersRegistered();

  const query = [];
  let provider = null;
  let maxResults = 10;
  let vertical = null;
  let freshness = null;
  let citations = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && args[i + 1]) {
      provider = args[++i];
    } else if (args[i] === '--max' && args[i + 1]) {
      maxResults = parseInt(args[++i], 10);
    } else if (args[i] === '--vertical' && args[i + 1]) {
      vertical = args[++i];
    } else if (args[i] === '--freshness' && args[i + 1]) {
      freshness = args[++i];
    } else if (args[i] === '--citations') {
      citations = true;
    } else {
      query.push(args[i]);
    }
  }

  const queryStr = query.join(' ').trim();
  if (!queryStr) {
    return { error: 'Usage: mac10 search <query> [--provider name] [--max n] [--vertical name]' };
  }

  // If vertical specified, use vertical module
  if (vertical) {
    try {
      const verticalModule = require(`../search/verticals/${vertical}`);
      const result = await verticalModule.search(queryStr, { provider, maxResults, freshness });
      return { ...result, vertical };
    } catch (err) {
      return { error: `Vertical "${vertical}" error: ${err.message}` };
    }
  }

  try {
    if (citations) {
      return await searchEngine.searchWithCitations(queryStr, { provider, maxResults, freshness });
    }
    return await searchEngine.search(queryStr, { provider, maxResults, freshness });
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { run };
