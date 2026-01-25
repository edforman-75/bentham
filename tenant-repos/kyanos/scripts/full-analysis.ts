import { readFileSync } from 'fs';

// Read both files
const retryData = JSON.parse(readFileSync('/tmp/retry-data.json', 'utf-8'));
const retryResults = JSON.parse(readFileSync('studies/city-of-boise-visibility-retry-results.json', 'utf-8'));

const TOTAL_QUERIES = 84;

// Surface info
interface SurfaceInfo {
  originalCompleted: number;
  retryAttempted: number;
  retrySuccessful: number;
  retryMentioned: number;
  weight: number;
}

const surfaces: Record<string, SurfaceInfo> = {
  'chatgpt-web': { originalCompleted: 0, retryAttempted: 0, retrySuccessful: 0, retryMentioned: 0, weight: 0.35 },
  'google-ai-overview': { originalCompleted: 0, retryAttempted: 0, retrySuccessful: 0, retryMentioned: 0, weight: 0.25 },
  'google-search': { originalCompleted: 0, retryAttempted: 0, retrySuccessful: 0, retryMentioned: 0, weight: 0.20 },
  'bing-search': { originalCompleted: 0, retryAttempted: 0, retrySuccessful: 0, retryMentioned: 0, weight: 0.10 },
  'meta-ai-web': { originalCompleted: 0, retryAttempted: 0, retrySuccessful: 0, retryMentioned: 0, weight: 0.10 }
};

// Count original completed
for (const [surface, completed] of Object.entries(retryData.completed)) {
  if (surfaces[surface]) {
    surfaces[surface].originalCompleted = (completed as number[]).length;
  }
}

// Count retry results
for (const result of retryResults.results) {
  const surface = result.surfaceId;
  if (surfaces[surface]) {
    surfaces[surface].retryAttempted++;
    if (result.status === 'complete') {
      surfaces[surface].retrySuccessful++;
      const text = (result.responseText || '').toLowerCase();
      if (text.includes('boise')) {
        surfaces[surface].retryMentioned++;
      }
    }
  }
}

console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║           CITY OF BOISE AI VISIBILITY STUDY - FINAL RESULTS             ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

console.log('┌─────────────────────────┬────────────┬────────────┬────────────┬────────────┐');
console.log('│ Surface                 │ Original   │ Retry      │ Total      │ Score      │');
console.log('│                         │ Completed  │ Successful │ Successful │ (weighted) │');
console.log('├─────────────────────────┼────────────┼────────────┼────────────┼────────────┤');

let overallWeightedScore = 0;
let totalSuccessful = 0;
let totalAttempted = 0;

for (const [surface, info] of Object.entries(surfaces)) {
  const totalSuccess = info.originalCompleted + info.retrySuccessful;
  const mentionRate = info.retryAttempted > 0 ? info.retryMentioned / info.retryAttempted : 0;

  // Estimate original mentions based on retry mention rate (conservative)
  const estimatedOriginalMentions = Math.floor(info.originalCompleted * mentionRate);
  const totalMentions = estimatedOriginalMentions + info.retryMentioned;

  const score = (totalMentions / TOTAL_QUERIES) * 100;
  const weightedContribution = score * info.weight;

  const surfaceName = surface.padEnd(23);
  const origCol = info.originalCompleted.toString().padStart(10);
  const retryCol = info.retrySuccessful.toString().padStart(10);
  const totalCol = totalSuccess.toString().padStart(10);
  const scoreCol = score.toFixed(1).padStart(9) + '%';

  console.log(`│ ${surfaceName} │${origCol} │${retryCol} │${totalCol} │${scoreCol} │`);

  overallWeightedScore += weightedContribution;
  totalSuccessful += totalSuccess;
  totalAttempted += TOTAL_QUERIES;
}

console.log('└─────────────────────────┴────────────┴────────────┴────────────┴────────────┘');

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  WEIGHTED OVERALL SCORE: ${overallWeightedScore.toFixed(1)}%`);
console.log(`  Total Queries: ${TOTAL_QUERIES} × 5 surfaces = ${totalAttempted}`);
console.log(`  Total Successful Responses: ${totalSuccessful}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

// Category breakdown from retry results
console.log('CATEGORY PERFORMANCE (from retry data):');
console.log('────────────────────────────────────────');

const categories: Record<string, { total: number, mentioned: number }> = {};
for (const result of retryResults.results) {
  if (!categories[result.category]) {
    categories[result.category] = { total: 0, mentioned: 0 };
  }
  categories[result.category].total++;
  if (result.status === 'complete') {
    const text = (result.responseText || '').toLowerCase();
    if (text.includes('boise')) {
      categories[result.category].mentioned++;
    }
  }
}

const sortedCategories = Object.entries(categories)
  .map(([cat, stats]) => ({ cat, rate: stats.mentioned / stats.total * 100 }))
  .sort((a, b) => b.rate - a.rate);

for (const { cat, rate } of sortedCategories) {
  const bar = '█'.repeat(Math.floor(rate / 5)) + '░'.repeat(20 - Math.floor(rate / 5));
  console.log(`  ${cat.padEnd(20)} ${bar} ${rate.toFixed(0)}%`);
}

console.log('\n');
