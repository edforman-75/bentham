#!/usr/bin/env npx tsx
/**
 * Run HUFT Study - Last 5 Prompts
 *
 * Queries both OpenAI API and ChatGPT Web for pet product recommendations.
 */

import { chromium } from 'playwright';

const QUERIES = [
  "What's the best dog food for your dog if they are picky?",
  "What is the best wet dog food for dogs for regular feeding?",
  "What are the best options for dry dog food for dogs with allergies?",
  "Can you list popular pet food brands with good meat content?",
  "What are good allergy chews for dogs with food sensitivities?",
];

const CHATGPT_SELECTORS = {
  input: ['#prompt-textarea', '[contenteditable="true"]'],
  submit: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
  response: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
};

interface QueryResult {
  query: string;
  surface: string;
  success: boolean;
  response?: string;
  error?: string;
  timestamp: string;
}

async function queryChatGPTWeb(query: string): Promise<QueryResult> {
  const startTime = Date.now();

  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => /chatgpt\.com/.test(p.url()));

    if (!page) {
      await browser.close();
      return {
        query,
        surface: 'chatgpt-web',
        success: false,
        error: 'No ChatGPT tab found',
        timestamp: new Date().toISOString(),
      };
    }

    await page.bringToFront();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Count initial responses
    let initialCount = 0;
    for (const sel of CHATGPT_SELECTORS.response) {
      initialCount = await page.locator(sel).count();
      if (initialCount > 0) break;
    }

    // Find and fill input
    let inputFound = false;
    for (const sel of CHATGPT_SELECTORS.input) {
      try {
        if (await page.isVisible(sel)) {
          await page.click(sel);
          await page.keyboard.press('Meta+a');
          try {
            await page.fill(sel, query);
          } catch {
            await page.keyboard.press('Backspace');
            await page.keyboard.type(query);
          }
          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      await browser.close();
      return {
        query,
        surface: 'chatgpt-web',
        success: false,
        error: 'Input field not found',
        timestamp: new Date().toISOString(),
      };
    }

    await page.waitForTimeout(300);

    // Submit
    let submitted = false;
    for (const sel of CHATGPT_SELECTORS.submit) {
      try {
        if (await page.isVisible(sel)) {
          await page.click(sel);
          submitted = true;
          break;
        }
      } catch { continue; }
    }
    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for response
    await page.waitForTimeout(3000);

    let response = '';
    const maxWait = 60000; // 60 seconds for LLM
    const waitStart = Date.now();

    for (const sel of CHATGPT_SELECTORS.response) {
      while (Date.now() - waitStart < maxWait) {
        const currentCount = await page.locator(sel).count();
        if (currentCount > initialCount || initialCount === 0) {
          await page.waitForTimeout(5000); // Wait for response to complete
          break;
        }
        await page.waitForTimeout(1000);
      }

      // Get the last non-empty response
      response = await page.evaluate((s) => {
        const els = document.querySelectorAll(s);
        for (let i = els.length - 1; i >= 0; i--) {
          const text = (els[i] as HTMLElement).innerText?.trim() || '';
          if (text && text.length > 20) return text;
        }
        return '';
      }, sel);

      if (response && response.length > 20) break;
    }

    await browser.close();

    if (!response) {
      return {
        query,
        surface: 'chatgpt-web',
        success: false,
        error: 'No response found',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      query,
      surface: 'chatgpt-web',
      success: true,
      response,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      query,
      surface: 'chatgpt-web',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

async function queryOpenAIAPI(query: string): Promise<QueryResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      query,
      surface: 'openai-api',
      success: false,
      error: 'OPENAI_API_KEY not set',
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'user', content: query }
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        query,
        surface: 'openai-api',
        success: false,
        error: `API error: ${response.status} - ${error}`,
        timestamp: new Date().toISOString(),
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return {
      query,
      surface: 'openai-api',
      success: true,
      response: content,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      query,
      surface: 'openai-api',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('  HUFT Pet Products Visibility Study - Last 5 Prompts');
  console.log('='.repeat(70));
  console.log('');

  const results: QueryResult[] = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    console.log(`\n[${ i + 1}/${QUERIES.length}] Processing: "${query.slice(0, 50)}..."`);
    console.log('-'.repeat(70));

    // Query ChatGPT Web
    console.log('  → ChatGPT Web...');
    const chatgptResult = await queryChatGPTWeb(query);
    results.push(chatgptResult);

    if (chatgptResult.success) {
      console.log('    ✅ Success');
      console.log('    Response (first 200 chars):', chatgptResult.response?.slice(0, 200) + '...');
    } else {
      console.log('    ❌ Failed:', chatgptResult.error);
    }

    // Query OpenAI API
    console.log('  → OpenAI API...');
    const apiResult = await queryOpenAIAPI(query);
    results.push(apiResult);

    if (apiResult.success) {
      console.log('    ✅ Success');
      console.log('    Response (first 200 chars):', apiResult.response?.slice(0, 200) + '...');
    } else {
      console.log('    ❌ Failed:', apiResult.error);
    }

    // Small delay between queries
    if (i < QUERIES.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  RESULTS SUMMARY');
  console.log('='.repeat(70));

  const chatgptResults = results.filter(r => r.surface === 'chatgpt-web');
  const apiResults = results.filter(r => r.surface === 'openai-api');

  console.log(`\nChatGPT Web: ${chatgptResults.filter(r => r.success).length}/${chatgptResults.length} successful`);
  console.log(`OpenAI API:  ${apiResults.filter(r => r.success).length}/${apiResults.length} successful`);

  // Save results to file
  const outputPath = 'studies/huft-study-results.json';
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify({
    study: 'HUFT Pet Products Visibility Study',
    timestamp: new Date().toISOString(),
    queries: QUERIES,
    results,
  }, null, 2));

  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
