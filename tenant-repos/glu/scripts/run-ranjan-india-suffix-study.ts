/**
 * Ranjan Comparison Study - With "in India" Suffix
 *
 * Runs Ranjan's 20 prompts through ChatGPT Web with "in India" appended to each query.
 * This compensates for the proxy not routing to India.
 */

import 'dotenv/config';
import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Ranjan's 20 prompts
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
  modifiedQuery: string;
  response: string;
  timestamp: string;
  durationMs: number;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForChatGPTResponse(page: Page): Promise<string> {
  // Wait for the response to start
  await delay(2000);

  // Wait for streaming to complete (button changes from stop to voice)
  let attempts = 0;
  const maxAttempts = 120; // 2 minutes max

  while (attempts < maxAttempts) {
    // Check if still streaming
    const stopButton = await page.$('button[aria-label="Stop streaming"]');
    if (!stopButton) {
      // Streaming stopped, wait a bit for final render
      await delay(1000);
      break;
    }
    await delay(1000);
    attempts++;
  }

  // Get the last assistant message
  const messages = await page.$$('div[data-message-author-role="assistant"]');
  if (messages.length === 0) {
    throw new Error('No assistant response found');
  }

  const lastMessage = messages[messages.length - 1];
  const text = await lastMessage.innerText();
  return text;
}

async function submitQuery(page: Page, query: string): Promise<string> {
  // Find the input field
  const input = await page.$('#prompt-textarea');
  if (!input) {
    throw new Error('Could not find ChatGPT input field');
  }

  // Clear and type the query
  await input.click();
  await input.fill(query);
  await delay(500);

  // Submit
  await page.keyboard.press('Enter');

  // Wait for response
  return await waitForChatGPTResponse(page);
}

async function startNewChat(page: Page): Promise<void> {
  // Use keyboard shortcut to start new chat (more reliable than clicking)
  // Cmd+Shift+O on Mac opens new chat
  await page.keyboard.press('Meta+Shift+KeyO');
  await delay(2000);

  // Fallback: navigate directly to chatgpt.com
  const url = page.url();
  if (url.includes('/c/')) {
    // We're still in a chat, try navigating
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
    await delay(2000);
  }
}

async function main() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  Ranjan Comparison Study - "in India" Suffix Version');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This study appends "in India" to each of Ranjan\'s 20 prompts');
  console.log('to achieve India localization without requiring an India IP.');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('');

  // Connect to Chrome via CDP
  console.log('Connecting to Chrome via CDP (port 9222)...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✅ Connected to Chrome via CDP');
  } catch (error) {
    console.error('\n❌ Could not connect to Chrome.');
    console.error('   Make sure Chrome is running with: --remote-debugging-port=9222');
    process.exit(1);
  }

  // Get existing context and find ChatGPT tab
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('❌ No browser contexts found');
    process.exit(1);
  }

  const context = contexts[0];
  const pages = context.pages();

  console.log('\nLooking for ChatGPT tab...');
  let chatgptPage: Page | null = null;

  for (const page of pages) {
    const url = page.url();
    if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
      chatgptPage = page;
      console.log(`✅ Found ChatGPT tab: ${url}`);
      break;
    }
  }

  if (!chatgptPage) {
    console.error('❌ No ChatGPT tab found. Please open chatgpt.com and log in.');
    process.exit(1);
  }

  // Results storage
  const results: StudyResult[] = [];
  const startTime = Date.now();

  console.log('\n');

  for (let i = 0; i < RANJAN_QUERIES.length; i++) {
    const originalQuery = RANJAN_QUERIES[i];

    // Add "in India" suffix if not already present
    let modifiedQuery = originalQuery;
    const lowerQuery = originalQuery.toLowerCase();
    // Skip if query already mentions India/Indian
    const alreadyHasIndia = lowerQuery.includes('in india') ||
                            lowerQuery.includes('indian') ||
                            lowerQuery.includes('india');
    if (!alreadyHasIndia) {
      // Remove trailing ? and add "in India?"
      modifiedQuery = originalQuery.replace(/\?$/, '') + ' in India?';
    } else {
      console.log('  (Query already mentions India - using as-is)');
    }

    console.log(`[${i + 1}/20] "${originalQuery.substring(0, 50)}..."`);
    console.log(`  → Modified: "${modifiedQuery.substring(0, 60)}..."`);
    console.log('──────────────────────────────────────────────────────────────────────');

    // Start new chat for each query
    await startNewChat(chatgptPage);

    const queryStart = Date.now();
    try {
      const response = await submitQuery(chatgptPage, modifiedQuery);
      const duration = Date.now() - queryStart;

      results.push({
        queryIndex: i + 1,
        originalQuery,
        modifiedQuery,
        response,
        timestamp: new Date().toISOString(),
        durationMs: duration
      });

      console.log(`  ✅ Response received (${duration}ms)`);

      // Show first 200 chars of response
      console.log(`  Preview: ${response.substring(0, 200).replace(/\n/g, ' ')}...`);

    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
      results.push({
        queryIndex: i + 1,
        originalQuery,
        modifiedQuery,
        response: `ERROR: ${error}`,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - queryStart
      });
    }

    console.log('');

    // Save intermediate results every 5 queries
    if ((i + 1) % 5 === 0) {
      const intermediatePath = path.join('studies', `ranjan-india-suffix-intermediate-${i + 1}.json`);
      fs.writeFileSync(intermediatePath, JSON.stringify(results, null, 2));
      console.log(`  💾 Saved intermediate results to ${intermediatePath}\n`);
    }

    // Delay between queries
    await delay(3000);
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000 / 60);

  // Save final results
  const outputData = {
    studyId: `india-suffix-${Date.now()}`,
    studyName: 'Ranjan Queries with "in India" Suffix',
    description: 'Same 20 prompts Ranjan used, with "in India" appended to achieve localization',
    method: 'Query suffix injection',
    surface: 'ChatGPT Web',
    timestamp: new Date().toISOString(),
    totalQueries: RANJAN_QUERIES.length,
    successfulQueries: results.filter(r => !r.response.startsWith('ERROR')).length,
    totalTimeMinutes: totalTime,
    results
  };

  const outputPath = path.join('studies', 'ranjan-india-suffix-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  STUDY COMPLETE');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`Total time: ${totalTime} minutes`);
  console.log(`Successful: ${outputData.successfulQueries}/${outputData.totalQueries}`);
  console.log(`Results saved to: ${outputPath}`);
  console.log('══════════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
