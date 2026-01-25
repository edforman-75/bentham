/**
 * Study 12: ChatGPT Web - US IP - Original prompts (no suffix)
 */

import 'dotenv/config';
import { chromium, Page } from 'playwright';
import * as fs from 'fs';

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
  studyNumber: number;
  surface: string;
  ipSource: string;
  localizationMethod: string;
  timestamp: string;
  successCount: number;
  totalCount: number;
  results: StudyResult[];
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
    throw new Error('Could not find input textarea');
  }

  await input.fill(query);
  await delay(500);

  const sendButton = await page.$('button[data-testid="send-button"]');
  if (sendButton) {
    await sendButton.click();
  } else {
    await page.keyboard.press('Enter');
  }

  return await waitForChatGPTResponse(page);
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  STUDY 12: ChatGPT Web - US IP - Original Prompts');
  console.log('═'.repeat(70));
  console.log('Surface: ChatGPT Web Interface');
  console.log('IP Source: US (direct)');
  console.log('Localization: Original prompts (no modification)');
  console.log('─'.repeat(70));

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    console.error('No browser contexts found');
    process.exit(1);
  }

  const context = contexts[0];
  const pages = context.pages();
  let chatPage = pages.find(p => p.url().includes('chatgpt.com'));

  if (!chatPage) {
    chatPage = await context.newPage();
    await chatPage.goto('https://chatgpt.com');
    await delay(3000);
  }

  const results: StudyResult[] = [];

  for (let i = 0; i < RANJAN_QUERIES.length; i++) {
    const query = RANJAN_QUERIES[i];
    console.log(`\n[${i + 1}/20] "${query.substring(0, 50)}..."`);

    // Start new chat for each query
    await chatPage.goto('https://chatgpt.com');
    await delay(2000);

    const queryStart = Date.now();
    try {
      const response = await submitQuery(chatPage, query);
      const duration = Date.now() - queryStart;

      results.push({
        queryIndex: i + 1,
        originalQuery: query,
        submittedQuery: query,
        response,
        timestamp: new Date().toISOString(),
        durationMs: duration
      });

      console.log(`  ✅ (${duration}ms) ${response.substring(0, 100).replace(/\n/g, ' ')}...`);

    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        originalQuery: query,
        submittedQuery: query,
        response: `ERROR: ${error}`,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - queryStart
      });
    }

    // Save intermediate every 5
    if ((i + 1) % 5 === 0) {
      const intermediatePath = `studies/study12-intermediate-${i + 1}.json`;
      fs.writeFileSync(intermediatePath, JSON.stringify(results, null, 2));
      console.log(`  💾 Saved to ${intermediatePath}`);
    }

    await delay(2000);
  }

  const studyData: StudyData = {
    studyId: `study12-chatgpt-web-us-original-${Date.now()}`,
    studyName: 'ChatGPT Web - US IP - Original',
    studyNumber: 12,
    surface: 'ChatGPT Web Interface',
    ipSource: 'US (direct)',
    localizationMethod: 'Original prompts (no modification)',
    timestamp: new Date().toISOString(),
    successCount: results.filter(r => !r.response.startsWith('ERROR')).length,
    totalCount: results.length,
    results
  };

  const outputPath = 'studies/study12-chatgpt-web-us-original.json';
  fs.writeFileSync(outputPath, JSON.stringify(studyData, null, 2));

  console.log('\n' + '═'.repeat(70));
  console.log('  STUDY 12 COMPLETE');
  console.log('═'.repeat(70));
  console.log(`Success: ${studyData.successCount}/${studyData.totalCount}`);
  console.log(`Saved to: ${outputPath}`);

  await browser.close();
}

main().catch(console.error);
