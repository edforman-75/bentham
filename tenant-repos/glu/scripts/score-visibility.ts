/**
 * Visibility Scoring
 *
 * Calculates visibility scores from Bentham study results.
 * Takes JSON output from any study and produces:
 * - Overall visibility score (0-100)
 * - Per-surface scores
 * - Per-query category scores
 * - Competitor comparison
 * - Trend analysis (if historical data available)
 *
 * Usage:
 *   npx ts-node score-visibility.ts <results-file.json> --brand "Brand Name"
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface StudyResults {
  study?: string;
  studyName?: string;
  results: QueryResult[];
  summary?: {
    total: number;
    successful: number;
    failed: number;
  };
}

interface QueryResult {
  queryIndex?: number;
  query?: string;
  originalQuery?: string;
  submittedQuery?: string;
  response: string;
  surface?: string;
  success?: boolean;
  durationMs?: number;
  sources?: { title: string; url: string }[];
}

interface VisibilityScore {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';

  bySurface: Record<string, SurfaceScore>;
  byCategory: Record<string, CategoryScore>;
  byCompetitor: Record<string, number>;

  metrics: {
    totalQueries: number;
    brandMentions: number;
    mentionRate: number;
    averagePosition: number;
    citationRate: number;
    sentimentScore: number;
  };

  insights: string[];
  recommendations: string[];
}

interface SurfaceScore {
  score: number;
  mentionRate: number;
  averagePosition: number;
  queryCount: number;
}

interface CategoryScore {
  score: number;
  mentionRate: number;
  queryCount: number;
  topCompetitors: string[];
}

// Scoring functions
function calculateMentionScore(results: QueryResult[], brand: string): { mentioned: number; total: number; positions: number[] } {
  const brandLower = brand.toLowerCase();
  const brandAliases = [
    brandLower,
    brandLower.replace(/\s+/g, ''),
    brandLower.replace(/\s+/g, '-'),
  ];

  let mentioned = 0;
  const positions: number[] = [];

  for (const result of results) {
    if (!result.response) continue;
    const responseLower = result.response.toLowerCase();

    const isMentioned = brandAliases.some(alias => responseLower.includes(alias));
    if (isMentioned) {
      mentioned++;

      // Calculate position (rough heuristic)
      const position = calculateBrandPosition(result.response, brand);
      if (position) positions.push(position);
    }
  }

  return { mentioned, total: results.length, positions };
}

function calculateBrandPosition(text: string, brand: string): number | null {
  const brandLower = brand.toLowerCase();
  const textLower = text.toLowerCase();

  const brandIndex = textLower.indexOf(brandLower);
  if (brandIndex === -1) return null;

  // Count how many "brand-like" mentions come before this one
  const textBefore = text.slice(0, brandIndex);

  // Look for capitalized words or bullet points
  const segments = textBefore.split(/[•\-\n\d\.]+/).filter(s => s.trim().length > 0);
  const brandLikeMentions = segments.filter(s => /[A-Z][a-z]+/.test(s));

  return brandLikeMentions.length + 1;
}

function extractCompetitorMentions(results: QueryResult[], competitors: string[]): Record<string, number> {
  const mentions: Record<string, number> = {};

  for (const competitor of competitors) {
    mentions[competitor] = 0;
    const competitorLower = competitor.toLowerCase();

    for (const result of results) {
      if (!result.response) continue;
      if (result.response.toLowerCase().includes(competitorLower)) {
        mentions[competitor]++;
      }
    }
  }

  return mentions;
}

function analyzeSentiment(results: QueryResult[], brand: string): number {
  const brandLower = brand.toLowerCase();
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  const positiveWords = ['best', 'top', 'excellent', 'great', 'premium', 'high-quality', 'recommended', 'popular', 'leading', 'favorite', 'love', 'amazing'];
  const negativeWords = ['worst', 'avoid', 'poor', 'bad', 'cheap', 'low-quality', 'complaints', 'issues', 'problems', 'disappointing'];

  for (const result of results) {
    if (!result.response) continue;
    const responseLower = result.response.toLowerCase();

    if (!responseLower.includes(brandLower)) continue;

    // Get context around brand mention
    const brandIndex = responseLower.indexOf(brandLower);
    const start = Math.max(0, brandIndex - 150);
    const end = Math.min(responseLower.length, brandIndex + brand.length + 150);
    const context = responseLower.slice(start, end);

    const posScore = positiveWords.filter(w => context.includes(w)).length;
    const negScore = negativeWords.filter(w => context.includes(w)).length;

    if (posScore > negScore) positiveCount++;
    else if (negScore > posScore) negativeCount++;
    else neutralCount++;
  }

  const total = positiveCount + negativeCount + neutralCount;
  if (total === 0) return 50;

  // Score from 0-100 (100 = all positive, 50 = neutral, 0 = all negative)
  return Math.round(((positiveCount * 100) + (neutralCount * 50)) / total);
}

function categorizeQuery(query: string): string {
  const queryLower = query.toLowerCase();

  if (queryLower.includes(' vs ') || queryLower.includes(' or ') || queryLower.includes('compare')) {
    return 'comparison';
  }
  if (queryLower.includes('best ') || queryLower.includes('top ')) {
    return 'best';
  }
  if (queryLower.includes('review') || queryLower.includes('rating')) {
    return 'review';
  }
  if (queryLower.includes('how to') || queryLower.includes('guide')) {
    return 'guide';
  }
  if (queryLower.includes('where to buy') || queryLower.includes('price') || queryLower.includes('cost')) {
    return 'purchase';
  }
  if (queryLower.includes('for ')) {
    return 'use-case';
  }
  return 'general';
}

function generateInsights(
  mentionRate: number,
  avgPosition: number,
  sentimentScore: number,
  competitorMentions: Record<string, number>,
  brand: string
): string[] {
  const insights: string[] = [];

  // Mention rate insights
  if (mentionRate >= 80) {
    insights.push(`Strong visibility: ${brand} appears in ${Math.round(mentionRate)}% of AI responses.`);
  } else if (mentionRate >= 50) {
    insights.push(`Moderate visibility: ${brand} appears in ${Math.round(mentionRate)}% of AI responses.`);
  } else {
    insights.push(`Low visibility: ${brand} only appears in ${Math.round(mentionRate)}% of AI responses.`);
  }

  // Position insights
  if (avgPosition <= 2) {
    insights.push(`Excellent positioning: ${brand} typically appears as a top recommendation.`);
  } else if (avgPosition <= 5) {
    insights.push(`Good positioning: ${brand} appears in the top 5 recommendations.`);
  } else if (avgPosition > 0) {
    insights.push(`Late positioning: ${brand} often appears after competitors.`);
  }

  // Sentiment insights
  if (sentimentScore >= 70) {
    insights.push(`Positive sentiment: AI systems describe ${brand} favorably.`);
  } else if (sentimentScore < 40) {
    insights.push(`Negative sentiment detected: Review AI-cited sources for issues.`);
  }

  // Competitor insights
  const sortedCompetitors = Object.entries(competitorMentions)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  if (sortedCompetitors.length > 0) {
    const topCompetitor = sortedCompetitors[0];
    insights.push(`Top competitor in AI responses: ${topCompetitor[0]} (${topCompetitor[1]} mentions)`);
  }

  return insights;
}

function generateRecommendations(
  mentionRate: number,
  avgPosition: number,
  sentimentScore: number,
  surfaceScores: Record<string, SurfaceScore>,
  brand: string
): string[] {
  const recommendations: string[] = [];

  // Low visibility recommendations
  if (mentionRate < 50) {
    recommendations.push('Improve structured data (JSON-LD) on product pages to help AI systems understand your brand.');
    recommendations.push('Create authoritative content that answers common queries in your category.');
  }

  // Position recommendations
  if (avgPosition > 3) {
    recommendations.push('Strengthen brand authority signals: press coverage, reviews, certifications.');
    recommendations.push('Ensure consistent brand messaging across all digital touchpoints.');
  }

  // Sentiment recommendations
  if (sentimentScore < 50) {
    recommendations.push('Address negative reviews and complaints on third-party platforms.');
    recommendations.push('Create content that highlights product benefits and customer success stories.');
  }

  // Surface-specific recommendations
  const weakSurfaces = Object.entries(surfaceScores)
    .filter(([, score]) => score.mentionRate < 50)
    .map(([surface]) => surface);

  if (weakSurfaces.length > 0) {
    recommendations.push(`Focus on improving visibility on: ${weakSurfaces.join(', ')}`);
  }

  // Citation recommendations
  recommendations.push('Build presence on authoritative third-party sites that AI systems cite frequently.');

  return recommendations;
}

function calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// Main scoring function
function scoreVisibility(
  results: QueryResult[],
  brand: string,
  options: {
    competitors?: string[];
    surfaceField?: string;
  } = {}
): VisibilityScore {
  const competitors = options.competitors || [
    'Nike', 'Adidas', 'Lululemon', 'Under Armour', 'Patagonia', 'Vuori',
    'Amazon', 'Walmart', 'Target', 'REI'
  ];

  // Calculate mention metrics
  const mentionData = calculateMentionScore(results, brand);
  const mentionRate = (mentionData.mentioned / mentionData.total) * 100;
  const avgPosition = mentionData.positions.length > 0
    ? mentionData.positions.reduce((a, b) => a + b, 0) / mentionData.positions.length
    : 0;

  // Calculate sentiment
  const sentimentScore = analyzeSentiment(results, brand);

  // Calculate competitor mentions
  const competitorMentions = extractCompetitorMentions(results, competitors);

  // Calculate per-surface scores
  const bySurface: Record<string, SurfaceScore> = {};
  const surfaceField = options.surfaceField || 'surface';

  const surfaceGroups = results.reduce((acc, r) => {
    const surface = (r as any)[surfaceField] || 'unknown';
    if (!acc[surface]) acc[surface] = [];
    acc[surface].push(r);
    return acc;
  }, {} as Record<string, QueryResult[]>);

  for (const [surface, surfaceResults] of Object.entries(surfaceGroups)) {
    const surfaceMentions = calculateMentionScore(surfaceResults, brand);
    const surfaceMentionRate = (surfaceMentions.mentioned / surfaceMentions.total) * 100;
    const surfaceAvgPosition = surfaceMentions.positions.length > 0
      ? surfaceMentions.positions.reduce((a, b) => a + b, 0) / surfaceMentions.positions.length
      : 0;

    bySurface[surface] = {
      score: Math.round((surfaceMentionRate * 0.7) + ((10 - Math.min(surfaceAvgPosition, 10)) * 3)),
      mentionRate: surfaceMentionRate,
      averagePosition: surfaceAvgPosition,
      queryCount: surfaceResults.length,
    };
  }

  // Calculate per-category scores
  const byCategory: Record<string, CategoryScore> = {};
  const categoryGroups = results.reduce((acc, r) => {
    const query = r.query || r.originalQuery || r.submittedQuery || '';
    const category = categorizeQuery(query);
    if (!acc[category]) acc[category] = [];
    acc[category].push(r);
    return acc;
  }, {} as Record<string, QueryResult[]>);

  for (const [category, categoryResults] of Object.entries(categoryGroups)) {
    const catMentions = calculateMentionScore(categoryResults, brand);
    const catCompetitors = extractCompetitorMentions(categoryResults, competitors);
    const topCatCompetitors = Object.entries(catCompetitors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([name]) => name);

    byCategory[category] = {
      score: Math.round((catMentions.mentioned / catMentions.total) * 100),
      mentionRate: (catMentions.mentioned / catMentions.total) * 100,
      queryCount: categoryResults.length,
      topCompetitors: topCatCompetitors,
    };
  }

  // Calculate overall score
  // Weighted: mention rate (50%), position (30%), sentiment (20%)
  const positionScore = avgPosition > 0 ? Math.max(0, 100 - (avgPosition - 1) * 15) : 50;
  const overall = Math.round(
    (mentionRate * 0.5) +
    (positionScore * 0.3) +
    (sentimentScore * 0.2)
  );

  // Generate insights and recommendations
  const insights = generateInsights(mentionRate, avgPosition, sentimentScore, competitorMentions, brand);
  const recommendations = generateRecommendations(mentionRate, avgPosition, sentimentScore, bySurface, brand);

  // Calculate citation rate (if sources available)
  const resultsWithSources = results.filter(r => r.sources && r.sources.length > 0);
  const brandCited = resultsWithSources.filter(r =>
    r.sources?.some(s =>
      s.url.toLowerCase().includes(brand.toLowerCase().replace(/\s+/g, ''))
    )
  );
  const citationRate = resultsWithSources.length > 0
    ? (brandCited.length / resultsWithSources.length) * 100
    : 0;

  return {
    overall,
    grade: calculateGrade(overall),
    bySurface,
    byCategory,
    byCompetitor: competitorMentions,
    metrics: {
      totalQueries: results.length,
      brandMentions: mentionData.mentioned,
      mentionRate,
      averagePosition: avgPosition,
      citationRate,
      sentimentScore,
    },
    insights,
    recommendations,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node score-visibility.ts <results-file.json> --brand "Brand Name"');
    console.log('\nExample:');
    console.log('  npx ts-node score-visibility.ts study-results.json --brand "TASC Performance"');
    process.exit(1);
  }

  const resultsFile = args[0];
  const brandIndex = args.indexOf('--brand');
  const brand = brandIndex !== -1 ? args[brandIndex + 1] : 'Unknown';

  if (!fs.existsSync(resultsFile)) {
    console.error(`File not found: ${resultsFile}`);
    process.exit(1);
  }

  const data: StudyResults = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
  const results = data.results || [];

  if (results.length === 0) {
    console.error('No results found in file');
    process.exit(1);
  }

  console.log(`\n📊 Visibility Scoring`);
  console.log(`Brand: ${brand}`);
  console.log(`Results file: ${resultsFile}`);
  console.log(`Total queries: ${results.length}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  const score = scoreVisibility(results, brand);

  // Print results
  console.log(`\n🎯 OVERALL SCORE: ${score.overall}/100 (${score.grade})\n`);

  console.log('📈 METRICS');
  console.log(`  Mention Rate: ${score.metrics.mentionRate.toFixed(1)}%`);
  console.log(`  Average Position: ${score.metrics.averagePosition.toFixed(1)}`);
  console.log(`  Sentiment Score: ${score.metrics.sentimentScore}/100`);
  console.log(`  Citation Rate: ${score.metrics.citationRate.toFixed(1)}%`);

  console.log('\n📱 BY SURFACE');
  for (const [surface, surfaceScore] of Object.entries(score.bySurface)) {
    console.log(`  ${surface}: ${surfaceScore.score}/100 (${surfaceScore.mentionRate.toFixed(0)}% mention rate)`);
  }

  console.log('\n📂 BY CATEGORY');
  for (const [category, categoryScore] of Object.entries(score.byCategory)) {
    console.log(`  ${category}: ${categoryScore.score}/100 (${categoryScore.queryCount} queries)`);
  }

  console.log('\n🏆 COMPETITOR MENTIONS');
  const sortedCompetitors = Object.entries(score.byCompetitor)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  for (const [competitor, mentions] of sortedCompetitors) {
    console.log(`  ${competitor}: ${mentions} mentions`);
  }

  console.log('\n💡 INSIGHTS');
  score.insights.forEach((insight, i) => console.log(`  ${i + 1}. ${insight}`));

  console.log('\n🎯 RECOMMENDATIONS');
  score.recommendations.forEach((rec, i) => console.log(`  ${i + 1}. ${rec}`));

  // Save score
  const outputPath = resultsFile.replace('.json', '-scored.json');
  fs.writeFileSync(outputPath, JSON.stringify(score, null, 2));
  console.log(`\n💾 Score saved to: ${outputPath}`);
}

main().catch(console.error);

export { scoreVisibility, VisibilityScore, SurfaceScore, CategoryScore };
