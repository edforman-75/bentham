/**
 * Three-Way ChatGPT Web Study
 *
 * Study 1: India IP + Original prompts
 * Study 2: India IP + "in India" suffix
 * Study 3: US IP + "in India" suffix (proxy disabled)
 */

import 'dotenv/config';
import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

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

interface StudyResult {
  queryIndex: number;
  originalQuery: string;
  submittedQuery: string;
  response: string;
  timestamp: string;
  durationMs: number;
}

interface StudyData {
  studyId: string;
  studyName: string;
  ipLocation: string;
  ipAddress: string;
  promptModification: string;
  timestamp: string;
  results: StudyResult[];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
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

async function runStudy(
  page: Page,
  studyName: string,
  addIndiaSuffix: boolean,
  expectedCountry: string
): Promise<StudyData> {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${studyName}`);
  console.log('═'.repeat(70));

  // Check IP
  const ipInfo = await getProxyIP(page);
  console.log(`\nIP: ${ipInfo.ip} (${ipInfo.city}, ${ipInfo.country})`);

  if (ipInfo.country !== expectedCountry) {
    console.log(`⚠️  Warning: Expected ${expectedCountry}, got ${ipInfo.country}`);
  }

  const results: StudyResult[] = [];

  for (let i = 0; i < RANJAN_QUERIES.length; i++) {
    const originalQuery = RANJAN_QUERIES[i];
    const submittedQuery = addIndiaSuffix ? modifyQueryForIndia(originalQuery) : originalQuery;

    console.log(`\n[${i + 1}/20] "${originalQuery.substring(0, 50)}..."`);
    if (addIndiaSuffix && submittedQuery !== originalQuery) {
      console.log(`  → Modified: "${submittedQuery.substring(0, 55)}..."`);
    }
    console.log('─'.repeat(70));

    await startNewChat(page);

    const queryStart = Date.now();
    try {
      const response = await submitQuery(page, submittedQuery);
      const duration = Date.now() - queryStart;

      results.push({
        queryIndex: i + 1,
        originalQuery,
        submittedQuery,
        response,
        timestamp: new Date().toISOString(),
        durationMs: duration
      });

      console.log(`  ✅ Response received (${duration}ms)`);
      console.log(`  Preview: ${response.substring(0, 150).replace(/\n/g, ' ')}...`);

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

    // Save intermediate every 5
    if ((i + 1) % 5 === 0) {
      const intermediatePath = path.join('studies', `three-way-${studyName.replace(/\s+/g, '-').toLowerCase()}-intermediate-${i + 1}.json`);
      fs.writeFileSync(intermediatePath, JSON.stringify(results, null, 2));
      console.log(`  💾 Saved intermediate to ${intermediatePath}`);
    }

    await delay(3000);
  }

  return {
    studyId: `${studyName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
    studyName,
    ipLocation: `${ipInfo.city}, ${ipInfo.country}`,
    ipAddress: ipInfo.ip,
    promptModification: addIndiaSuffix ? 'Added "in India" suffix' : 'Original prompts (no modification)',
    timestamp: new Date().toISOString(),
    results
  };
}

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  THREE-WAY CHATGPT WEB STUDY');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Studies to run:');
  console.log('  1. India IP + Original prompts');
  console.log('  2. India IP + "in India" suffix');
  console.log('  3. US IP + "in India" suffix (disable proxy for this)');
  console.log('══════════════════════════════════════════════════════════════════════');

  // Connect to Chrome
  console.log('\nConnecting to Chrome via CDP...');
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
    console.error('❌ No ChatGPT tab found. Please open chatgpt.com');
    process.exit(1);
  }

  console.log('✅ Connected to ChatGPT');

  const allStudies: StudyData[] = [];

  // Study 1: India IP + Original prompts
  console.log('\n\n🇮🇳 STUDY 1: India IP + Original Prompts');
  await prompt('Press Enter to start Study 1 (make sure India proxy is ENABLED)...');
  const study1 = await runStudy(chatgptPage, 'India-IP-Original', false, 'IN');
  allStudies.push(study1);
  fs.writeFileSync('studies/three-way-study1-india-original.json', JSON.stringify(study1, null, 2));
  console.log('\n✅ Study 1 complete. Saved to studies/three-way-study1-india-original.json');

  // Study 2: India IP + "in India" suffix
  console.log('\n\n🇮🇳 STUDY 2: India IP + "in India" Suffix');
  await prompt('Press Enter to start Study 2 (keep India proxy ENABLED)...');
  const study2 = await runStudy(chatgptPage, 'India-IP-IndiaSuffix', true, 'IN');
  allStudies.push(study2);
  fs.writeFileSync('studies/three-way-study2-india-suffix.json', JSON.stringify(study2, null, 2));
  console.log('\n✅ Study 2 complete. Saved to studies/three-way-study2-india-suffix.json');

  // Study 3: US IP + "in India" suffix
  console.log('\n\n🇺🇸 STUDY 3: US IP + "in India" Suffix');
  console.log('⚠️  DISABLE THE PROXY NOW');
  console.log('   Click ZeroOmega → Select "Direct" or "[System Proxy]"');
  await prompt('Press Enter when proxy is DISABLED and showing US IP...');
  const study3 = await runStudy(chatgptPage, 'US-IP-IndiaSuffix', true, 'US');
  allStudies.push(study3);
  fs.writeFileSync('studies/three-way-study3-us-suffix.json', JSON.stringify(study3, null, 2));
  console.log('\n✅ Study 3 complete. Saved to studies/three-way-study3-us-suffix.json');

  // Save combined results
  const combined = {
    studyType: 'Three-Way ChatGPT Web Comparison',
    timestamp: new Date().toISOString(),
    studies: allStudies
  };
  fs.writeFileSync('studies/three-way-combined-results.json', JSON.stringify(combined, null, 2));

  console.log('\n\n══════════════════════════════════════════════════════════════════════');
  console.log('  ALL STUDIES COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('Files saved:');
  console.log('  - studies/three-way-study1-india-original.json');
  console.log('  - studies/three-way-study2-india-suffix.json');
  console.log('  - studies/three-way-study3-us-suffix.json');
  console.log('  - studies/three-way-combined-results.json');
  console.log('══════════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
