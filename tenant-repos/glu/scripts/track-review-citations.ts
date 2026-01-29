/**
 * Review Citation Tracking
 *
 * Analyzes study results to find citations from review platforms.
 * Identifies positive vs negative reviews being cited by AI.
 * Provides recommendations for reputation management.
 *
 * Usage:
 *   npx ts-node track-review-citations.ts <results-file.json> --brand "Brand Name"
 */

import * as fs from 'fs';

// Review platform patterns
const REVIEW_PLATFORMS = {
  'trustpilot': {
    name: 'Trustpilot',
    patterns: ['trustpilot.com'],
    type: 'business-review',
  },
  'google-reviews': {
    name: 'Google Reviews',
    patterns: ['google.com/maps', 'maps.google.com', 'g.co/kgs'],
    type: 'business-review',
  },
  'yelp': {
    name: 'Yelp',
    patterns: ['yelp.com'],
    type: 'business-review',
  },
  'bbb': {
    name: 'Better Business Bureau',
    patterns: ['bbb.org'],
    type: 'business-review',
  },
  'amazon-reviews': {
    name: 'Amazon Reviews',
    patterns: ['amazon.com/review', 'amazon.com/gp/customer-reviews'],
    type: 'product-review',
  },
  'reddit': {
    name: 'Reddit',
    patterns: ['reddit.com', 'redd.it'],
    type: 'community',
  },
  'quora': {
    name: 'Quora',
    patterns: ['quora.com'],
    type: 'community',
  },
  'g2': {
    name: 'G2',
    patterns: ['g2.com'],
    type: 'software-review',
  },
  'capterra': {
    name: 'Capterra',
    patterns: ['capterra.com'],
    type: 'software-review',
  },
  'glassdoor': {
    name: 'Glassdoor',
    patterns: ['glassdoor.com'],
    type: 'employer-review',
  },
  'consumer-reports': {
    name: 'Consumer Reports',
    patterns: ['consumerreports.org'],
    type: 'expert-review',
  },
  'wirecutter': {
    name: 'Wirecutter',
    patterns: ['nytimes.com/wirecutter'],
    type: 'expert-review',
  },
};

// Types
interface StudyResults {
  results: QueryResult[];
}

interface QueryResult {
  query?: string;
  originalQuery?: string;
  submittedQuery?: string;
  response: string;
  surface?: string;
  sources?: { title: string; url: string }[];
}

interface ReviewCitation {
  url: string;
  platform: string;
  platformType: string;
  title?: string;
  query: string;
  surface: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'unknown';
  context: string;
  brandMentioned: boolean;
}

interface ReviewCitationReport {
  brand: string;
  timestamp: string;
  totalCitations: number;
  reviewCitations: ReviewCitation[];

  byPlatform: Record<string, {
    count: number;
    sentiment: Record<string, number>;
    examples: ReviewCitation[];
  }>;

  byType: Record<string, number>;

  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
    unknown: number;
  };

  concerns: {
    issue: string;
    severity: 'high' | 'medium' | 'low';
    platform: string;
    url?: string;
  }[];

  recommendations: {
    action: string;
    priority: 'high' | 'medium' | 'low';
    platform: string;
    rationale: string;
  }[];
}

// Helper functions
function identifyPlatform(url: string): { id: string; platform: typeof REVIEW_PLATFORMS[keyof typeof REVIEW_PLATFORMS] } | null {
  const urlLower = url.toLowerCase();

  for (const [id, platform] of Object.entries(REVIEW_PLATFORMS)) {
    if (platform.patterns.some(p => urlLower.includes(p))) {
      return { id, platform };
    }
  }

  return null;
}

