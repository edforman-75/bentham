#!/usr/bin/env npx tsx
/**
 * Run Kyanos Voter Impact Study via Bentham Pipeline
 *
 * Executes a candidate visibility study across multiple AI web surfaces
 * using Chrome DevTools Protocol (CDP) for browser automation.
 *
 * Usage: npx tsx scripts/run-kyanos-study.ts studies/todd-achilles-full-study.json
 */

import { chromium, Page } from 'playwright';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface Manifest {
  version: string;
  name: string;
  description?: string;
  candidate?: { name: string; race: string; state: string; electionDate: string };
  queries: { text: string; category: string; tags?: string[] }[];
  surfaces: { id: string; name?: string; required?: boolean; weight?: number; skip?: boolean }[];
  locations: { id: string; name?: string; country?: string; region?: string }[];
  completionCriteria: {
    requiredSurfaces: { surfaceIds: string[]; coverageThreshold: number };
    maxRetriesPerCell: number;
  };
  qualityGates: { minResponseLength?: number; requireActualContent: boolean };
}

interface Job {
  id: string;
  queryText: string;
  queryIndex: number;
  category: string;
  surfaceId: string;
  surfaceName: string;
  locationId: string;
  status: 'pending' | 'executing' | 'complete' | 'failed';
  attempts: number;
  maxAttempts: number;
  result?: { responseText: string; responseTimeMs: number };
  error?: string;
}

interface QueryResult {
  success: boolean;
  responseText?: string;
  responseTimeMs: number;
  error?: string;
}

// ============================================================================
// CDP Surface Configurations
// ============================================================================

const SURFACE_PATTERNS: Record<string, RegExp> = {
  'chatgpt-web': /chatgpt\.com/,
  'claude-web': /claude\.ai/,
  'perplexity-web': /perplexity\.ai/,
  'x-grok-web': /x\.com|twitter\.com/,
  'meta-ai-web': /meta\.ai/,
  'copilot-web': /copilot\.microsoft\.com/,
  'gemini-web': /gemini\.google\.com/,
  'google-ai-overview': /google\.com\/search.*udm=14/,
  'google-search': /google\.com(?!.*udm=14)/, // Match google.com but exclude AI mode
  'bing-search': /bing\.com/,
};

const SURFACE_SELECTORS: Record<string, { input: string[]; submit: string[]; response: string[]; aiMode?: boolean }> = {
  'chatgpt-web': {
    input: ['#prompt-textarea', '[contenteditable="true"]'],
    submit: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
    response: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
  },
  'claude-web': {
    input: ['[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'],
    submit: ['button[aria-label="Send Message"]', 'button:has-text("Send")'],
    response: ['[data-is-streaming]', '.font-claude-message', '[class*="Message"]'],
  },
  'perplexity-web': {
    input: ['textarea[placeholder*="Ask"]', 'textarea[placeholder*="ask"]', 'textarea.overflow-auto', 'div[contenteditable="true"]', 'textarea'],
    submit: ['button[aria-label="Submit"]', 'button[aria-label="Search"]', 'button[type="submit"]', 'button:has(svg[class*="arrow"])'],
    response: ['.prose', '.markdown', '[class*="prose"]', '[class*="Answer"]', '[class*="answer"]', 'div[class*="response"]'],
  },
  'x-grok-web': {
    input: ['textarea[data-testid="grokComposerInput"]', 'textarea'],
    submit: ['button[data-testid="grokSend"]', 'button:has-text("Send")'],
    response: ['[data-testid="grokResponse"]', '[class*="grok"]'],
  },
  'meta-ai-web': {
    input: ['textarea[placeholder*="message"]', 'textarea'],
    submit: ['button[aria-label="Send"]', 'button:has(svg[viewBox])'],
    response: ['[class*="assistant"]', '[class*="response"]', 'div[dir="auto"]'],
  },
  'copilot-web': {
    input: ['textarea#userInput', 'textarea[placeholder*="message"]', 'textarea'],
    submit: ['button[aria-label="Submit"]', 'button.submit', 'button:has(svg)'],
    response: ['[class*="response"]', '[class*="message"]', '.ac-textBlock'],
  },
  'gemini-web': {
    input: ['div[contenteditable="true"]', 'textarea'],
    submit: ['button[aria-label="Send message"]', 'button.send-button'],
    response: ['message-content', '.model-response', '[class*="response"]'],
  },
  'google-ai-overview': {
    input: ['textarea[aria-label*="Ask"]', 'textarea[placeholder*="Ask"]', 'div[contenteditable="true"]', 'textarea[name="q"]', 'textarea[aria-label="Search"]', 'input[name="q"]', 'textarea#APjFqb', 'textarea'],
    submit: ['button[aria-label="Submit"]', 'button[aria-label="Send"]', 'button[type="submit"]', 'button[aria-label="Google Search"]'],
    response: ['[class*="response"]', '[class*="answer"]', '[data-attrid*="description"]', '[class*="kno-rdesc"]', '.markdown', '.prose', '#rso'],
    aiMode: true, // Enable AI Mode navigation
  },
  'bing-search': {
    input: ['textarea#sb_form_q', 'input#sb_form_q', 'textarea[name="q"]'],
    submit: ['button#sb_form_go', 'input[type="submit"]'],
    response: [], // Handled by dedicated function
  },
  'google-search': {
    input: ['textarea[name="q"]', 'input[name="q"]'],
    submit: ['button[type="submit"]'],
    response: [], // Handled by dedicated function
  },
};

