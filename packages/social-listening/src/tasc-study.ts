/**
 * TASC Performance Social Listening Study
 *
 * Integrates Brand24 social data with AI visibility results for TASC Performance.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SocialListeningDatabase, createTascDatabase } from './database.js';
import { importBrand24File, calculateMentionStats } from './brand24-importer.js';
import type { KeywordConfig, SocialListeningReport, CompetitorComparison } from './types.js';

/**
 * TASC Performance keywords and competitors
 */
export const TASC_KEYWORDS: KeywordConfig[] = [
  // Brand keywords
  { keyword: 'TASC Performance', brand: 'TASC', category: 'brand', isCompetitor: false },
  { keyword: 'tasc bamboo', brand: 'TASC', category: 'product', isCompetitor: false },
  { keyword: 'BamCo fabric', brand: 'TASC', category: 'product', isCompetitor: false },
  { keyword: 'tasc activewear', brand: 'TASC', category: 'product', isCompetitor: false },
  { keyword: 'tasc polo', brand: 'TASC', category: 'product', isCompetitor: false },

  // Competitor keywords
  { keyword: 'Lululemon', brand: 'Lululemon', category: 'competitor', isCompetitor: true },
  { keyword: 'Vuori', brand: 'Vuori', category: 'competitor', isCompetitor: true },
  { keyword: 'Rhone', brand: 'Rhone', category: 'competitor', isCompetitor: true },
  { keyword: 'Free Fly', brand: 'Free Fly', category: 'competitor', isCompetitor: true },
  { keyword: 'Cariloha', brand: 'Cariloha', category: 'competitor', isCompetitor: true },
  { keyword: 'Nike activewear', brand: 'Nike', category: 'competitor', isCompetitor: true },
  { keyword: 'Under Armour', brand: 'Under Armour', category: 'competitor', isCompetitor: true },
  { keyword: 'Patagonia activewear', brand: 'Patagonia', category: 'competitor', isCompetitor: true },
  { keyword: 'Allbirds apparel', brand: 'Allbirds', category: 'competitor', isCompetitor: true },

  // Category keywords
  { keyword: 'bamboo athletic wear', brand: 'TASC', category: 'category', isCompetitor: false },
  { keyword: 'sustainable activewear', brand: 'TASC', category: 'category', isCompetitor: false },
  { keyword: 'eco-friendly workout clothes', brand: 'TASC', category: 'category', isCompetitor: false },
  { keyword: 'anti-odor athletic shirts', brand: 'TASC', category: 'category', isCompetitor: false },
];

/**
 * Import Brand24 CSV exports for TASC
 */
export async function importBrand24ForTasc(
  csvDirectory: string,
  db?: SocialListeningDatabase
): Promise<{ imported: number; files: string[] }> {
  const database = db || createTascDatabase();
  const files: string[] = [];
  let totalImported = 0;

  // Find all CSV files in directory
  if (!fs.existsSync(csvDirectory)) {
    console.log(`Directory not found: ${csvDirectory}`);
    return { imported: 0, files: [] };
  }

  const csvFiles = fs.readdirSync(csvDirectory)
    .filter(f => f.endsWith('.csv'))
    .map(f => path.join(csvDirectory, f));

  console.log(`Found ${csvFiles.length} CSV files to import`);

  for (const file of csvFiles) {
    console.log(`Importing ${path.basename(file)}...`);
    files.push(file);

    try {
      // Determine keyword from filename
      const filename = path.basename(file, '.csv').toLowerCase();
      let keywordConfig = TASC_KEYWORDS.find(k =>
        filename.includes(k.keyword.toLowerCase().replace(/\s+/g, '-')) ||
        filename.includes(k.keyword.toLowerCase().replace(/\s+/g, '_'))
      );

      if (!keywordConfig) {
        // Default to TASC brand
        keywordConfig = TASC_KEYWORDS[0];
      }

      // Get or create keyword in database
      const keywordId = await database.getOrCreateKeyword(keywordConfig);

      // Import mentions
      const mentions = importBrand24File(file, keywordId);
      const inserted = await database.insertMentions(mentions);

      console.log(`  Imported ${inserted} mentions for keyword: ${keywordConfig.keyword}`);
      totalImported += inserted;
    } catch (error) {
      console.error(`  Error importing ${file}:`, error);
    }
  }

  return { imported: totalImported, files };
}

/**
 * Import AI visibility results from study JSON files
 */
