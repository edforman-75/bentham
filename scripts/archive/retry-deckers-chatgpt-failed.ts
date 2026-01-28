#!/usr/bin/env npx tsx
/**
 * Retry failed ChatGPT queries for Deckers study
 */

import { chromium, Page } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const CDP_URL = 'http://localhost:9222';
const RESULTS_FILE = 'repository/results/glu/deckers-us-visibility/chatgpt-web-results.json';

const FAILED_QUERIES = [
  "most comfortable running shoes",
  "best outdoor sandals",
  "best lightweight hiking boots"
];

const ALL_BRANDS = [
  'UGG', 'HOKA', 'Teva', 'Sanuk', 'Koolaburra',
  'Nike', 'Adidas', 'New Balance', 'Brooks', 'ASICS', 'Saucony', 'On Running',
  'Merrell', 'Salomon', 'Keen', 'Columbia', 'The North Face',
  'Birkenstock', 'Crocs', 'Allbirds', 'Vans', 'Converse',
  'Timberland', 'Dr. Martens', 'Clarks', 'Sorel',
  'Zappos', 'DSW', 'Foot Locker', 'Amazon', 'Nordstrom', "Dick's Sporting Goods"
];

function extractBrandMentions(text: string): { brand: string; count: number }[] {
  const mentions: { brand: string; count: number }[] = [];
  for (const brand of ALL_BRANDS) {
    const regex = new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      mentions.push({ brand, count: matches.length });
    }
  }
  return mentions.sort((a, b) => b.count - a.count);
}

async function askChatGPT(page: Page, query: string): Promise<string> {
  // Find and click new chat if needed
  const textarea = page.locator('textarea[data-testid="chat-input"], #prompt-textarea, textarea[placeholder*="Message"]');
  await textarea.waitFor({ timeout: 10000 });

  await textarea.fill(query);
  await page.waitForTimeout(500);

  // Click send
  const sendBtn = page.locator('button[data-testid="send-button"], button[aria-label*="Send"]');
  await sendBtn.click();

  // Wait for response
  await page.waitForTimeout(3000);

  // Wait for response to complete
  let lastLength = 0;
  let stableCount = 0;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const messages = await page.locator('[data-message-author-role="assistant"]').all();
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const text = await lastMsg.textContent() || '';
      if (text.length === lastLength && text.length > 50) {
        stableCount++;
        if (stableCount >= 3) break;
      } else {
        stableCount = 0;
        lastLength = text.length;
      }
    }
  }

  const messages = await page.locator('[data-message-author-role="assistant"]').all();
  if (messages.length > 0) {
    return await messages[messages.length - 1].textContent() || '';
  }
  throw new Error('No response received');
}

async function main() {
  console.log('\n======================================================================');
  console.log('  RETRYING FAILED CHATGPT QUERIES');
  console.log('======================================================================\n');

  // Load existing results
  const data = JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'));

  // Connect to Chrome
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const context = contexts[0];

  // Find ChatGPT tab
  let page: Page | null = null;
  for (const p of context.pages()) {
    if (p.url().includes('chatgpt.com') || p.url().includes('chat.openai.com')) {
      page = p;
      break;
    }
  }

  if (!page) {
    console.error('[ERROR] ChatGPT tab not found');
    process.exit(1);
  }

  console.log('[OK] Found ChatGPT tab\n');

  for (const query of FAILED_QUERIES) {
    process.stdout.write(`Retrying "${query}"... `);

    try {
      // Start new chat
      const newChatBtn = page.locator('a[href="/"], button:has-text("New chat")').first();
      try {
        await newChatBtn.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
      } catch {}

      const startTime = Date.now();
      const response = await askChatGPT(page, query);
      const responseTimeMs = Date.now() - startTime;

      const brandMentions = extractBrandMentions(response);

      // Update the result in the data
      const idx = data.results.findIndex((r: any) => r.query === query);
      if (idx >= 0) {
        data.results[idx] = {
          ...data.results[idx],
          success: true,
          response,
          responseTimeMs,
          brandMentions
        };
      }

      const brands = brandMentions.slice(0, 3).map(b => b.brand).join(', ') || 'no brands';
      console.log(`[OK] (${Math.round(responseTimeMs/1000)}s) [${brands}]`);

    } catch (e: any) {
      console.log(`[FAIL] ${e.message}`);
    }

    await page.waitForTimeout(2000);
  }

  // Recalculate summary
  const successfulResults = data.results.filter((r: any) => r.success);
  data.successfulQueries = successfulResults.length;

  // Save updated results
  writeFileSync(RESULTS_FILE, JSON.stringify(data, null, 2));

  console.log(`\n[OK] Updated results saved. Now ${data.successfulQueries}/100 successful.\n`);
}

main().catch(console.error);