const SLOW_SURFACES = new Set(['chatgpt-web', 'claude-web', 'gemini-web', 'copilot-web']);

// ============================================================================
// Human-like Randomization Utilities
// ============================================================================

/**
 * Generate a random delay within a range (inclusive)
 */
function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Generate a typing delay that varies like a human typist
 * Faster for common letters, slower for shifts and special chars
 */
function humanTypingDelay(): number {
  // Base delay 30-90ms with occasional pauses (150-400ms)
  const roll = Math.random();
  if (roll < 0.1) {
    // 10% chance of a longer pause (thinking, typo correction)
    return randomDelay(200, 500);
  } else if (roll < 0.3) {
    // 20% chance of slower typing
    return randomDelay(70, 120);
  } else {
    // 70% normal typing speed
    return randomDelay(25, 65);
  }
}

/**
 * Human-like text entry with variable speed and occasional micro-pauses
 */
async function humanType(page: Page, text: string): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const delay = humanTypingDelay();
    await page.keyboard.type(char, { delay: 0 });
    await page.waitForTimeout(delay);

    // Occasional longer pauses at word boundaries or punctuation
    if (char === ' ' && Math.random() < 0.15) {
      await page.waitForTimeout(randomDelay(100, 300));
    } else if ('.?!'.includes(char) && Math.random() < 0.3) {
      await page.waitForTimeout(randomDelay(200, 600));
    }
  }
}

/**
 * Human-like delay before taking an action (simulates reading/thinking)
 */
async function humanPause(page: Page, type: 'quick' | 'normal' | 'thinking' | 'between_queries'): Promise<void> {
  const delays: Record<string, [number, number]> = {
    quick: [200, 600],
    normal: [400, 1200],
    thinking: [1500, 4000],
    between_queries: [3000, 8000], // 3-8 seconds between queries (like a human reading and composing)
  };
  const [min, max] = delays[type];
  await page.waitForTimeout(randomDelay(min, max));
}

// ============================================================================
// CDP Query Function
// ============================================================================

