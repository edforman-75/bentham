#!/usr/bin/env npx tsx
/**
 * Rerun Google AI Overview Queries with Fixed Detection
 *
 * The original run used incorrect selectors and udm=14 mode.
 * This script uses regular Google search and better AI Overview detection.
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';

const MANIFEST_PATH = 'studies/city-of-boise-visibility.json';
const OUTPUT_PATH = 'studies/city-of-boise-google-ai-overview-results.json';

interface Manifest {
  queries: { text: string; category: string }[];
}

interface QueryResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surfaceId: string;
  status: 'complete' | 'failed';
  responseText?: string;
  responseTimeMs: number;
  error?: string;
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function extractAIOverview(page: Page): Promise<string> {
  // Method 1: Look for data-sgrd element which contains AI Overview
  try {
    const sgrdElements = await page.locator('div[data-sgrd]').all();
    for (const el of sgrdElements) {
      const text = await el.innerText().catch(() => '');
      // AI Overview text typically starts with "AI Overview" header
      if (text && text.includes('AI Overview') && text.length > 100) {
        // Strip the "AI Overview" header and clean up
        return text.replace(/^AI Overview\s*/i, '').trim();
      }
    }
  } catch {}

  // Method 2: Use page.evaluate to find AI Overview section
  try {
    const aiContent = await page.evaluate(() => {
      // Find the AI Overview by looking for the header text
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        if (span.textContent?.trim() === 'AI Overview') {
          // Found the header, get the parent container's content
          let container = span.parentElement;
          for (let i = 0; i < 5 && container; i++) {
            const text = (container as HTMLElement).innerText;
            if (text && text.length > 200) {
              return text.replace(/^AI Overview\s*/i, '').trim();
            }
            container = container.parentElement;
          }
        }
      }

      // Fallback: look for data-sgrd
      const sgrd = document.querySelector('div[data-sgrd]');
      if (sgrd) {
        const text = (sgrd as HTMLElement).innerText;
        if (text && text.length > 100) {
          return text.replace(/^AI Overview\s*/i, '').trim();
        }
      }

      return '';
    });

    if (aiContent && aiContent.length > 50) {
      return aiContent;
    }
  } catch {}

  // Method 3: Try other known selectors
  const fallbackSelectors = [
    '.wDYxhc[data-md]',
    '.ifM9O .LGOjhe',
    '[jsname="N760b"]',
  ];

  for (const sel of fallbackSelectors) {
    try {
      const elements = await page.locator(sel).all();
      for (const el of elements) {
        const text = await el.innerText().catch(() => '');
        if (text && text.length > 100) {
          return text.replace(/^AI Overview\s*/i, '').trim();
        }
      }
    } catch {}
  }

  return '';
}

async function queryGoogleAIOverview(page: Page, query: string): Promise<{ success: boolean; text: string; timeMs: number; error?: string }> {
  const startTime = Date.now();

  try {
    // Use regular Google search (NOT AI Mode with udm=14)
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for page to fully load
    await page.waitForTimeout(randomDelay(3000, 5000));

    // Try to extract AI Overview content
    let aiOverviewText = await extractAIOverview(page);

    // If not found immediately, wait a bit more and retry (AI Overview may load async)
    if (!aiOverviewText) {
      await page.waitForTimeout(3000);
      aiOverviewText = await extractAIOverview(page);
    }

    const timeMs = Date.now() - startTime;

    if (aiOverviewText && aiOverviewText.length > 50) {
      return { success: true, text: aiOverviewText, timeMs };
    } else {
      return { success: false, text: '', timeMs, error: 'No AI Overview found' };
    }
  } catch (error) {
    return { success: false, text: '', timeMs: Date.now() - startTime, error: String(error) };
  }
}

async function main() {
  console.log('=' .repeat(70));
  console.log('  RERUN GOOGLE AI OVERVIEW QUERIES (Fixed Detection)');
  console.log('='.repeat(70));
  console.log();

  // Load manifest
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`Loaded ${manifest.queries.length} queries from manifest\n`);

  // Connect to Chrome
  console.log('Connecting to Chrome on port 9222...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    console.error('No browser contexts found');
    process.exit(1);
  }

  const context = contexts[0];
  const pages = context.pages();

  // Find or create a Google page
  let googlePage = pages.find(p => p.url().includes('google.com'));
  if (!googlePage) {
    googlePage = await context.newPage();
    await googlePage.goto('https://www.google.com');
    await googlePage.waitForTimeout(2000);
  }

  const results: QueryResult[] = [];
  let successCount = 0;
  let failCount = 0;

  console.log(`\nProcessing ${manifest.queries.length} queries...\n`);
  console.log('-'.repeat(70));

  for (let i = 0; i < manifest.queries.length; i++) {
    const query = manifest.queries[i];
    const queryNum = i + 1;

    process.stdout.write(`  [${queryNum}/${manifest.queries.length}] "${query.text.slice(0, 40)}..."  `);

    const result = await queryGoogleAIOverview(googlePage, query.text);

    if (result.success) {
      successCount++;
      console.log(`✓ (${(result.timeMs / 1000).toFixed(1)}s)`);
      results.push({
        queryIndex: queryNum,
        queryText: query.text,
        category: query.category,
        surfaceId: 'google-ai-overview',
        status: 'complete',
        responseText: result.text,
        responseTimeMs: result.timeMs,
      });
    } else {
      failCount++;
      console.log(`✗ ${result.error}`);
      results.push({
        queryIndex: queryNum,
        queryText: query.text,
        category: query.category,
        surfaceId: 'google-ai-overview',
        status: 'failed',
        responseTimeMs: result.timeMs,
        error: result.error,
      });
    }

    // Delay between queries
    if (i < manifest.queries.length - 1) {
      const delay = randomDelay(8000, 15000);
      process.stdout.write(`     ⏳ Waiting ${Math.round(delay/1000)}s...\n`);
      await googlePage.waitForTimeout(delay);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('  COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n  Total: ${manifest.queries.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Success Rate: ${((successCount / manifest.queries.length) * 100).toFixed(1)}%`);

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    studyName: 'City of Boise AI Visibility Study - Google AI Overview Rerun',
    surface: 'google-ai-overview',
    summary: {
      total: manifest.queries.length,
      successful: successCount,
      failed: failCount,
    },
    results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n  Results saved to: ${OUTPUT_PATH}\n`);
}

main().catch(console.error);