export async function importVisibilityResults(
  resultsDirectory: string,
  db?: SocialListeningDatabase
): Promise<{ imported: number; studies: string[] }> {
  const database = db || createTascDatabase();
  const studies: string[] = [];
  let totalImported = 0;

  if (!fs.existsSync(resultsDirectory)) {
    console.log(`Directory not found: ${resultsDirectory}`);
    return { imported: 0, studies: [] };
  }

  const jsonFiles = fs.readdirSync(resultsDirectory)
    .filter(f => f.endsWith('.json') && !f.includes('intermediate'))
    .map(f => path.join(resultsDirectory, f));

  console.log(`Found ${jsonFiles.length} result files to import`);

  for (const file of jsonFiles) {
    console.log(`Processing ${path.basename(file)}...`);

    try {
      const content = fs.readFileSync(file, 'utf-8');
      const data = JSON.parse(content);

      // Handle different result formats
      const studyId = data.studyId || data.batchRunId || path.basename(file, '.json');
      const studyName = data.studyName || 'TASC Visibility Study';
      studies.push(studyId);

      // Extract results from various formats
      const results = data.results || data.jobs || [];

      for (const result of results) {
        const queryText = result.queryText || result.query || result.originalQuery;
        if (!queryText) continue;

        // Detect if TASC is mentioned - check multiple sources
        const responseText = result.response || result.responseText || '';
        const aiOverview = result.aiOverview || '';
        const fullText = `${responseText} ${aiOverview}`.toLowerCase();

        // Check pre-calculated brandMentions from source data (for search results)
        let brandMentioned = false;
        let competitorMentions: Array<{ brand: string; count: number }> = [];

        if (result.brandMentions && Array.isArray(result.brandMentions)) {
          // Use pre-calculated brand mentions from visibility tool
          const tascMention = result.brandMentions.find(
            (m: { brand: string; count: number }) =>
              m.brand.toLowerCase().includes('tasc')
          );
          brandMentioned = tascMention && tascMention.count > 0;

          // Extract competitor mentions
          const competitors = ['lululemon', 'vuori', 'rhone', 'nike', 'under armour', 'free fly', 'cariloha', 'patagonia'];
          competitorMentions = result.brandMentions.filter(
            (m: { brand: string; count: number }) =>
              competitors.some(c => m.brand.toLowerCase().includes(c))
          );
        } else {
          // Fall back to text search for AI responses
          brandMentioned = fullText.includes('tasc') ||
            fullText.includes('bamco') ||
            fullText.includes('bamboo performance');

          // Detect competitor mentions in text
          const competitors = ['lululemon', 'vuori', 'rhone', 'nike', 'under armour', 'free fly', 'cariloha', 'patagonia'];
          for (const comp of competitors) {
            const regex = new RegExp(comp, 'gi');
            const matches = fullText.match(regex);
            if (matches && matches.length > 0) {
              competitorMentions.push({ brand: comp, count: matches.length });
            }
          }
        }

        // Also check organic results if brandMentions not present
        if (!brandMentioned && result.organicResults && Array.isArray(result.organicResults)) {
          const organicText = JSON.stringify(result.organicResults).toLowerCase();
          brandMentioned = organicText.includes('tasc');
        }

        await database.insertVisibilityResult({
          studyId,
          studyName,
          queryText,
          queryCategory: result.category,
          surfaceId: result.surfaceId || result.surface || 'unknown',
          locationId: result.locationId || result.location,
          success: result.status === 'complete' || result.success === true,
          responseText,
          aiOverview: result.aiOverview,
          brandMentioned,
          mentionContext: brandMentioned ? extractMentionContext(fullText, 'tasc') : undefined,
          competitorMentions: competitorMentions.length > 0 ? competitorMentions : undefined,
          organicResults: result.organicResults,
          responseTimeMs: result.responseTimeMs,
          rawResponse: result,
        });

        totalImported++;
      }

      console.log(`  Imported ${results.length} results from ${studyId}`);
    } catch (error) {
      console.error(`  Error processing ${file}:`, error);
    }
  }

  return { imported: totalImported, studies };
}

/**
 * Extract context around a brand mention
 */
function extractMentionContext(text: string, brand: string): string {
  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(brand.toLowerCase());
  if (index === -1) return '';

  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + brand.length + 100);
  return text.substring(start, end).trim();
}

/**
 * Generate TASC social listening report
 */