async function querySurfaceViaCDP(surfaceId: string, query: string): Promise<QueryResult> {
  const startTime = Date.now();
  const pattern = SURFACE_PATTERNS[surfaceId];
  const selectors = SURFACE_SELECTORS[surfaceId];

  if (!pattern || !selectors) {
    return { success: false, responseTimeMs: 0, error: `Unknown surface: ${surfaceId}` };
  }

  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => pattern.test(p.url()));

    if (!page) {
      await browser.close();
      return { success: false, responseTimeMs: Date.now() - startTime, error: `No ${surfaceId} tab found. Please open the page first.` };
    }

    await page.bringToFront();
    await page.evaluate(() => window.scrollTo(0, 0));
    await humanPause(page, 'quick'); // Quick pause before starting

    // Dismiss any modals
    await dismissModals(page, surfaceId);

    // Special handling for Google AI Overview - navigate directly with query
    if (surfaceId === 'google-ai-overview') {
      return await queryGoogleAIOverview(page, query, startTime);
    }

    // Special handling for Bing Search - navigate directly with query
    if (surfaceId === 'bing-search') {
      return await queryBingSearch(page, query, startTime);
    }

    // Special handling for Google Search - navigate directly with query
    if (surfaceId === 'google-search') {
      return await queryGoogleSearch(page, query, startTime);
    }

    // Abort any stuck generation
    await abortStuckGeneration(page, surfaceId);

    // Count initial responses
    let initialCount = 0;
    for (const sel of selectors.response) {
      try {
        initialCount = await page.locator(sel).count();
        if (initialCount > 0) break;
      } catch { continue; }
    }

    // Find and fill input - use human-like typing
    let inputFound = false;
    for (const sel of selectors.input) {
      try {
        const locator = page.locator(sel).first();
        if (await locator.isVisible({ timeout: 2000 })) {
          await locator.click();
          await humanPause(page, 'quick'); // Small pause after clicking input
          await page.keyboard.press('Meta+a');
          await page.waitForTimeout(randomDelay(80, 200));
          await page.keyboard.press('Backspace');
          await humanPause(page, 'quick'); // Pause before typing like human thinking

          // Use human-like typing with variable speed
          await humanType(page, query);

          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      await browser.close();
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'Input field not found' };
    }

    // Human pause after typing before submitting (reviewing what they typed)
    await humanPause(page, 'normal');

    // Submit
    let submitted = false;
    for (const sel of selectors.submit) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          submitted = true;
          break;
        }
      } catch { continue; }
    }
    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for response - randomized initial wait
    await page.waitForTimeout(randomDelay(1500, 3000));

    let response = '';
    const maxWait = 45000; // 45s max
    const waitStart = Date.now();

    // Poll for new response appearing
    for (const sel of selectors.response) {
      let foundNew = false;
      while (Date.now() - waitStart < maxWait) {
        try {
          const currentCount = await page.locator(sel).count();
          if (currentCount > initialCount || initialCount === 0) {
            foundNew = true;
            // Wait for streaming to finish - check if content is still changing
            let lastLen = 0;
            let stableCount = 0;
            for (let i = 0; i < 15; i++) { // Max 15 checks
              await page.waitForTimeout(randomDelay(800, 1400)); // Randomized polling
              const currentText = await page.evaluate((s) => {
                const els = document.querySelectorAll(s);
                return els.length > 0 ? (els[els.length - 1] as HTMLElement).innerText?.length || 0 : 0;
              }, sel);
              if (currentText === lastLen && currentText > 50) {
                stableCount++;
                if (stableCount >= 2) break; // Stable for ~2s = done
              } else {
                stableCount = 0;
              }
              lastLen = currentText;
            }
            break;
          }
        } catch { /* continue */ }
        await page.waitForTimeout(randomDelay(400, 700)); // Randomized polling interval
      }
      // Get the last non-empty response
      try {
        response = await page.evaluate((s) => {
          const els = document.querySelectorAll(s);
          for (let i = els.length - 1; i >= 0; i--) {
            const text = (els[i] as HTMLElement).innerText?.trim() || '';
            if (text && text.length > 20) return text;
          }
          return '';
        }, sel);
      } catch { /* continue */ }

      if (response && response.length > 20) break;
    }

    await browser.close();

    if (!response) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No response found' };
    }

    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Query Google AI Overview by navigating with search query + AI Mode parameter
 * Google AI Overview generates responses from the search URL, not a chat interface
 */
