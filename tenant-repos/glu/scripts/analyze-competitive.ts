/**
 * Competitive Answer Analysis
 *
 * Analyzes AI responses to understand competitive positioning:
 * - Which competitors appear most frequently
 * - In what context are competitors mentioned
 * - How does the target brand compare to competitors
 * - What attributes are associated with each brand
 *
 * Usage:
 *   npx ts-node analyze-competitive.ts <results-file.json> --brand "Brand Name"
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
interface StudyResults {
  results: QueryResult[];
  metadata?: {
    brand?: string;
    competitors?: string[];
  };
}

interface QueryResult {
  query?: string;
  originalQuery?: string;
  submittedQuery?: string;
  response: string;
  surface?: string;
  sources?: { title: string; url: string }[];
}

interface BrandMention {
  brand: string;
  position: number; // 1-indexed position in response
  context: string; // Surrounding text
  attributes: string[]; // Descriptors found near mention
  sentiment: 'positive' | 'neutral' | 'negative';
  query: string;
  surface: string;
}

interface CompetitorProfile {
  brand: string;
  totalMentions: number;
  mentionRate: number; // % of responses mentioning this brand
  averagePosition: number;
  positionDistribution: Record<string, number>; // "1st", "2nd", etc.
  topAttributes: { attribute: string; count: number }[];
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  strongestCategories: { category: string; mentionRate: number }[];
  weakestCategories: { category: string; mentionRate: number }[];
  exampleMentions: BrandMention[];
}

interface CompetitiveReport {
  brand: string;
  timestamp: string;
  totalResponses: number;

  // Brand performance
  brandProfile: CompetitorProfile;

  // Competitor profiles
  competitorProfiles: CompetitorProfile[];

  // Comparative analysis
  comparison: {
    mentionRateRanking: { brand: string; rate: number }[];
    positionRanking: { brand: string; avgPosition: number }[];
    sentimentRanking: { brand: string; positiveRate: number }[];
  };

  // Strategic insights
  insights: {
    type: 'opportunity' | 'threat' | 'strength' | 'weakness';
    description: string;
    competitors: string[];
    recommendation: string;
  }[];

  // Category analysis
  categoryBreakdown: Record<string, {
    brandMentioned: boolean;
    brandPosition: number | null;
    competitorsMentioned: string[];
    topCompetitor: string | null;
  }>;
}

// Attribute patterns for brand analysis
const ATTRIBUTE_PATTERNS: Record<string, RegExp[]> = {
  quality: [/high.?quality/i, /premium/i, /superior/i, /excellent/i, /top.?tier/i],
  value: [/affordable/i, /budget/i, /value/i, /cost.?effective/i, /economical/i],
  innovation: [/innovative/i, /cutting.?edge/i, /advanced/i, /technology/i, /patented/i],
  sustainability: [/sustainable/i, /eco.?friendly/i, /green/i, /recycled/i, /organic/i],
  comfort: [/comfortable/i, /soft/i, /cushioned/i, /ergonomic/i, /breathable/i],
  durability: [/durable/i, /long.?lasting/i, /sturdy/i, /reliable/i, /built to last/i],
  style: [/stylish/i, /fashionable/i, /trendy/i, /aesthetic/i, /design/i],
  performance: [/performance/i, /high.?performance/i, /athletic/i, /professional/i],
  trusted: [/trusted/i, /reputable/i, /established/i, /reliable/i, /recommended/i],
  popular: [/popular/i, /best.?selling/i, /favorite/i, /top.?rated/i, /loved/i],
};

// Sentiment indicators
const POSITIVE_INDICATORS = [
  'best', 'top', 'excellent', 'great', 'highly recommended', 'outstanding',
  'superior', 'premium', 'favorite', 'leading', 'innovative', 'trusted'
];

const NEGATIVE_INDICATORS = [
  'avoid', 'worst', 'poor', 'bad', 'complaints', 'issues', 'problems',
  'overpriced', 'disappointing', 'inferior', 'cheap', 'unreliable'
];

// Helper functions
function extractBrandMentions(
  text: string,
  brands: string[],
  query: string,
  surface: string
): BrandMention[] {
  const mentions: BrandMention[] = [];
  const textLower = text.toLowerCase();

  // Track positions to determine ranking
  const brandPositions: { brand: string; index: number }[] = [];

  for (const brand of brands) {
    const brandLower = brand.toLowerCase();
    const index = textLower.indexOf(brandLower);

    if (index !== -1) {
      brandPositions.push({ brand, index });
    }
  }

  // Sort by position in text
  brandPositions.sort((a, b) => a.index - b.index);

  // Create mentions with position ranking
  brandPositions.forEach((bp, rank) => {
    const index = bp.index;
    const contextStart = Math.max(0, index - 150);
    const contextEnd = Math.min(text.length, index + bp.brand.length + 150);
    const context = text.slice(contextStart, contextEnd);

    // Extract attributes from context
    const attributes = extractAttributes(context);

    // Analyze sentiment
    const sentiment = analyzeSentiment(context);

    mentions.push({
      brand: bp.brand,
      position: rank + 1,
      context,
      attributes,
      sentiment,
      query,
      surface,
    });
  });

  return mentions;
}

function extractAttributes(context: string): string[] {
  const attributes: string[] = [];
  const contextLower = context.toLowerCase();

  for (const [attribute, patterns] of Object.entries(ATTRIBUTE_PATTERNS)) {
    if (patterns.some(p => p.test(contextLower))) {
      attributes.push(attribute);
    }
  }

  return attributes;
}

function analyzeSentiment(context: string): 'positive' | 'neutral' | 'negative' {
  const contextLower = context.toLowerCase();

  const positiveCount = POSITIVE_INDICATORS.filter(i => contextLower.includes(i)).length;
  const negativeCount = NEGATIVE_INDICATORS.filter(i => contextLower.includes(i)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function buildCompetitorProfile(
  brand: string,
  mentions: BrandMention[],
  totalResponses: number,
  queryCategories: Map<string, string>
): CompetitorProfile {
  const brandMentions = mentions.filter(m => m.brand === brand);

  // Calculate position distribution
  const positionDistribution: Record<string, number> = {};
  for (const mention of brandMentions) {
    const posKey = mention.position <= 3 ? `${mention.position}` : '4+';
    positionDistribution[posKey] = (positionDistribution[posKey] || 0) + 1;
  }

  // Calculate attribute frequency
  const attributeCounts: Record<string, number> = {};
  for (const mention of brandMentions) {
    for (const attr of mention.attributes) {
      attributeCounts[attr] = (attributeCounts[attr] || 0) + 1;
    }
  }
  const topAttributes = Object.entries(attributeCounts)
    .map(([attribute, count]) => ({ attribute, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Sentiment breakdown
  const sentimentBreakdown = {
    positive: brandMentions.filter(m => m.sentiment === 'positive').length,
    neutral: brandMentions.filter(m => m.sentiment === 'neutral').length,
    negative: brandMentions.filter(m => m.sentiment === 'negative').length,
  };

  // Category analysis
  const categoryMentions: Record<string, number> = {};
  const categoryTotal: Record<string, number> = {};

  for (const mention of brandMentions) {
    const category = queryCategories.get(mention.query) || 'unknown';
    categoryMentions[category] = (categoryMentions[category] || 0) + 1;
  }

  // Count total queries per category
  for (const [query, category] of queryCategories.entries()) {
    categoryTotal[category] = (categoryTotal[category] || 0) + 1;
  }

  const categoryRates = Object.entries(categoryMentions)
    .map(([category, count]) => ({
      category,
      mentionRate: count / (categoryTotal[category] || 1),
    }))
    .sort((a, b) => b.mentionRate - a.mentionRate);

  return {
    brand,
    totalMentions: brandMentions.length,
    mentionRate: brandMentions.length / totalResponses,
    averagePosition: brandMentions.length > 0
      ? brandMentions.reduce((sum, m) => sum + m.position, 0) / brandMentions.length
      : 0,
    positionDistribution,
    topAttributes,
    sentimentBreakdown,
    strongestCategories: categoryRates.slice(0, 3),
    weakestCategories: categoryRates.slice(-3).reverse(),
    exampleMentions: brandMentions.slice(0, 5),
  };
}

function generateInsights(
  brandProfile: CompetitorProfile,
  competitorProfiles: CompetitorProfile[]
): CompetitiveReport['insights'] {
  const insights: CompetitiveReport['insights'] = [];

  // Find competitors with higher mention rates
  const higherMentionCompetitors = competitorProfiles
    .filter(c => c.mentionRate > brandProfile.mentionRate)
    .map(c => c.brand);

  if (higherMentionCompetitors.length > 0) {
    insights.push({
      type: 'threat',
      description: `${higherMentionCompetitors.length} competitors have higher AI visibility`,
      competitors: higherMentionCompetitors.slice(0, 3),
      recommendation: 'Analyze their content strategy and increase brand mentions in authoritative sources',
    });
  }

  // Find competitors with better positioning
  const betterPositionCompetitors = competitorProfiles
    .filter(c => c.averagePosition > 0 && c.averagePosition < brandProfile.averagePosition)
    .map(c => c.brand);

  if (betterPositionCompetitors.length > 0) {
    insights.push({
      type: 'weakness',
      description: `Brand appears later than ${betterPositionCompetitors.length} competitors in AI responses`,
      competitors: betterPositionCompetitors.slice(0, 3),
      recommendation: 'Focus on building authority signals and entity salience',
    });
  }

  // Identify strong categories
  const strongCategories = brandProfile.strongestCategories
    .filter(c => c.mentionRate > 0.5);

  if (strongCategories.length > 0) {
    insights.push({
      type: 'strength',
      description: `Strong visibility in: ${strongCategories.map(c => c.category).join(', ')}`,
      competitors: [],
      recommendation: 'Leverage these categories for competitive positioning',
    });
  }

  // Identify attribute gaps
  const competitorAttributes = new Set<string>();
  for (const comp of competitorProfiles) {
    for (const attr of comp.topAttributes) {
      competitorAttributes.add(attr.attribute);
    }
  }

  const brandAttributes = new Set(brandProfile.topAttributes.map(a => a.attribute));
  const missingAttributes = [...competitorAttributes].filter(a => !brandAttributes.has(a));

  if (missingAttributes.length > 0) {
    insights.push({
      type: 'opportunity',
      description: `Competitors are associated with attributes not linked to your brand: ${missingAttributes.join(', ')}`,
      competitors: [],
      recommendation: 'Update content to highlight these attributes where relevant',
    });
  }

  // Check sentiment advantage/disadvantage
  const brandPositiveRate = brandProfile.totalMentions > 0
    ? brandProfile.sentimentBreakdown.positive / brandProfile.totalMentions
    : 0;

  const avgCompetitorPositiveRate = competitorProfiles.length > 0
    ? competitorProfiles.reduce((sum, c) =>
        sum + (c.totalMentions > 0 ? c.sentimentBreakdown.positive / c.totalMentions : 0), 0
      ) / competitorProfiles.length
    : 0;

  if (brandPositiveRate > avgCompetitorPositiveRate + 0.1) {
    insights.push({
      type: 'strength',
      description: 'Brand sentiment is more positive than competitors on average',
      competitors: [],
      recommendation: 'Highlight positive reviews and testimonials to maintain advantage',
    });
  } else if (brandPositiveRate < avgCompetitorPositiveRate - 0.1) {
    insights.push({
      type: 'weakness',
      description: 'Brand sentiment is less positive than competitors',
      competitors: competitorProfiles
        .filter(c => c.totalMentions > 0 &&
          c.sentimentBreakdown.positive / c.totalMentions > brandPositiveRate)
        .map(c => c.brand)
        .slice(0, 3),
      recommendation: 'Address negative citations and improve review presence',
    });
  }

  return insights;
}

// Main analysis function
function analyzeCompetitive(
  results: QueryResult[],
  brand: string,
  competitors: string[]
): CompetitiveReport {
  const timestamp = new Date().toISOString();
  const allBrands = [brand, ...competitors];
  const allMentions: BrandMention[] = [];

  // Extract query categories from results
  const queryCategories = new Map<string, string>();
  for (const result of results) {
    const query = result.query || result.originalQuery || result.submittedQuery || '';
    // Simple category extraction from query
    if (query.toLowerCase().includes('best')) queryCategories.set(query, 'best');
    else if (query.toLowerCase().includes('vs') || query.toLowerCase().includes('compare'))
      queryCategories.set(query, 'comparison');
    else if (query.toLowerCase().includes('review')) queryCategories.set(query, 'reviews');
    else queryCategories.set(query, 'general');
  }

  // Extract all mentions
  for (const result of results) {
    const query = result.query || result.originalQuery || result.submittedQuery || '';
    const surface = result.surface || 'unknown';
    const mentions = extractBrandMentions(result.response, allBrands, query, surface);
    allMentions.push(...mentions);
  }

  // Build profiles
  const brandProfile = buildCompetitorProfile(brand, allMentions, results.length, queryCategories);
  const competitorProfiles = competitors.map(comp =>
    buildCompetitorProfile(comp, allMentions, results.length, queryCategories)
  );

  // Build comparison rankings
  const allProfiles = [brandProfile, ...competitorProfiles];

  const mentionRateRanking = allProfiles
    .map(p => ({ brand: p.brand, rate: p.mentionRate }))
    .sort((a, b) => b.rate - a.rate);

  const positionRanking = allProfiles
    .filter(p => p.averagePosition > 0)
    .map(p => ({ brand: p.brand, avgPosition: p.averagePosition }))
    .sort((a, b) => a.avgPosition - b.avgPosition);

  const sentimentRanking = allProfiles
    .filter(p => p.totalMentions > 0)
    .map(p => ({
      brand: p.brand,
      positiveRate: p.sentimentBreakdown.positive / p.totalMentions,
    }))
    .sort((a, b) => b.positiveRate - a.positiveRate);

  // Category breakdown
  const categoryBreakdown: CompetitiveReport['categoryBreakdown'] = {};
  for (const [query, category] of queryCategories.entries()) {
    const queryMentions = allMentions.filter(m => m.query === query);
    const brandMention = queryMentions.find(m => m.brand === brand);
    const competitorMentions = queryMentions.filter(m => m.brand !== brand);

    if (!categoryBreakdown[category]) {
      categoryBreakdown[category] = {
        brandMentioned: false,
        brandPosition: null,
        competitorsMentioned: [],
        topCompetitor: null,
      };
    }

    if (brandMention) {
      categoryBreakdown[category].brandMentioned = true;
      categoryBreakdown[category].brandPosition = brandMention.position;
    }

    for (const cm of competitorMentions) {
      if (!categoryBreakdown[category].competitorsMentioned.includes(cm.brand)) {
        categoryBreakdown[category].competitorsMentioned.push(cm.brand);
      }
    }

    if (competitorMentions.length > 0) {
      categoryBreakdown[category].topCompetitor = competitorMentions
        .sort((a, b) => a.position - b.position)[0].brand;
    }
  }

  // Generate insights
  const insights = generateInsights(brandProfile, competitorProfiles);

  return {
    brand,
    timestamp,
    totalResponses: results.length,
    brandProfile,
    competitorProfiles,
    comparison: {
      mentionRateRanking,
      positionRanking,
      sentimentRanking,
    },
    insights,
    categoryBreakdown,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Competitive Answer Analysis');
    console.log('\nUsage: npx ts-node analyze-competitive.ts <results-file.json> [options]');
    console.log('\nOptions:');
    console.log('  --brand NAME         Target brand to analyze');
    console.log('  --competitors LIST   Comma-separated competitor names');
    console.log('\nExample:');
    console.log('  npx ts-node analyze-competitive.ts study-results.json --brand "Nike" --competitors "Adidas,Puma,Reebok"');
    process.exit(1);
  }

  const resultsFile = args[0];

  // Parse arguments
  let brand = 'Unknown';
  let competitors: string[] = [];

  const brandIndex = args.indexOf('--brand');
  if (brandIndex !== -1 && args[brandIndex + 1]) {
    brand = args[brandIndex + 1];
  }

  const compIndex = args.indexOf('--competitors');
  if (compIndex !== -1 && args[compIndex + 1]) {
    competitors = args[compIndex + 1].split(',').map(c => c.trim());
  }

  // Load results
  if (!fs.existsSync(resultsFile)) {
    console.error(`File not found: ${resultsFile}`);
    process.exit(1);
  }

  const data: StudyResults = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
  const results = data.results || [];

  // Use metadata from file if available
  if (data.metadata?.brand && brand === 'Unknown') {
    brand = data.metadata.brand;
  }
  if (data.metadata?.competitors && competitors.length === 0) {
    competitors = data.metadata.competitors;
  }

  console.log('\n COMPETITIVE ANSWER ANALYSIS');
  console.log(`Brand: ${brand}`);
  console.log(`Competitors: ${competitors.join(', ')}`);
  console.log(`Results file: ${resultsFile}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  const report = analyzeCompetitive(results, brand, competitors);

  // Print summary
  console.log('VISIBILITY RANKING');
  report.comparison.mentionRateRanking.forEach((entry, i) => {
    const marker = entry.brand === brand ? ' <-- YOUR BRAND' : '';
    console.log(`  ${i + 1}. ${entry.brand}: ${(entry.rate * 100).toFixed(1)}% mention rate${marker}`);
  });

  console.log('\n POSITION RANKING (lower is better)');
  report.comparison.positionRanking.forEach((entry, i) => {
    const marker = entry.brand === brand ? ' <-- YOUR BRAND' : '';
    console.log(`  ${i + 1}. ${entry.brand}: ${entry.avgPosition.toFixed(1)} avg position${marker}`);
  });

  console.log('\n SENTIMENT RANKING');
  report.comparison.sentimentRanking.forEach((entry, i) => {
    const marker = entry.brand === brand ? ' <-- YOUR BRAND' : '';
    console.log(`  ${i + 1}. ${entry.brand}: ${(entry.positiveRate * 100).toFixed(1)}% positive${marker}`);
  });

  console.log('\n BRAND ATTRIBUTES');
  console.log(`  ${brand}:`);
  report.brandProfile.topAttributes.forEach(attr => {
    console.log(`    - ${attr.attribute}: ${attr.count} mentions`);
  });

  if (report.insights.length > 0) {
    console.log('\n STRATEGIC INSIGHTS');
    for (const insight of report.insights) {
      const icon = {
        opportunity: '[OPP]',
        threat: '[THR]',
        strength: '[STR]',
        weakness: '[WKN]',
      }[insight.type];
      console.log(`\n  ${icon} ${insight.description}`);
      if (insight.competitors.length > 0) {
        console.log(`      Competitors: ${insight.competitors.join(', ')}`);
      }
      console.log(`      Action: ${insight.recommendation}`);
    }
  }

  // Save report
  const outputPath = resultsFile.replace('.json', '-competitive-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n Report saved to: ${outputPath}`);
}

main().catch(console.error);

export { analyzeCompetitive, CompetitiveReport, CompetitorProfile, BrandMention };
