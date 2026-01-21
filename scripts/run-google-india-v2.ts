#!/usr/bin/env npx tsx
/**
 * Run HUFT 100-Prompt Study - Google Search from India (v2)
 *
 * FIXED: Better AI Overview extraction with quality control
 * - Waits for AI Overview to fully render
 * - Multiple selector strategies
 * - Quality control validation
 * - Distinguishes AI Overview from People Also Ask
 */

import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// 2Captcha Proxy - Bangalore, Karnataka
const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: 'uae16ff7557af05d3-zone-custom-region-in-st-karnataka-city-bengaluru',
  password: 'uae16ff7557af05d3',
};

const RESUME_FROM_QUERY = 0;

// Irregular delays to appear more human (15-30 seconds)
const MIN_DELAY_MS = 15000;
const MAX_DELAY_MS = 30000;
function randomDelay(): number {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
}

// Human-like typing with variable speed
async function humanType(page: Page, text: string): Promise<void> {
  for (const char of text) {
    await page.keyboard.type(char);
    // Variable delay: 50-150ms between characters, occasional longer pauses
    const delay = 50 + Math.random() * 100;
    const pause = Math.random() < 0.1 ? 200 + Math.random() * 300 : 0; // 10% chance of longer pause
    await page.waitForTimeout(delay + pause);
  }
}