async function queryGoogleAIOverview(page: Page, query: string, startTime: number): Promise<QueryResult> {
  try {
    // Build AI Mode search URL with query
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=14`;
    console.log(`  [Google AI Overview] Navigating to AI Mode search...`);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(randomDelay(2000, 4000)); // Wait for initial load

    // AI Overview response selectors - Google's AI response containers
    const aiResponseSelectors = [
      // AI Overview specific containers
      '[data-sgrd="true"]', // AI-generated response container
      '.wDYxhc[data-md]', // Knowledge panel with AI content
      '.xpdopen .LGOjhe', // Expandable AI section
      '[data-attrid="wa:/description"]', // AI description
      'div[data-async-token]', // Async loaded AI content
      '.ifM9O .f7BGEf', // AI answer container
      '[jsname="yEBWhe"]', // AI response block
      '.MjjYud .g .VwiC3b', // Search result with AI enhancement
      // Fallback to knowledge panels
      '.kno-rdesc span', // Knowledge panel description
      '[data-attrid*="description"]',
      '.LGOjhe', // General expandable content
      '.IZ6rdc', // Featured snippet
      '.hgKElc', // Featured snippet text
      '.s6JM6d .VwiC3b', // Result snippet
    ];

    let response = '';
    const maxWait = 20000;
    const waitStart = Date.now();

    // Poll for AI response to appear and stabilize
    while (Date.now() - waitStart < maxWait) {
      for (const sel of aiResponseSelectors) {
        try {
          const elements = await page.locator(sel).all();
          for (const el of elements) {
            const text = await el.innerText().catch(() => '');
            if (text && text.length > 100 && text.length > response.length) {
              response = text.trim();
            }
          }
        } catch { continue; }
      }

      if (response.length > 100) {
        // Wait a bit more for content to stabilize
        const prevLen = response.length;
        await page.waitForTimeout(1500);

        // Check if content is still loading
        for (const sel of aiResponseSelectors) {
          try {
            const elements = await page.locator(sel).all();
            for (const el of elements) {
              const text = await el.innerText().catch(() => '');
              if (text && text.length > response.length) {
                response = text.trim();
              }
            }
          } catch { continue; }
        }

        // If stable, break
        if (response.length === prevLen) {
          break;
        }
      }

      await page.waitForTimeout(500);
    }

    // If no AI response, try to get the first organic result as fallback
    if (!response || response.length < 50) {
      console.log(`  [Google AI Overview] No AI response, trying organic results...`);
      try {
        response = await page.evaluate(() => {
          // Try organic search results
          const results = document.querySelectorAll('.g .VwiC3b, .g .VwiC3b span');
          let combined = '';
          for (const r of Array.from(results).slice(0, 3)) {
            const text = (r as HTMLElement).innerText?.trim();
            if (text && text.length > 30) {
              combined += text + '\n\n';
            }
          }
          return combined.trim();
        });
      } catch { /* ignore */ }
    }

    if (!response || response.length < 50) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No AI Overview response found' };
    }

    console.log(`  [Google AI Overview] ✅ Got response (${response.length} chars)`);
    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Query Google Search (traditional, non-AI) by navigating with search query
 * Extracts featured snippets, knowledge panels, and organic results
 */
async function queryGoogleSearch(page: Page, query: string, startTime: number): Promise<QueryResult> {
  try {
    // Build Google search URL - explicitly exclude AI mode
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;
    console.log(`  [Google Search] Navigating to search...`);

    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(randomDelay(3000, 5000));

    // Wait for search results - try multiple selectors
    try {
      await page.waitForSelector('#search, #rso, .g', { timeout: 10000 });
    } catch {
      await page.waitForTimeout(3000);
    }

    let response = '';

    // Try to get Featured Snippet first
    try {
      const featuredSnippet = await page.evaluate(() => {
        // Featured snippet selectors
        const snippetSelectors = [
          '.hgKElc', // Featured snippet text
          '.IZ6rdc', // Featured snippet
          '[data-attrid="wa:/description"] .LGOjhe', // Knowledge description
          '.kno-rdesc span', // Knowledge panel description
          '.wDYxhc[data-md] span', // Another knowledge panel format
        ];

        for (const sel of snippetSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = (el as HTMLElement).innerText?.trim();
            if (text && text.length > 50) {
              return `**Featured Snippet:**\n${text}`;
            }
          }
        }
        return '';
      });
      if (featuredSnippet) {
        response = featuredSnippet;
        console.log(`  [Google Search] Found featured snippet`);
      }
    } catch { /* continue */ }

    // Get Knowledge Panel if present
    try {
      const knowledgePanel = await page.evaluate(() => {
        const kpSelectors = [
          '.kno-rdesc span',
          '[data-attrid*="description"]',
          '.wwUB2c',
        ];

        for (const sel of kpSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = (el as HTMLElement).innerText?.trim();
            if (text && text.length > 50 && !text.includes('Wikipedia')) {
              return text;
            }
          }
        }
        return '';
      });
      if (knowledgePanel && !response.includes(knowledgePanel)) {
        response += (response ? '\n\n' : '') + `**Knowledge Panel:**\n${knowledgePanel}`;
      }
    } catch { /* continue */ }

    // Get organic search results - improved extraction
    console.log(`  [Google Search] Extracting organic results...`);
    try {
      const organicResults = await page.evaluate(() => {
        const results: string[] = [];

        // Multiple approaches to find organic results
        // Approach 1: Standard .g containers within #search or #rso
        let searchResults = document.querySelectorAll('#rso .g, #search .g');

        // Approach 2: If none found, try broader selectors
        if (searchResults.length === 0) {
          searchResults = document.querySelectorAll('.g[data-hveid], div[data-sokoban-container] .g');
        }

        // Approach 3: Try MJjYud containers (newer Google layout)
        if (searchResults.length === 0) {
          searchResults = document.querySelectorAll('.MjjYud');
        }

        for (const result of Array.from(searchResults).slice(0, 8)) {
          // Skip "People also ask" boxes
          if (result.closest('[data-initq]') || result.closest('.related-question-pair')) {
            continue;
          }

          // Get title - try multiple selectors
          let title = '';
          const titleSelectors = ['h3', 'h3 span', '[role="heading"]', '.LC20lb'];
          for (const sel of titleSelectors) {
            const titleEl = result.querySelector(sel);
            if (titleEl) {
              title = (titleEl as HTMLElement).innerText?.trim() || '';
              if (title) break;
            }
          }

          // Get snippet - try multiple selectors
          let snippet = '';
          const snippetSelectors = [
            '.VwiC3b', // Standard snippet
            '[data-sncf]', // Newer format
            '.lEBKkf', // Another format
            '.yXK7lf em', // Highlighted text
            '.IsZvec', // Container format
            'div[style="-webkit-line-clamp:2"]', // Clamped text
            'span.aCOpRe', // Older format
          ];
          for (const sel of snippetSelectors) {
            const snippetEl = result.querySelector(sel);
            if (snippetEl) {
              snippet = (snippetEl as HTMLElement).innerText?.trim() || '';
              if (snippet && snippet.length > 20) break;
            }
          }

          // If still no snippet, try getting all text from the result
          if (!snippet || snippet.length < 20) {
            const allText = (result as HTMLElement).innerText || '';
            const lines = allText.split('\n').filter(l => l.trim().length > 30);
            if (lines.length > 1) {
              snippet = lines.slice(1, 3).join(' ').trim();
            }
          }

          if (title && snippet && snippet.length > 20) {
            // Avoid duplicates
            const entry = `**${title}**\n${snippet}`;
            if (!results.some(r => r.includes(title))) {
              results.push(entry);
            }
          }
        }

        return results.slice(0, 5).join('\n\n');
      });

      if (organicResults) {
        response += (response ? '\n\n' : '') + organicResults;
      }
    } catch (e) {
      console.log(`  [Google Search] Organic extraction error: ${e}`);
    }

    // Get "People Also Ask" if present (only if we don't have enough content)
    if (response.length < 200) {
      try {
        const paa = await page.evaluate(() => {
          const questions: string[] = [];
          const paaItems = document.querySelectorAll('[data-q], .related-question-pair [role="button"]');
          for (const item of Array.from(paaItems).slice(0, 3)) {
            const q = item.getAttribute('data-q') || (item as HTMLElement).innerText?.trim();
            if (q && q.length > 10 && q.length < 200) questions.push(q);
          }
          return questions.length > 0 ? `**People Also Ask:**\n- ${questions.join('\n- ')}` : '';
        });
        if (paa) {
          response += (response ? '\n\n' : '') + paa;
        }
      } catch { /* continue */ }
    }

    if (!response || response.length < 50) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No Google search results found' };
    }

    console.log(`  [Google Search] ✅ Got response (${response.length} chars)`);
    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Query Bing Search by navigating with search query
 * Extracts actual search results, not related searches or autocomplete
 */
async function queryBingSearch(page: Page, query: string, startTime: number): Promise<QueryResult> {
  try {
    // Build Bing search URL with query - force English US locale
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&cc=US`;
    console.log(`  [Bing Search] Navigating to search...`);

    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(randomDelay(3000, 5000)); // Wait for results to fully load

    // Wait for actual search results to appear
    try {
      await page.waitForSelector('.b_algo', { timeout: 10000 });
    } catch {
      console.log(`  [Bing Search] Waiting for results...`);
      await page.waitForTimeout(3000);
    }

    let response = '';

    // First try to get Copilot/AI generated answer if present
    try {
      const copilotAnswer = await page.evaluate(() => {
        // Bing Copilot conversation answer - be very specific
        const copilotSelectors = [
          '.b_sydConv .ac-textBlock',
          '[class*="OverviewAnswer"]',
          '.b_ans .b_paractl',
        ];

        for (const sel of copilotSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = (el as HTMLElement).innerText?.trim();
            if (text && text.length > 100 && !text.includes('Deep dive') && !text.includes('Related searches')) {
              return text;
            }
          }
        }
        return '';
      });
      if (copilotAnswer && copilotAnswer.length > 100) {
        response = copilotAnswer;
        console.log(`  [Bing Search] Found Copilot answer`);
      }
    } catch { /* continue */ }

    // If no Copilot answer, get organic search results
    if (!response || response.length < 100) {
      console.log(`  [Bing Search] Extracting organic results...`);
      try {
        response = await page.evaluate(() => {
          const results: string[] = [];

          // Get organic search results - the actual snippets
          const algos = document.querySelectorAll('.b_algo');
          for (const algo of Array.from(algos).slice(0, 5)) {
            // Get the title
            const titleEl = algo.querySelector('h2 a');
            const title = titleEl ? (titleEl as HTMLElement).innerText?.trim() : '';

            // Get the snippet - look for the actual description paragraph
            let snippet = '';
            const captionP = algo.querySelector('.b_caption p');
            if (captionP) {
              snippet = (captionP as HTMLElement).innerText?.trim() || '';
            }

            // Skip if it looks like related searches or autocomplete
            if (!snippet || snippet.length < 30) continue;
            if (snippet.startsWith('Deep dive')) continue;
            if (snippet.match(/^[a-z\s]+$/i) && snippet.split('\n').length > 3) continue;

            if (title && snippet) {
              results.push(`**${title}**\n${snippet}`);
            }
          }

          return results.join('\n\n');
        });
      } catch { /* continue */ }
    }

    // Final cleanup
    if (response) {
      const lines = response.split('\n');
      const cleanedLines = lines.filter(line => {
        const l = line.trim();
        if (!l) return false;
        if (l.startsWith('Deep dive')) return false;
        if (l === 'Related searches') return false;
        // Filter out autocomplete-style suggestions (short lowercase phrases)
        if (l.match(/^[a-z\s]{5,30}$/) && !l.includes('.')) return false;
        return true;
      });
      response = cleanedLines.join('\n').trim();
    }

    if (!response || response.length < 50) {
      return { success: false, responseTimeMs: Date.now() - startTime, error: 'No Bing search results found' };
    }

    console.log(`  [Bing Search] ✅ Got response (${response.length} chars)`);
    return { success: true, responseText: response, responseTimeMs: Date.now() - startTime };
  } catch (error) {
    return {
      success: false,
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function dismissModals(page: Page, surfaceId: string): Promise<void> {
  const modalDismissers = [
    'button:has-text("Not now")',
    'button:has-text("No thanks")',
    'button:has-text("Maybe later")',
    'button:has-text("Skip")',
    'button:has-text("Close")',
    'button[aria-label="Close"]',
    '[aria-label="Dismiss"]',
  ];

  for (const sel of modalDismissers) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    } catch { /* ignore */ }
  }
}