export async function generateTascReport(
  db?: SocialListeningDatabase
): Promise<SocialListeningReport> {
  const database = db || createTascDatabase();

  // Get TASC stats
  const tascStats = await database.getMentionStats('TASC');

  // Get competitor comparison
  const competitors = await database.getCompetitorComparison();

  // Get visibility stats
  const visibilityStats = await database.getVisibilityBySurface();

  // Generate insights
  const insights: string[] = [];
  const recommendations: string[] = [];

  // Analyze sentiment
  const sentimentRatio = tascStats.totalMentions > 0
    ? tascStats.positive / tascStats.totalMentions
    : 0;

  if (sentimentRatio > 0.6) {
    insights.push(`Strong positive sentiment (${Math.round(sentimentRatio * 100)}% positive mentions)`);
  } else if (sentimentRatio < 0.4) {
    insights.push(`Sentiment needs attention (only ${Math.round(sentimentRatio * 100)}% positive mentions)`);
    recommendations.push('Investigate negative mentions and address common complaints');
  }

  // Analyze competitor position
  const tascPosition = competitors.findIndex(c => c.brand === 'TASC') + 1;
  if (tascPosition > 0) {
    insights.push(`TASC ranks #${tascPosition} in share of voice among tracked competitors`);
    if (tascPosition > 3) {
      recommendations.push('Increase brand visibility through targeted content and influencer partnerships');
    }
  }

  // Analyze AI visibility
  const avgVisibility = visibilityStats.reduce((sum, s) => sum + s.visibilityRate, 0) / visibilityStats.length;
  insights.push(`Average AI visibility rate: ${Math.round(avgVisibility)}% across ${visibilityStats.length} surfaces`);

  const lowVisibilitySurfaces = visibilityStats.filter(s => s.visibilityRate < 30);
  if (lowVisibilitySurfaces.length > 0) {
    recommendations.push(`Focus on improving visibility on: ${lowVisibilitySurfaces.map(s => s.surfaceId).join(', ')}`);
  }

  // Top sources insight
  if (tascStats.topSources.length > 0) {
    const topSource = tascStats.topSources[0];
    insights.push(`Most mentions come from ${topSource.source} (${topSource.count} mentions)`);
  }

  return {
    studyId: `tasc-report-${Date.now()}`,
    studyName: 'TASC Performance Social Listening Report',
    generatedAt: new Date().toISOString(),
    dateRange: {
      start: tascStats.mentionsByDay[tascStats.mentionsByDay.length - 1]?.date || new Date().toISOString(),
      end: tascStats.mentionsByDay[0]?.date || new Date().toISOString(),
    },
    brand: {
      name: 'TASC Performance',
      stats: tascStats,
    },
    competitors: competitors.filter(c => c.brand !== 'TASC'),
    insights,
    recommendations,
  };
}

/**
 * CLI entry point
 */
async function main() {
  const command = process.argv[2];

  console.log('TASC Performance Social Listening Study');
  console.log('=======================================\n');

  const db = createTascDatabase();

  switch (command) {
    case 'import-brand24': {
      const csvDir = process.argv[3] || 'data/brand24-exports';
      console.log(`Importing Brand24 data from: ${csvDir}\n`);
      const result = await importBrand24ForTasc(csvDir, db);
      console.log(`\nImported ${result.imported} mentions from ${result.files.length} files`);
      break;
    }

    case 'import-visibility': {
      const resultsDir = process.argv[3] || 'packages/visibility-tool/results/tasc-visibility-study';
      console.log(`Importing visibility results from: ${resultsDir}\n`);
      const result = await importVisibilityResults(resultsDir, db);
      console.log(`\nImported ${result.imported} results from ${result.studies.length} studies`);
      break;
    }

    case 'report': {
      console.log('Generating TASC report...\n');
      const report = await generateTascReport(db);
      console.log(JSON.stringify(report, null, 2));
      break;
    }

    case 'summary': {
      const summary = await db.getSummary();
      console.log('Database Summary:');
      console.log(`  Total mentions: ${summary.totalMentions}`);
      console.log(`  Total keywords: ${summary.totalKeywords}`);
      console.log(`  Visibility results: ${summary.totalVisibilityResults}`);
      if (summary.dateRange) {
        console.log(`  Date range: ${summary.dateRange.start} to ${summary.dateRange.end}`);
      }
      break;
    }

    default:
      console.log('Usage:');
      console.log('  npx tsx tasc-study.ts import-brand24 [csv-directory]');
      console.log('  npx tsx tasc-study.ts import-visibility [results-directory]');
      console.log('  npx tsx tasc-study.ts report');
      console.log('  npx tsx tasc-study.ts summary');
  }
}

// Run if executed directly
main().catch(console.error);