const manifest = JSON.parse(readFileSync('studies/huft-100-prompt-india-study.json', 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

interface QueryResult {
  query: string;
  queryIndex: number;
  surface: string;
  success: boolean;
  response?: string;
  aiOverview?: string;
  aiOverviewQuality?: 'good' | 'paa_only' | 'none' | 'too_short';
  organicResults?: string[];
  error?: string;
  timestamp: string;
  responseTimeMs: number;
}

// Quality control: Validate AI Overview content
function validateAiOverview(text: string | undefined): { isValid: boolean; quality: 'good' | 'paa_only' | 'none' | 'too_short'; reason: string } {
  if (!text || text.trim().length === 0) {
    return { isValid: false, quality: 'none', reason: 'No AI Overview found' };
  }

  // Check if it's just People Also Ask questions (lines ending in ?)
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const questionLines = lines.filter(l => l.trim().endsWith('?'));

  if (questionLines.length >= lines.length * 0.8 && lines.length <= 6) {
    return { isValid: false, quality: 'paa_only', reason: 'Captured People Also Ask instead of AI Overview' };
  }

  // Check minimum length (real AI Overviews are usually 100+ chars)
  if (text.length < 100) {
    return { isValid: false, quality: 'too_short', reason: `Too short (${text.length} chars)` };
  }

  // Check for actual content indicators
  const hasContentIndicators =
    text.includes('.') && // Has sentences
    !text.match(/^(What|How|Where|Why|Which|Can|Do|Is|Are)\s/gm)?.length || 0 > lines.length * 0.5; // Not mostly questions

  if (!hasContentIndicators && questionLines.length > 2) {
    return { isValid: false, quality: 'paa_only', reason: 'Content appears to be questions, not AI Overview' };
  }

  return { isValid: true, quality: 'good', reason: 'Valid AI Overview content' };
}

async function extractAiOverview(page: Page): Promise<{ content: string; quality: 'good' | 'paa_only' | 'none' | 'too_short' }> {
  // Wait extra time for AI Overview to render (it loads dynamically)
  await page.waitForTimeout(3000);

  // Try multiple selector strategies
  const content = await page.evaluate(() => {
    // Strategy 1: Look for AI Overview container with specific attributes
    const aiOverviewSelectors = [
      // Main AI Overview containers
      'div[data-attrid="AIOverview"]',
      'div[jsname="N760b"]', // Common AI Overview container
      'div[data-md="50"]',
      'div.kp-wholepage div[data-async-type="editableDirective"]',

      // AI Overview with specific structure
      'div[data-hveid] > div > div > div[data-sncf="1"]',

      // Look for the expandable AI Overview section
      'div.xpdopen div.LGOjhe',
      'div[data-attrid="wa:/description"]',

      // SGE (Search Generative Experience) containers
      'div[jscontroller="aCZVp"]',
      'div.g-blk div.xpdopen',
    ];

    for (const selector of aiOverviewSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = (el as HTMLElement).innerText?.trim();
        // Must be substantial content, not just a heading
        if (text && text.length > 100 && !text.match(/^(People also ask|Related searches)/i)) {
          // Check it's not just questions
          const lines = text.split('\n').filter(l => l.trim());
          const questions = lines.filter(l => l.trim().endsWith('?'));
          if (questions.length < lines.length * 0.5) {
            return text;
          }
        }
      }
    }

    // Strategy 2: Look for AI-generated content by structure
    // AI Overviews typically have a specific visual structure with bullet points or paragraphs
    const searchContainer = document.querySelector('#search') || document.querySelector('#rso');
    if (searchContainer) {
      // Look for the first major content block before organic results
      const firstBlock = searchContainer.querySelector('div[data-hveid]:first-child');
      if (firstBlock) {
        // Check if it contains AI Overview markers
        const hasAiMarkers = firstBlock.querySelector('div[data-attrid]') ||
                            firstBlock.querySelector('div[jsname="N760b"]') ||
                            firstBlock.querySelector('.LGOjhe');
        if (hasAiMarkers) {
          const text = (firstBlock as HTMLElement).innerText?.trim();
          if (text && text.length > 100) {
            return text;
          }
        }
      }
    }

    // Strategy 3: Look for expandable "AI Overview" section
    const expandButtons = document.querySelectorAll('div[role="button"], button');
    for (const btn of expandButtons) {
      if (btn.textContent?.toLowerCase().includes('ai overview') ||
          btn.textContent?.toLowerCase().includes('show more')) {
        const container = btn.closest('div[data-hveid]');
        if (container) {
          const text = (container as HTMLElement).innerText?.trim();
          if (text && text.length > 100) {
            return text;
          }
        }
      }
    }

    // Strategy 4: Look for the SGE/AI content area at the top of results
    const topContent = document.querySelector('#rso > div:first-child');
    if (topContent) {
      const text = (topContent as HTMLElement).innerText?.trim();
      // Check if this looks like AI content (has paragraphs, not just links)
      if (text && text.length > 150) {
        const hasParagraphs = text.includes('. ') && text.split('. ').length > 2;
        const lines = text.split('\n').filter(l => l.trim());
        const questions = lines.filter(l => l.trim().endsWith('?'));
        if (hasParagraphs && questions.length < lines.length * 0.3) {
          return text;
        }
      }
    }

    // Strategy 5: Fallback - get People Also Ask but mark it
    const paaContainer = document.querySelector('div[data-initq]') ||
                         document.querySelector('div[jsname="Cpkphb"]') ||
                         document.querySelector('div.related-question-pair');
    if (paaContainer) {
      const parent = paaContainer.closest('div[data-hveid]');
      if (parent) {
        const text = (parent as HTMLElement).innerText?.trim();
        if (text) {
          return 'PAA_MARKER:' + text;
        }
      }
    }

    return '';
  });

  // Validate the content
  if (content.startsWith('PAA_MARKER:')) {
    return { content: content.replace('PAA_MARKER:', ''), quality: 'paa_only' };
  }

  const validation = validateAiOverview(content);
  return { content: validation.isValid ? content : '', quality: validation.quality };
}

async function queryGoogleSearch(query: string, queryIndex: number, page: Page): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    await page.bringToFront();

    // Navigate to Google India
    await page.goto('https://www.google.co.in', { timeout: 30000 });
    await page.waitForTimeout(1500);

    // Dismiss modals
    const dismissButtons = ['text="Not now"', 'text="No thanks"', 'text="Dismiss"', 'text="Got it"', 'text="Accept all"'];
    for (const selector of dismissButtons) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click();
          await page.waitForTimeout(300);
        }
      } catch {}
    }

    // Fill and submit search with human-like typing
    const searchInput = page.locator('textarea[name="q"], input[name="q"]').first();
    await searchInput.click();
    await page.waitForTimeout(200 + Math.random() * 300); // Pause before typing
    await humanType(page, query);
    await page.waitForTimeout(300 + Math.random() * 400); // Pause before hitting enter
    await page.keyboard.press('Enter');

    // Wait for results to load
    await page.waitForTimeout(4000);

    // Check for rate limiting
    const isBlocked = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('unusual traffic') ||
             text.includes('not a robot') ||
             text.includes('verify you are human') ||
             window.location.href.includes('/sorry/');
    });

    if (isBlocked) {
      return {
        query,
        queryIndex,
        surface: 'google-search-india',
        success: false,
        error: 'Google rate limited',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
      };
    }

    // Dismiss any post-search modals
    for (const selector of dismissButtons) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 300 })) {
          await btn.click();
        }
      } catch {}
    }

    // Look for "Show more" or expand button for AI Overview
    try {
      const expandButtons = page.locator('div[role="button"]:has-text("Show more"), button:has-text("Show more")');
      if (await expandButtons.first().isVisible({ timeout: 1000 })) {
        await expandButtons.first().click();
        await page.waitForTimeout(2000);
      }
    } catch {}

    // Wait longer for AI Overview to fully render
    await page.waitForTimeout(5000);

    // Extract AI Overview with quality check
    const { content: aiOverview, quality: aiOverviewQuality } = await extractAiOverview(page);

    // Get organic results
    const organicResults = await page.evaluate(() => {
      const results: string[] = [];
      const items = document.querySelectorAll('#search .g, #rso .g');

      for (let i = 0; i < Math.min(items.length, 10); i++) {
        const item = items[i];
        const title = item.querySelector('h3')?.textContent || '';
        const snippet = item.querySelector('.VwiC3b, [data-sncf]')?.textContent || '';
        const link = item.querySelector('a')?.href || '';

        if (title && link && !link.includes('google.com/search')) {
          results.push(`${title}\n${link}\n${snippet}`);
        }
      }

      return results;
    });

    return {
      query,
      queryIndex,
      surface: 'google-search-india',
      success: true,
      aiOverview: aiOverview || undefined,
      aiOverviewQuality,
      organicResults,
      response: aiOverview || organicResults.slice(0, 3).join('\n\n'),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'google-search-india',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
    };
  }
}