async function abortStuckGeneration(page: Page, surfaceId: string): Promise<void> {
  const stopSelectors: Record<string, string[]> = {
    'chatgpt-web': ['button[aria-label="Stop generating"]', 'button:has-text("Stop")'],
    'claude-web': ['button[aria-label="Stop"]', 'button:has-text("Stop")'],
  };

  const selectors = stopSelectors[surfaceId] || [];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click();
        await page.waitForTimeout(1000);
      }
    } catch { /* ignore */ }
  }
}


// ============================================================================
// Study Runner - Parallel Surface Execution
// ============================================================================

async function runSurfaceQueries(
  surfaceId: string,
  surfaceName: string,
  queries: { text: string; category: string; index: number }[],
  manifest: Manifest,
  batchSize: number = 1 // How many queries to run in parallel per surface
): Promise<Job[]> {
  const jobs: Job[] = queries.map(q => ({
    id: randomUUID(),
    queryText: q.text,
    queryIndex: q.index,
    category: q.category,
    surfaceId,
    surfaceName,
    locationId: manifest.locations[0]?.id || 'default',
    status: 'pending' as const,
    attempts: 0,
    maxAttempts: manifest.completionCriteria.maxRetriesPerCell,
  }));

  console.log(`\n🌐 ${surfaceName} - Starting (${jobs.length} queries, batch size: ${batchSize})`);

  // Process queries in batches
  for (let batchStart = 0; batchStart < jobs.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, jobs.length);
    const batch = jobs.slice(batchStart, batchEnd);

    console.log(`  [${surfaceName}] Batch ${Math.floor(batchStart / batchSize) + 1}: queries ${batchStart + 1}-${batchEnd}`);

    // Run batch in parallel
    const batchPromises = batch.map(async (job, idx) => {
      console.log(`  [${surfaceName}] [${batchStart + idx + 1}/${jobs.length}] "${job.queryText.slice(0, 35)}..."`);

      job.status = 'executing';
      job.attempts++;

      const result = await querySurfaceViaCDP(job.surfaceId, job.queryText);

      if (result.success && result.responseText) {
        if (manifest.qualityGates.minResponseLength &&
            result.responseText.length < manifest.qualityGates.minResponseLength) {
          job.status = 'failed';
          job.error = `Response too short (${result.responseText.length} chars)`;
          console.log(`  [${surfaceName}] ❌ Failed: ${job.error}`);
        } else {
          job.status = 'complete';
          job.result = { responseText: result.responseText, responseTimeMs: result.responseTimeMs };
          console.log(`  [${surfaceName}] ✅ Complete (${(result.responseTimeMs / 1000).toFixed(1)}s) - ${result.responseText.slice(0, 50)}...`);
        }
      } else {
        job.status = 'failed';
        job.error = result.error;
        console.log(`  [${surfaceName}] ❌ Failed: ${result.error}`);
      }
    });

    await Promise.all(batchPromises);

    // Delay between batches (human-like)
    if (batchEnd < jobs.length) {
      const betweenDelay = randomDelay(2000, 5000);
      console.log(`  [${surfaceName}] ⏳ Batch delay (${(betweenDelay / 1000).toFixed(1)}s)`);
      await new Promise(r => setTimeout(r, betweenDelay));
    }
  }

  console.log(`\n🏁 ${surfaceName} - Complete (${jobs.filter(j => j.status === 'complete').length}/${jobs.length} succeeded)`);
  return jobs;
}

