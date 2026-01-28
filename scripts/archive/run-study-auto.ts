/**
 * Auto-running ChatGPT Web Study (no user prompts)
 * Runs Study 1: India IP + Original prompts
 */

import 'dotenv/config';
import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const RANJAN_QUERIES = [
  "Which are the best budget dog food brands online?",
  "Can you suggest the best treat brands for dogs online?",
  "Which are the best dog food brands with high reviews?",
  "Which are the best dog food brands recommended by vets?",
  "Can you list a popular pet food brand with good meat content?",
  "Which brands offer gluten-free dog treats my dog will enjoy?",
  "Can you suggest the best dog biscuit brands for dogs with sensitive stomachs?",
  "Which are the top healthy vegetarian dog biscuit brands available online?",
  "What are the best-tasting treat brands for dogs under ₹1000?",
  "Which brands offer low-calorie chicken dog treats?",
  "Which are the best dog treat brands for medium-sized dogs?",
  "Can you suggest some good Heads Up For Tails dog food options?",
  "Which brands offer the highest-rated gluten-free chicken dog biscuits?",
  "Can you suggest trusted brands that make healthy dog treats for puppies online?",
  "Which are the most recommended brands for crunchy dog biscuits for adult dogs?",
  "Which brand makes the most comfortable dog beds for small dogs in India?",
  "What's a trusted brand that offers interactive dog toys for large dogs?",
  "Which company has the best chew toys for small dogs that last long?",
  "Can you suggest a reliable brand that sells dog harnesses for puppies?",
  "What's one of the top Indian brands for wet cat food?"
];

// Get study type from command line: 1, 2, or 3
const STUDY_NUM = parseInt(process.argv[2] || '1');
const ADD_INDIA_SUFFIX = STUDY_NUM >= 2;
const STUDY_NAME = STUDY_NUM === 1 ? 'India-IP-Original'
                 : STUDY_NUM === 2 ? 'India-IP-IndiaSuffix'
                 : 'US-IP-IndiaSuffix';

interface StudyResult {
  queryIndex: number;
  originalQuery: string;
  submittedQuery: string;
  response: string;
  timestamp: string;
  durationMs: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForChatGPTResponse(page: Page): Promise<string> {
  await delay(2000);
  let attempts = 0;
  const maxAttempts = 120;

  while (attempts < maxAttempts) {
    const stopButton = await page.$('button[aria-label="Stop streaming"]');
    if (!stopButton) {
      await delay(1000);
      break;
    }
    await delay(1000);
    attempts++;
  }

  const messages = await page.$$('div[data-message-author-role="assistant"]');
  if (messages.length === 0) {
    throw new Error('No assistant response found');
  }

  const lastMessage = messages[messages.length - 1];
  return await lastMessage.innerText();
}

async function submitQuery(page: Page, query: string): Promise<string> {
  const input = await page.$('#prompt-textarea');
  if (!input) {
    throw new Error('Could not find ChatGPT input field');
  }

  await input.click();
  await input.fill(query);
  await delay(500);
  await page.keyboard.press('Enter');

  return await waitForChatGPTResponse(page);
}

async function startNewChat(page: Page): Promise<void> {
  await page.keyboard.press('Meta+Shift+KeyO');
  await delay(2000);

  const url = page.url();
  if (url.includes('/c/')) {
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
    await delay(2000);
  }
}

async function getProxyIP(page: Page): Promise<{ip: string, country: string, city: string}> {
  const newPage = await page.context().newPage();
  await newPage.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded' });
  const content = await newPage.textContent('body');
  await newPage.close();

  try {
    const data = JSON.parse(content || '{}');
    return {
      ip: data.ip || 'unknown',
      country: data.country || 'unknown',
      city: data.city || 'unknown'
    };
  } catch {
    return { ip: 'unknown', country: 'unknown', city: 'unknown' };
  }
}

function modifyQueryForIndia(query: string): string {
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('in india') || lowerQuery.includes('indian')) {
    return query;
  }
  return query.replace(/\?$/, '') + ' in India?';
}

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`  STUDY ${STUDY_NUM}: ${STUDY_NAME}`);
  console.log('══════════════════════════════════════════════════════════════════════');

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();

  let chatgptPage: Page | null = null;
  for (const page of pages) {
    if (page.url().includes('chatgpt.com') || page.url().includes('chat.openai.com')) {
      chatgptPage = page;
      break;
    }
  }

  if (!chatgptPage) {
    console.error('❌ No ChatGPT tab found');
    process.exit(1);
  }

  console.log('✅ Connected to ChatGPT');

  // Check IP
  const ipInfo = await getProxyIP(chatgptPage);
  console.log(`\nIP: ${ipInfo.ip} (${ipInfo.city}, ${ipInfo.country})`);

  const results: StudyResult[] = [];

  for (let i = 0; i < RANJAN_QUERIES.length; i++) {
    const originalQuery = RANJAN_QUERIES[i];
    const submittedQuery = ADD_INDIA_SUFFIX ? modifyQueryForIndia(originalQuery) : originalQuery;

    console.log(`\n[${i + 1}/20] "${originalQuery.substring(0, 50)}..."`);
    if (ADD_INDIA_SUFFIX && submittedQuery !== originalQuery) {
      console.log(`  → Modified: "${submittedQuery.substring(0, 55)}..."`);
    }
    console.log('─'.repeat(70));

    await startNewChat(chatgptPage);

    const queryStart = Date.now();
    try {
      const response = await submitQuery(chatgptPage, submittedQuery);
      const duration = Date.now() - queryStart;

      results.push({
        queryIndex: i + 1,
        originalQuery,
        submittedQuery,
        response,
        timestamp: new Date().toISOString(),
        durationMs: duration
      });

      console.log(`  ✅ (${duration}ms) ${response.substring(0, 100).replace(/\n/g, ' ')}...`);

    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        originalQuery,
        submittedQuery,
        response: `ERROR: ${error}`,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - queryStart
      });
    }

    if ((i + 1) % 5 === 0) {
      const intermediatePath = path.join('studies', `study${STUDY_NUM}-intermediate-${i + 1}.json`);
      fs.writeFileSync(intermediatePath, JSON.stringify(results, null, 2));
      console.log(`  💾 Saved to ${intermediatePath}`);
    }

    await delay(3000);
  }

  const studyData = {
    studyId: `study${STUDY_NUM}-${STUDY_NAME}-${Date.now()}`,
    studyName: STUDY_NAME,
    studyNumber: STUDY_NUM,
    ipLocation: `${ipInfo.city}, ${ipInfo.country}`,
    ipAddress: ipInfo.ip,
    promptModification: ADD_INDIA_SUFFIX ? 'Added "in India" suffix' : 'Original prompts',
    timestamp: new Date().toISOString(),
    successCount: results.filter(r => !r.response.startsWith('ERROR')).length,
    totalCount: results.length,
    results
  };

  const outputPath = `studies/study${STUDY_NUM}-${STUDY_NAME.toLowerCase()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(studyData, null, 2));

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  STUDY ${STUDY_NUM} COMPLETE`);
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`IP: ${ipInfo.ip} (${ipInfo.country})`);
  console.log(`Success: ${studyData.successCount}/${studyData.totalCount}`);
  console.log(`Saved to: ${outputPath}`);
}

main().catch(console.error);
