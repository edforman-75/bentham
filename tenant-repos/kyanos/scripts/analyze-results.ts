import { readFileSync } from 'fs';

// Read retry results file
const retryResults = JSON.parse(readFileSync('studies/city-of-boise-visibility-retry-results.json', 'utf-8'));

// Count successful results by surface
const surfaceStats: Record<string, { total: number, successful: number, mentioned: number }> = {
  'chatgpt-web': { total: 0, successful: 0, mentioned: 0 },
  'google-ai-overview': { total: 0, successful: 0, mentioned: 0 },
  'google-search': { total: 0, successful: 0, mentioned: 0 },
  'bing-search': { total: 0, successful: 0, mentioned: 0 },
  'meta-ai-web': { total: 0, successful: 0, mentioned: 0 }
};

for (const result of retryResults.results) {
  const surface = result.surfaceId;
  if (surfaceStats[surface]) {
    surfaceStats[surface].total++;
    if (result.status === 'complete') {
      surfaceStats[surface].successful++;
      // Check if Boise is mentioned
      const text = (result.responseText || '').toLowerCase();
      if (text.includes('boise') || text.includes('city of boise')) {
        surfaceStats[surface].mentioned++;
      }
    }
  }
}

// Calculate scores
const weights: Record<string, number> = {
  'chatgpt-web': 0.35,
  'google-ai-overview': 0.25,
  'google-search': 0.20,
  'bing-search': 0.10,
  'meta-ai-web': 0.10
};

console.log('\n=== SURFACE ANALYSIS (Retry Results) ===\n');

let weightedScore = 0;
for (const [surface, stats] of Object.entries(surfaceStats)) {
  const mentionRate = stats.total > 0 ? (stats.mentioned / stats.total * 100) : 0;
  const successRate = stats.total > 0 ? (stats.successful / stats.total * 100) : 0;
  console.log(`${surface}:`);
  console.log(`  Total: ${stats.total}, Successful: ${stats.successful}, Mentioned Boise: ${stats.mentioned}`);
  console.log(`  Success Rate: ${successRate.toFixed(1)}%, Mention Rate: ${mentionRate.toFixed(1)}%`);
  weightedScore += mentionRate * (weights[surface] || 0);
}

console.log(`\n=== WEIGHTED OVERALL SCORE ===`);
console.log(`Weighted Score: ${weightedScore.toFixed(1)}`);