// Quality Control Report
function generateQualityReport(results: QueryResult[]): void {
  const total = results.length;
  const successful = results.filter(r => r.success).length;
  const withAiOverview = results.filter(r => r.aiOverviewQuality === 'good').length;
  const paaOnly = results.filter(r => r.aiOverviewQuality === 'paa_only').length;
  const tooShort = results.filter(r => r.aiOverviewQuality === 'too_short').length;
  const none = results.filter(r => r.aiOverviewQuality === 'none' || !r.aiOverview).length;

  console.log('\n' + '='.repeat(70));
  console.log('  QUALITY CONTROL REPORT');
  console.log('='.repeat(70));
  console.log(`\nTotal queries: ${total}`);
  console.log(`Successful: ${successful} (${Math.round(successful/total*100)}%)`);
  console.log(`\nAI Overview Quality:`);
  console.log(`  ✅ Good AI Overviews: ${withAiOverview} (${Math.round(withAiOverview/total*100)}%)`);
  console.log(`  ⚠️  PAA Only (wrong content): ${paaOnly} (${Math.round(paaOnly/total*100)}%)`);
  console.log(`  ⚠️  Too Short: ${tooShort} (${Math.round(tooShort/total*100)}%)`);
  console.log(`  ❌ None Found: ${none} (${Math.round(none/total*100)}%)`);

  if (paaOnly > total * 0.3) {
    console.log('\n' + '!'.repeat(70));
    console.log('  ⚠️  WARNING: High PAA capture rate suggests selector issues');
    console.log('!'.repeat(70));
  }

  if (withAiOverview < total * 0.5) {
    console.log('\n' + '!'.repeat(70));
    console.log('  ⚠️  WARNING: Low AI Overview capture rate');
    console.log('  Google may not be showing AI Overviews for these queries,');
    console.log('  or the page needs more time to render.');
    console.log('!'.repeat(70));
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  HUFT 100-Prompt Study - Google Search India (v2)');
  console.log('  With improved AI Overview extraction and QC');
  console.log('='.repeat(70));
  console.log(`\nTotal queries: ${QUERIES.length}`);
  console.log(`Delay between searches: ${MIN_DELAY_MS/1000}-${MAX_DELAY_MS/1000} seconds (randomized)`);
  console.log(`Estimated time: ~${Math.round(QUERIES.length * (MIN_DELAY_MS + MAX_DELAY_MS) / 2 / 1000 / 60)} minutes`);
  console.log(`Human-like typing enabled`);
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    proxy: PROXY_CONFIG,
    args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--disable-infobars'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Verify IP
  console.log('\nVerifying India IP...');
  const testPage = await context.newPage();
  try {
    await testPage.goto('https://ipinfo.io/json', { timeout: 30000 });
    const ipInfo = await testPage.evaluate(() => JSON.parse(document.body.innerText));
    console.log(`✅ IP Location: ${ipInfo.city}, ${ipInfo.region}, ${ipInfo.country}`);
  } catch (e) {
    console.error('❌ Failed to verify IP:', e);
  }
  await testPage.close();

  const googlePage = await context.newPage();
  console.log('\nOpening Google India...');
  await googlePage.goto('https://www.google.co.in', { timeout: 30000 });
  console.log('✅ Google ready\n');

  let results: QueryResult[] = [];
  if (RESUME_FROM_QUERY > 0) {
    try {
      const path = `studies/huft-google-india-v2-intermediate-${RESUME_FROM_QUERY}.json`;
      if (existsSync(path)) {
        results = JSON.parse(readFileSync(path, 'utf-8')).results || [];
        console.log(`📂 Loaded ${results.length} previous results\n`);
      }
    } catch {}
  }

  const startTime = Date.now();
  let consecutiveFailures = 0;
  let goodAiOverviews = 0;
  let paaCaptures = 0;

  for (let i = RESUME_FROM_QUERY; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const progress = `[${i + 1}/${QUERIES.length}]`;

    console.log(`\n${progress} "${query.slice(0, 55)}${query.length > 55 ? '...' : ''}"`);

    const result = await queryGoogleSearch(query, i, googlePage);
    results.push(result);

    if (result.success) {
      consecutiveFailures = 0;

      // Quality indicator
      let qualityIcon = '❌';
      if (result.aiOverviewQuality === 'good') {
        qualityIcon = '✅';
        goodAiOverviews++;
      } else if (result.aiOverviewQuality === 'paa_only') {
        qualityIcon = '⚠️ PAA';
        paaCaptures++;
      } else if (result.aiOverviewQuality === 'too_short') {
        qualityIcon = '⚠️ SHORT';
      }

      console.log(`  ${qualityIcon} AI Overview | ${result.organicResults?.length || 0} organic results | ${result.responseTimeMs}ms`);
    } else {
      console.log(`  ❌ ${result.error}`);
      consecutiveFailures++;

      if (consecutiveFailures >= 3) {
        console.log('\n' + '!'.repeat(70));
        console.log('  ⚠️  3 consecutive failures - stopping');
        console.log('!'.repeat(70));
        break;
      }
    }

    // Running quality stats every 10 queries
    if ((i + 1) % 10 === 0) {
      const intermediatePath = `studies/huft-google-india-v2-intermediate-${i + 1}.json`;
      writeFileSync(intermediatePath, JSON.stringify({ results, lastQuery: i }, null, 2));
      console.log(`\n  💾 Checkpoint saved | Good AIO: ${goodAiOverviews}/${i+1} | PAA: ${paaCaptures}/${i+1}`);
    }

    if (i < QUERIES.length - 1 && consecutiveFailures === 0) {
      const delay = randomDelay();
      console.log(`  ⏱️  Waiting ${Math.round(delay/1000)}s before next query...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // RETRY PHASE: Retry failed queries
  const failedQueries = results.filter(r => !r.success);
  if (failedQueries.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log(`  RETRY PHASE: ${failedQueries.length} failed queries`);
    console.log('='.repeat(70));
    console.log('  Waiting 60 seconds before retrying...\n');
    await new Promise(r => setTimeout(r, 60000));

    for (const failed of failedQueries) {
      const idx = failed.queryIndex;
      console.log(`\n[RETRY ${idx + 1}/${QUERIES.length}] "${QUERIES[idx].slice(0, 50)}..."`);

      const retryResult = await queryGoogleSearch(QUERIES[idx], idx, googlePage);

      // Replace the failed result with the retry result
      const resultIdx = results.findIndex(r => r.queryIndex === idx);
      if (resultIdx !== -1) {
        results[resultIdx] = retryResult;
      }

      if (retryResult.success) {
        const qualityIcon = retryResult.aiOverviewQuality === 'good' ? '✅' :
                           retryResult.aiOverviewQuality === 'paa_only' ? '⚠️ PAA' : '❌';
        console.log(`  ${qualityIcon} RETRY SUCCESS | ${retryResult.organicResults?.length || 0} organic results`);
      } else {
        console.log(`  ❌ RETRY FAILED: ${retryResult.error}`);
      }

      // Longer delay between retries (30-45 seconds)
      const retryDelay = 30000 + Math.random() * 15000;
      console.log(`  ⏱️  Waiting ${Math.round(retryDelay/1000)}s before next retry...`);
      await new Promise(r => setTimeout(r, retryDelay));
    }

    // Save post-retry checkpoint
    const retryCheckpointPath = 'studies/huft-google-india-v2-post-retry.json';
    writeFileSync(retryCheckpointPath, JSON.stringify({ results }, null, 2));
    console.log(`\n  💾 Post-retry checkpoint saved`);
  }

  const totalTime = Date.now() - startTime;

  // Quality Control Report
  generateQualityReport(results);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.success).length;
  const aiOverviewCount = results.filter(r => r.aiOverviewQuality === 'good').length;

  console.log(`\nGoogle Search: ${successCount}/${results.length} successful`);
  console.log(`Good AI Overviews: ${aiOverviewCount}`);
  console.log(`Total time: ${Math.round(totalTime / 1000 / 60)} minutes`);

  // Save final results
  const outputPath = 'studies/huft-google-india-v2-results.json';
  writeFileSync(outputPath, JSON.stringify({
    studyId: `huft-google-india-v2-${Date.now()}`,
    studyName: `${manifest.name} - Google Search India v2`,
    location: { city: 'Bangalore', region: 'Karnataka', country: 'IN' },
    timestamp: new Date().toISOString(),
    totalTimeMs: totalTime,
    summary: {
      totalJobs: results.length,
      successful: successCount,
      failed: results.length - successCount,
      aiOverviewsGood: results.filter(r => r.aiOverviewQuality === 'good').length,
      aiOverviewsPaaOnly: results.filter(r => r.aiOverviewQuality === 'paa_only').length,
      aiOverviewsNone: results.filter(r => !r.aiOverview || r.aiOverviewQuality === 'none').length,
    },
    results,
  }, null, 2));

  console.log(`\n✅ Results saved to: ${outputPath}`);
  console.log('\n📝 Browser left open for inspection.');
}

main().catch(console.error);
