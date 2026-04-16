'use strict';

/**
 * Deep Research — iterative multi-round search agent.
 * Performs multiple rounds of search, analysis, and refinement.
 */

const searchEngine = require('./search/engine');
const apiBackend = require('./api-backend');
const modelRouter = require('./model-router');
const settingsManager = require('./settings-manager');
const synthesis = require('./synthesis');

const MAX_ROUNDS = 5;
const RESULTS_PER_ROUND = 5;

/**
 * Execute a deep research session.
 * @param {string} topic - Research topic
 * @param {Object} opts - { maxRounds, resultsPerRound, provider }
 * @returns {Promise<Object>} - { findings, citations, rounds, summary }
 */
async function research(topic, opts = {}) {
  const maxRounds = opts.maxRounds || MAX_ROUNDS;
  const resultsPerRound = opts.resultsPerRound || RESULTS_PER_ROUND;
  const rounds = [];
  const allCitations = [];
  let currentQuery = topic;

  for (let round = 0; round < maxRounds; round++) {
    // Search
    let searchResults;
    try {
      searchResults = await searchEngine.search(currentQuery, {
        provider: opts.provider,
        maxResults: resultsPerRound,
      });
    } catch (err) {
      rounds.push({ round: round + 1, query: currentQuery, error: err.message });
      break;
    }

    const roundData = {
      round: round + 1,
      query: currentQuery,
      results: searchResults.results,
      citations: searchResults.citations,
    };

    allCitations.push(...searchResults.citations);

    // Analyze results and decide next query
    if (settingsManager.isLiveMode()) {
      try {
        const resolution = modelRouter.resolve('research');
        const analysis = await apiBackend.call(
          resolution.provider,
          resolution.model,
          [{
            role: 'user',
            content: `Research topic: "${topic}"
Round ${round + 1} query: "${currentQuery}"
Results found: ${searchResults.results.map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Analyze these results. If more research is needed, provide a refined search query. If sufficient, say "COMPLETE".
Respond with JSON: {"analysis": "...", "next_query": "..." or null, "complete": true/false}`,
          }],
          { max_tokens: 500, temperature: 0 }
        );

        const jsonMatch = analysis.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          roundData.analysis = parsed.analysis;
          if (parsed.complete || !parsed.next_query) {
            rounds.push(roundData);
            break;
          }
          currentQuery = parsed.next_query;
        }
      } catch {
        // Continue without LLM analysis
      }
    } else {
      // Dev mode — no LLM analysis, just do one round
      rounds.push(roundData);
      break;
    }

    rounds.push(roundData);
  }

  // Deduplicate citations
  const uniqueCitations = deduplicateCitations(allCitations);

  return {
    topic,
    rounds,
    round_count: rounds.length,
    citations: uniqueCitations,
    citation_count: uniqueCitations.length,
  };
}

function deduplicateCitations(citations) {
  const seen = new Set();
  return citations.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

module.exports = {
  research,
  deduplicateCitations,
  MAX_ROUNDS,
  RESULTS_PER_ROUND,
};