async function runStudy(manifest: Manifest): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${manifest.name}`);
  console.log(`  Candidate: ${manifest.candidate?.name || 'N/A'}`);
  console.log(`  MODE: PARALLEL SURFACE EXECUTION`);
  console.log(`${'='.repeat(70)}\n`);

  const queries = manifest.queries.map((q, i) => ({ text: q.text, category: q.category, index: i }));
  const activeSurfaces = manifest.surfaces.filter(s => !s.skip);

  console.log(`📋 Total jobs: ${queries.length * activeSurfaces.length}`);
  console.log(`   Queries: ${queries.length}`);
  console.log(`   Surfaces (parallel): ${activeSurfaces.map(s => s.name || s.id).join(', ')}`);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`🚀 Launching all surfaces in parallel...`);
  console.log(`${'─'.repeat(70)}\n`);

  // Run all surfaces in parallel with sequential queries per surface
  const BATCH_SIZE = 1; // Run queries sequentially to avoid CDP overload
  console.log(`   Batch size per surface: ${BATCH_SIZE}`);

  const surfacePromises = activeSurfaces.map(surface =>
    runSurfaceQueries(surface.id, surface.name || surface.id, queries, manifest, BATCH_SIZE)
  );

  const allJobArrays = await Promise.all(surfacePromises);
  const jobs = allJobArrays.flat();

  // Results summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  STUDY RESULTS`);
  console.log(`${'='.repeat(70)}\n`);

  const results = {
    studyId: randomUUID(),
    studyName: manifest.name,
    candidate: manifest.candidate,
    timestamp: new Date().toISOString(),
    summary: {
      totalJobs: jobs.length,
      completedJobs: jobs.filter(j => j.status === 'complete').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
    },
    bySurface: {} as Record<string, { total: number; complete: number; failed: number; responses: any[] }>,
    byCategory: {} as Record<string, { total: number; complete: number; avgResponseLength: number }>,
    jobs: jobs.map(j => ({
      id: j.id,
      queryIndex: j.queryIndex,
      queryText: j.queryText,
      category: j.category,
      surfaceId: j.surfaceId,
      surfaceName: j.surfaceName,
      status: j.status,
      attempts: j.attempts,
      responseText: j.result?.responseText,
      responseTimeMs: j.result?.responseTimeMs,
      error: j.error,
    })),
  };

  // Calculate by surface
  for (const surface of manifest.surfaces) {
    const surfaceJobs = jobs.filter(j => j.surfaceId === surface.id);
    const completedJobs = surfaceJobs.filter(j => j.status === 'complete');
    results.bySurface[surface.id] = {
      total: surfaceJobs.length,
      complete: completedJobs.length,
      failed: surfaceJobs.filter(j => j.status === 'failed').length,
      responses: completedJobs.map(j => ({
        query: j.queryText,
        category: j.category,
        response: j.result?.responseText,
        responseTimeMs: j.result?.responseTimeMs,
      })),
    };
  }

  // Calculate by category
  const categories = [...new Set(manifest.queries.map(q => q.category))];
  for (const cat of categories) {
    const catJobs = jobs.filter(j => j.category === cat);
    const completedCatJobs = catJobs.filter(j => j.status === 'complete');
    const avgLen = completedCatJobs.length > 0
      ? completedCatJobs.reduce((sum, j) => sum + (j.result?.responseText?.length || 0), 0) / completedCatJobs.length
      : 0;
    results.byCategory[cat] = {
      total: catJobs.length,
      complete: completedCatJobs.length,
      avgResponseLength: Math.round(avgLen),
    };
  }

  // Print summary
  console.log(`Study: ${results.studyName}`);
  console.log(`Candidate: ${results.candidate?.name}`);
  console.log(`\nSummary:`);
  console.log(`  Total Jobs: ${results.summary.totalJobs}`);
  console.log(`  Completed: ${results.summary.completedJobs}`);
  console.log(`  Failed: ${results.summary.failedJobs}`);

  console.log(`\nBy Surface:`);
  for (const [surfaceId, stats] of Object.entries(results.bySurface)) {
    const pct = stats.total > 0 ? (stats.complete / stats.total * 100).toFixed(0) : 0;
    console.log(`  ${surfaceId}: ${stats.complete}/${stats.total} (${pct}%)`);
  }

  console.log(`\nBy Category:`);
  for (const [cat, stats] of Object.entries(results.byCategory)) {
    console.log(`  ${cat}: ${stats.complete}/${stats.total} complete, avg ${stats.avgResponseLength} chars`);
  }

  // Save results
  const outputPath = path.join(path.dirname(process.argv[2]), path.basename(process.argv[2], '.json') + '-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Results saved to: ${outputPath}`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const manifestPath = process.argv[2];

  if (!manifestPath) {
    console.error('Usage: npx tsx scripts/run-kyanos-study.ts <manifest.json>');
    process.exit(1);
  }

  const absolutePath = path.resolve(manifestPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Manifest not found: ${absolutePath}`);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));

  console.log('\n' + '='.repeat(70));
  console.log('  BENTHAM STUDY PIPELINE - KYANOS VOTER IMPACT');
  console.log('='.repeat(70));

  await runStudy(manifest);
}

main().catch(console.error);