function analyzeSentimentFromContext(text: string, url: string): 'positive' | 'neutral' | 'negative' | 'unknown' {
  const textLower = text.toLowerCase();

  const positiveIndicators = [
    'highly rated', 'excellent reviews', 'positive reviews', 'customers love',
    'highly recommended', 'top rated', 'five star', '5 star', 'great reviews',
    'stellar reputation', 'outstanding', 'exceptional'
  ];

  const negativeIndicators = [
    'negative reviews', 'complaints', 'poor reviews', 'bad reviews',
    'customer complaints', 'issues reported', 'problems', 'criticized',
    'low rating', 'one star', '1 star', 'avoid', 'warning'
  ];

  const positiveCount = positiveIndicators.filter(i => textLower.includes(i)).length;
  const negativeCount = negativeIndicators.filter(i => textLower.includes(i)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  if (positiveCount === 0 && negativeCount === 0) return 'unknown';
  return 'neutral';
}

function extractContext(response: string, url: string): string {
  // Try to find the URL or domain in the response
  const urlParts = new URL(url);
  const domain = urlParts.hostname.replace('www.', '');

  const responseLower = response.toLowerCase();
  const domainLower = domain.toLowerCase();

  const index = responseLower.indexOf(domainLower);
  if (index === -1) {
    // Can't find domain, return first 200 chars
    return response.slice(0, 200);
  }

  // Return context around the mention
  const start = Math.max(0, index - 100);
  const end = Math.min(response.length, index + 200);
  return response.slice(start, end);
}

function generateRecommendations(
  citations: ReviewCitation[],
  byPlatform: ReviewCitationReport['byPlatform'],
  brand: string
): ReviewCitationReport['recommendations'] {
  const recommendations: ReviewCitationReport['recommendations'] = [];

  // Check for missing review presence
  const presentPlatforms = Object.keys(byPlatform);
  const importantPlatforms = ['trustpilot', 'google-reviews', 'reddit'];

  for (const platform of importantPlatforms) {
    if (!presentPlatforms.includes(platform)) {
      const platformInfo = REVIEW_PLATFORMS[platform as keyof typeof REVIEW_PLATFORMS];
      recommendations.push({
        action: `Create and optimize ${platformInfo.name} profile`,
        priority: 'high',
        platform: platformInfo.name,
        rationale: `${platformInfo.name} is frequently cited by AI but ${brand} has no presence there.`,
      });
    }
  }

  // Check for negative sentiment
  for (const [platformId, data] of Object.entries(byPlatform)) {
    const platformInfo = REVIEW_PLATFORMS[platformId as keyof typeof REVIEW_PLATFORMS];
    if (!platformInfo) continue;

    if (data.sentiment.negative > 0) {
      recommendations.push({
        action: `Address negative reviews on ${platformInfo.name}`,
        priority: 'high',
        platform: platformInfo.name,
        rationale: `${data.sentiment.negative} negative citation(s) from ${platformInfo.name} are appearing in AI responses.`,
      });
    }

    // Check for low citation count on important platforms
    if (importantPlatforms.includes(platformId) && data.count < 3) {
      recommendations.push({
        action: `Increase review volume on ${platformInfo.name}`,
        priority: 'medium',
        platform: platformInfo.name,
        rationale: `Only ${data.count} citation(s) from ${platformInfo.name}. More reviews could improve AI visibility.`,
      });
    }
  }

  // Reddit/Quora recommendations
  const communityPlatforms = ['reddit', 'quora'];
  const hasCommunityPresence = communityPlatforms.some(p => presentPlatforms.includes(p));

  if (!hasCommunityPresence) {
    recommendations.push({
      action: 'Engage authentically on Reddit and Quora',
      priority: 'medium',
      platform: 'Reddit/Quora',
      rationale: 'Community platforms are frequently cited by AI. Authentic engagement can improve brand perception.',
    });
  }

  return recommendations;
}

function identifyConcerns(
  citations: ReviewCitation[],
  byPlatform: ReviewCitationReport['byPlatform']
): ReviewCitationReport['concerns'] {
  const concerns: ReviewCitationReport['concerns'] = [];

  // Check for negative citations
  const negativeCitations = citations.filter(c => c.sentiment === 'negative');
  for (const citation of negativeCitations) {
    concerns.push({
      issue: `Negative review from ${citation.platform} appearing in AI responses`,
      severity: 'high',
      platform: citation.platform,
      url: citation.url,
    });
  }

  // Check for dominant competitor presence on review platforms
  // (Would need competitor data for this - placeholder)

  // Check for outdated citations (would need date info)

  // Check for unverified/unknown sentiment
  const unknownCitations = citations.filter(c => c.sentiment === 'unknown');
  if (unknownCitations.length > citations.length * 0.5) {
    concerns.push({
      issue: 'Many review citations have unclear sentiment - manual review recommended',
      severity: 'medium',
      platform: 'Multiple',
    });
  }

  return concerns;
}

// Main tracking function
function trackReviewCitations(
  results: QueryResult[],
  brand: string
): ReviewCitationReport {
  const timestamp = new Date().toISOString();
  const brandLower = brand.toLowerCase();
  const reviewCitations: ReviewCitation[] = [];

  // Extract citations from all results
  for (const result of results) {
    const sources = result.sources || [];
    const query = result.query || result.originalQuery || result.submittedQuery || '';
    const surface = result.surface || 'unknown';

    for (const source of sources) {
      const platformMatch = identifyPlatform(source.url);
      if (!platformMatch) continue;

      const context = extractContext(result.response, source.url);
      const sentiment = analyzeSentimentFromContext(context, source.url);
      const brandMentioned = context.toLowerCase().includes(brandLower);

      reviewCitations.push({
        url: source.url,
        platform: platformMatch.platform.name,
        platformType: platformMatch.platform.type,
        title: source.title,
        query,
        surface,
        sentiment,
        context,
        brandMentioned,
      });
    }
  }

  // Aggregate by platform
  const byPlatform: ReviewCitationReport['byPlatform'] = {};
  for (const citation of reviewCitations) {
    if (!byPlatform[citation.platform]) {
      byPlatform[citation.platform] = {
        count: 0,
        sentiment: { positive: 0, neutral: 0, negative: 0, unknown: 0 },
        examples: [],
      };
    }

    byPlatform[citation.platform].count++;
    byPlatform[citation.platform].sentiment[citation.sentiment]++;

    if (byPlatform[citation.platform].examples.length < 3) {
      byPlatform[citation.platform].examples.push(citation);
    }
  }

  // Aggregate by type
  const byType: Record<string, number> = {};
  for (const citation of reviewCitations) {
    byType[citation.platformType] = (byType[citation.platformType] || 0) + 1;
  }

  // Sentiment breakdown
  const sentimentBreakdown = {
    positive: reviewCitations.filter(c => c.sentiment === 'positive').length,
    neutral: reviewCitations.filter(c => c.sentiment === 'neutral').length,
    negative: reviewCitations.filter(c => c.sentiment === 'negative').length,
    unknown: reviewCitations.filter(c => c.sentiment === 'unknown').length,
  };

  // Generate concerns and recommendations
  const concerns = identifyConcerns(reviewCitations, byPlatform);
  const recommendations = generateRecommendations(reviewCitations, byPlatform, brand);

  // Count total citations (not just review citations)
  const totalCitations = results.reduce((sum, r) => sum + (r.sources?.length || 0), 0);

  return {
    brand,
    timestamp,
    totalCitations,
    reviewCitations,
    byPlatform,
    byType,
    sentimentBreakdown,
    concerns,
    recommendations,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node track-review-citations.ts <results-file.json> --brand "Brand Name"');
    console.log('\nExample:');
    console.log('  npx ts-node track-review-citations.ts study-results.json --brand "TASC Performance"');
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

  console.log(`\n📝 Review Citation Tracking`);
  console.log(`Brand: ${brand}`);
  console.log(`Results file: ${resultsFile}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  const report = trackReviewCitations(results, brand);

  // Print results
  console.log(`📊 OVERVIEW`);
  console.log(`  Total citations in study: ${report.totalCitations}`);
  console.log(`  Review platform citations: ${report.reviewCitations.length}`);
  console.log(`  Review citation rate: ${((report.reviewCitations.length / report.totalCitations) * 100).toFixed(1)}%`);

  console.log(`\n📱 BY PLATFORM`);
  for (const [platform, data] of Object.entries(report.byPlatform)) {
    console.log(`\n  ${platform}:`);
    console.log(`    Count: ${data.count}`);
    console.log(`    Sentiment: +${data.sentiment.positive} / =${data.sentiment.neutral} / -${data.sentiment.negative}`);
  }

  console.log(`\n📂 BY TYPE`);
  for (const [type, count] of Object.entries(report.byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\n😊 SENTIMENT BREAKDOWN`);
  console.log(`  Positive: ${report.sentimentBreakdown.positive}`);
  console.log(`  Neutral: ${report.sentimentBreakdown.neutral}`);
  console.log(`  Negative: ${report.sentimentBreakdown.negative}`);
  console.log(`  Unknown: ${report.sentimentBreakdown.unknown}`);

  if (report.concerns.length > 0) {
    console.log(`\n⚠️  CONCERNS (${report.concerns.length})`);
    for (const concern of report.concerns) {
      const severity = concern.severity === 'high' ? '🔴' : concern.severity === 'medium' ? '🟡' : '🟢';
      console.log(`  ${severity} ${concern.issue}`);
      if (concern.url) console.log(`     URL: ${concern.url}`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log(`\n💡 RECOMMENDATIONS`);
    for (const rec of report.recommendations) {
      const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      console.log(`\n  ${priority} ${rec.action}`);
      console.log(`     Platform: ${rec.platform}`);
      console.log(`     Rationale: ${rec.rationale}`);
    }
  }

  // Save report
  const outputPath = resultsFile.replace('.json', '-review-citations.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Report saved to: ${outputPath}`);
}

main().catch(console.error);

export { trackReviewCitations, ReviewCitationReport, ReviewCitation };
