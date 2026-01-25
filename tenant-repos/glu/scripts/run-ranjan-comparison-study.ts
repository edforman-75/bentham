#!/usr/bin/env npx tsx
/**
 * Run Ranjan Web Search API Comparison Study
 *
 * Four-way comparison of OpenAI surfaces for India localization:
 *   1. OpenAI Standard API (no location) - baseline
 *   2. OpenAI Standard API + India System Prompt - prompt injection
 *   3. OpenAI Web Search API + user_location - Ranjan's approach
 *   4. ChatGPT Web + India IP - what consumers see
 *
 * Purpose: Determine which approach achieves best India localization for brand monitoring.
 *
 * PROVENANCE TRACKING: This script captures exactly what was submitted to each surface
 * and from which IP address, generating a full audit report.
 */

import 'dotenv/config';
import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { exec } from 'child_process';

// =============================================================================
// NOTIFICATION SYSTEM
// =============================================================================

function notify(message: string, urgent: boolean = false) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = urgent ? '🚨🚨🚨' : '⚠️';

  // Console notification with bell
  console.log(`\n${prefix} [${timestamp}] ${message}`);
  if (urgent) {
    // Ring terminal bell multiple times for urgent notifications
    process.stdout.write('\x07\x07\x07');
  } else {
    process.stdout.write('\x07');
  }

  // macOS notification (non-blocking)
  if (process.platform === 'darwin') {
    const title = urgent ? 'BENTHAM ALERT' : 'Bentham Status';
    exec(`osascript -e 'display notification "${message}" with title "${title}" sound name "Ping"'`);
  }
}

function notifyStuck(surface: string, queryIndex: number, elapsedMs: number) {
  const elapsedMin = Math.round(elapsedMs / 1000 / 60);
  notify(`STUCK! ${surface} query #${queryIndex + 1} taking ${elapsedMin}+ minutes`, true);
}

// =============================================================================
// RANJAN DATA LOADER
// =============================================================================

interface RanjanResult {
  prompt: string;
  response: string;
  sources: string;
}

function loadRanjanData(): RanjanResult[] {
  const csvPath = '/Users/edf/Downloads/huft_api_response_22_Jan_2026 - huft_web_search_api_20.csv';

  if (!existsSync(csvPath)) {
    console.warn(`⚠️ Ranjan's CSV not found at: ${csvPath}`);
    return [];
  }

  try {
    const csvContent = readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    });

    return records.map((row: Record<string, string>) => ({
      prompt: row['Prompt'] || '',
      response: row['response'] || '',
      sources: row['sources'] || '',
    }));
  } catch (error) {
    console.warn(`⚠️ Failed to load Ranjan's CSV: ${error}`);
    return [];
  }
}

// =============================================================================
// INDIA LOCALIZATION METRICS
// =============================================================================

interface LocalizationMetrics {
  inrPriceCount: number;
  indianRetailerCount: number;
  indianBrandCount: number;
  huftMentions: number;
  hasStructuredTable: boolean;
  responseLength: number;
}

const INDIAN_RETAILERS = [
  'amazon.in', 'flipkart', 'bigbasket', 'supertails', 'heads up for tails',
  'huft', 'petsworld', 'pawrulz', 'blinkit', 'zepto', 'swiggy instamart'
];

const INDIAN_BRANDS = [
  'drools', 'himalaya', 'huft', 'heads up for tails', 'pedigree india',
  'royal canin india', 'farmina', 'canine creek', 'meat up', 'chip chops'
];

function analyzeLocalization(text: string): LocalizationMetrics {
  const lowerText = text.toLowerCase();

  return {
    inrPriceCount: (text.match(/₹|rs\.?|inr/gi) || []).length,
    indianRetailerCount: INDIAN_RETAILERS.filter(r => lowerText.includes(r.toLowerCase())).length,
    indianBrandCount: INDIAN_BRANDS.filter(b => lowerText.includes(b.toLowerCase())).length,
    huftMentions: (lowerText.match(/huft|heads up for tails/gi) || []).length,
    hasStructuredTable: text.includes('|') || text.includes('₹') && text.includes('\n'),
    responseLength: text.length,
  };
}

// =============================================================================
// INDIA LOCALIZATION CONFIGURATION
// =============================================================================

// System prompt for prompt injection approach
const INDIA_SYSTEM_PROMPT = `You are a helpful shopping assistant answering questions for customers in India.

When recommending products:
- Provide prices in Indian Rupees (₹)
- Recommend products available from Indian retailers (Amazon.in, Flipkart, BigBasket, Supertails, Heads Up For Tails, etc.)
- Include Indian brands when relevant (Drools, Himalaya, HUFT, etc.)
- Consider availability in the Indian market
- Format product recommendations with clear pricing and where to buy

Be specific and helpful with product recommendations that Indian consumers can actually purchase.`;

// user_location parameter for Web Search API (matches Ranjan's configuration)
const INDIA_USER_LOCATION = {
  type: "approximate",
  approximate: {
    country: "IN",
    region: "Maharashtra",
    city: "Mumbai",
    timezone: "Asia/Kolkata"
  }
};

// =============================================================================
// CONFIGURATION
// =============================================================================

// 2Captcha Proxy Configuration for India (Mumbai, Maharashtra)
const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY;
if (!TWOCAPTCHA_API_KEY) {
  console.error('❌ TWOCAPTCHA_API_KEY environment variable is not set');
  console.error('   Set it with: export TWOCAPTCHA_API_KEY=your_key_here');
  process.exit(1);
}

// OpenAI API key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is not set');
  console.error('   Set it with: export OPENAI_API_KEY=sk-your-key-here');
  process.exit(1);
}

// 2Captcha Proxy Configuration for India (Mumbai, Maharashtra)
// Format from working run-huft-100-india-study.ts
const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: `${TWOCAPTCHA_API_KEY}-zone-custom-region-in-st-maharashtra-city-mumbai`,
  password: TWOCAPTCHA_API_KEY,
};

// Resume from query index (0-based). Set to 0 to start fresh.
const RESUME_FROM_QUERY = 0;

// Load study manifest
const manifest = JSON.parse(readFileSync('studies/ranjan-web-search-api-comparison.json', 'utf-8'));
const QUERIES = manifest.queries.map((q: { text: string }) => q.text);

const CHATGPT_SELECTORS = {
  input: ['#prompt-textarea', '[contenteditable="true"]'],
  submit: ['button[data-testid="send-button"]', 'button[data-testid="composer-send-button"]'],
  response: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
};

// =============================================================================
// TYPES
// =============================================================================

interface IPInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  org: string;
  timezone: string;
}

interface RequestPayload {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

interface SurfaceManifest {
  surfaceId: string;
  surfaceName: string;
  description: string;
  ipSource: {
    type: 'direct' | 'proxy';
    location: string;
    ip: string;
    proxyProvider?: string;
    proxyConfig?: string;
  };
  localizationMethod: string;
  requestTemplate: RequestPayload;
  parameters: Record<string, unknown>;
}

interface QueryResult {
  query: string;
  queryIndex: number;
  surface: string;
  success: boolean;
  response?: string;
  sources?: string[];
  error?: string;
  timestamp: string;
  responseTimeMs: number;
  // Provenance fields
  requestPayload?: RequestPayload;
  ipUsed?: string;
}

// =============================================================================
// IP DETECTION
// =============================================================================

async function getDirectIP(): Promise<IPInfo> {
  try {
    const response = await fetch('https://ipinfo.io/json');
    return await response.json();
  } catch {
    return {
      ip: 'unknown',
      city: 'unknown',
      region: 'unknown',
      country: 'unknown',
      org: 'unknown',
      timezone: 'unknown',
    };
  }
}

// =============================================================================
// SURFACE MANIFESTS
// =============================================================================

function generateSurfaceManifests(directIP: IPInfo, proxyIP: IPInfo): SurfaceManifest[] {
  return [
    {
      surfaceId: 'openai-api-baseline',
      surfaceName: 'OpenAI Standard API (Baseline)',
      description: 'Standard OpenAI Chat Completions API with no location context. This is the control group showing default global behavior.',
      ipSource: {
        type: 'direct',
        location: `${directIP.city}, ${directIP.region}, ${directIP.country}`,
        ip: directIP.ip,
      },
      localizationMethod: 'None - pure foundation model response',
      requestTemplate: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${OPENAI_API_KEY}',
        },
        body: {
          model: 'gpt-4o',
          messages: [
            { role: 'user', content: '${QUERY}' }
          ],
          max_tokens: 2000,
        },
      },
      parameters: {
        model: 'gpt-4o',
        systemPrompt: null,
        userLocation: null,
      },
    },
    {
      surfaceId: 'openai-api-india-prompt',
      surfaceName: 'OpenAI Standard API + India System Prompt',
      description: 'Standard OpenAI Chat Completions API with system prompt injection to bias responses toward India market.',
      ipSource: {
        type: 'direct',
        location: `${directIP.city}, ${directIP.region}, ${directIP.country}`,
        ip: directIP.ip,
      },
      localizationMethod: 'System prompt injection - instructs model to respond for India customers',
      requestTemplate: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${OPENAI_API_KEY}',
        },
        body: {
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: '${INDIA_SYSTEM_PROMPT}' },
            { role: 'user', content: '${QUERY}' }
          ],
          max_tokens: 2000,
        },
      },
      parameters: {
        model: 'gpt-4o',
        systemPrompt: INDIA_SYSTEM_PROMPT,
        userLocation: null,
      },
    },
    {
      surfaceId: 'openai-web-search-api',
      surfaceName: 'OpenAI Web Search API + user_location',
      description: 'OpenAI Responses API with web_search tool and user_location parameter set to India. This is the approach Ranjan used.',
      ipSource: {
        type: 'direct',
        location: `${directIP.city}, ${directIP.region}, ${directIP.country}`,
        ip: directIP.ip,
      },
      localizationMethod: 'user_location parameter - tells OpenAI to bias web search results for India',
      requestTemplate: {
        endpoint: 'https://api.openai.com/v1/responses',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${OPENAI_API_KEY}',
        },
        body: {
          model: 'gpt-4o',
          tools: [{ type: 'web_search' }],
          input: '${QUERY}',
          user_location: INDIA_USER_LOCATION,
        },
      },
      parameters: {
        model: 'gpt-4o',
        systemPrompt: null,
        userLocation: INDIA_USER_LOCATION,
        webSearchEnabled: true,
      },
    },
    {
      surfaceId: 'chatgpt-web-india-ip',
      surfaceName: 'ChatGPT Web Interface + India IP',
      description: 'ChatGPT.com accessed via India residential proxy. This captures what actual Indian consumers see.',
      ipSource: {
        type: 'proxy',
        location: `${proxyIP.city}, ${proxyIP.region}, ${proxyIP.country}`,
        ip: proxyIP.ip,
        proxyProvider: '2Captcha Residential',
        proxyConfig: 'zone-custom-region-in-st-maharashtra-city-mumbai',
      },
      localizationMethod: 'IP-based geolocation - ChatGPT.com detects India IP and localizes accordingly',
      requestTemplate: {
        endpoint: 'https://chatgpt.com',
        method: 'Browser automation (Playwright)',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept-Language': 'en-IN',
        },
        body: {
          input: '${QUERY}',
          submittedVia: 'DOM input field + submit button',
        },
      },
      parameters: {
        browserLocale: 'en-IN',
        browserTimezone: 'Asia/Kolkata',
        proxyServer: PROXY_CONFIG.server,
        systemPrompt: null,
        userLocation: null,
      },
    },
  ];
}

// =============================================================================
// SURFACE 1: OPENAI STANDARD API (NO LOCATION - BASELINE)
// =============================================================================

async function queryOpenAIAPIBaseline(query: string, queryIndex: number, directIP: string): Promise<QueryResult> {
  const startTime = Date.now();

  const requestPayload: RequestPayload = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-***[REDACTED]***',
    },
    body: {
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: query }
      ],
      max_tokens: 2000,
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: query }
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        query,
        queryIndex,
        surface: 'openai-api-baseline',
        success: false,
        error: `API error: ${response.status} - ${error}`,
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
        requestPayload,
        ipUsed: directIP,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return {
      query,
      queryIndex,
      surface: 'openai-api-baseline',
      success: true,
      response: content,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: directIP,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'openai-api-baseline',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: directIP,
    };
  }
}

// =============================================================================
// SURFACE 2: OPENAI STANDARD API + INDIA SYSTEM PROMPT
// =============================================================================

async function queryOpenAIAPIWithIndiaPrompt(query: string, queryIndex: number, directIP: string): Promise<QueryResult> {
  const startTime = Date.now();

  const requestPayload: RequestPayload = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-***[REDACTED]***',
    },
    body: {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: INDIA_SYSTEM_PROMPT },
        { role: 'user', content: query }
      ],
      max_tokens: 2000,
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: INDIA_SYSTEM_PROMPT },
          { role: 'user', content: query }
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        query,
        queryIndex,
        surface: 'openai-api-india-prompt',
        success: false,
        error: `API error: ${response.status} - ${error}`,
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
        requestPayload,
        ipUsed: directIP,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return {
      query,
      queryIndex,
      surface: 'openai-api-india-prompt',
      success: true,
      response: content,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: directIP,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'openai-api-india-prompt',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: directIP,
    };
  }
}

// =============================================================================
// SURFACE 3: OPENAI WEB SEARCH API + USER_LOCATION (RANJAN'S APPROACH)
// =============================================================================

async function queryOpenAIWebSearchAPI(query: string, queryIndex: number, directIP: string): Promise<QueryResult> {
  const startTime = Date.now();

  const requestPayload: RequestPayload = {
    endpoint: 'https://api.openai.com/v1/responses',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-***[REDACTED]***',
    },
    body: {
      model: 'gpt-4o',
      tools: [{ type: 'web_search' }],
      input: query,
      user_location: INDIA_USER_LOCATION,
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search' }],
        input: query,
        user_location: INDIA_USER_LOCATION,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // If Responses API not available, try fallback
      if (response.status === 404) {
        return queryOpenAIWebSearchAPIFallback(query, queryIndex, startTime, directIP);
      }

      return {
        query,
        queryIndex,
        surface: 'openai-web-search-api',
        success: false,
        error: `API error: ${response.status} - ${errorText}`,
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
        requestPayload,
        ipUsed: directIP,
      };
    }

    const data = await response.json();

    let responseText = '';
    const sources: string[] = [];

    if (data.output) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text') {
              responseText = content.text;
            }
          }
        }
        if (item.type === 'web_search_call' && item.results) {
          for (const result of item.results) {
            if (result.url) {
              sources.push(result.url);
            }
          }
        }
      }
    }

    return {
      query,
      queryIndex,
      surface: 'openai-web-search-api',
      success: true,
      response: responseText || JSON.stringify(data),
      sources,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: directIP,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'openai-web-search-api',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: directIP,
    };
  }
}

async function queryOpenAIWebSearchAPIFallback(query: string, queryIndex: number, startTime: number, directIP: string): Promise<QueryResult> {
  const requestPayload: RequestPayload = {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-***[REDACTED]***',
    },
    body: {
      model: 'gpt-4o-search-preview',
      messages: [
        { role: 'user', content: query }
      ],
      max_tokens: 2000,
      web_search_options: {
        user_location: INDIA_USER_LOCATION,
      },
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-search-preview',
        messages: [
          { role: 'user', content: query }
        ],
        max_tokens: 2000,
        web_search_options: {
          user_location: INDIA_USER_LOCATION,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        query,
        queryIndex,
        surface: 'openai-web-search-api',
        success: false,
        error: `Fallback API error: ${response.status} - ${error}`,
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
        requestPayload,
        ipUsed: directIP,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    const sources: string[] = [];
    const urlRegex = /https?:\/\/[^\s\)]+/g;
    const urls = content?.match(urlRegex) || [];
    sources.push(...urls);

    return {
      query,
      queryIndex,
      surface: 'openai-web-search-api',
      success: true,
      response: content,
      sources,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: directIP,
    };
  } catch (error) {
    return {
      query,
      queryIndex,
      surface: 'openai-web-search-api',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: directIP,
    };
  }
}

// =============================================================================
// SURFACE 4: CHATGPT WEB (WITH INDIA IP VIA PROXY)
// =============================================================================

async function queryChatGPTWeb(query: string, queryIndex: number, page: Page, proxyIP: string): Promise<QueryResult> {
  const startTime = Date.now();
  const STUCK_THRESHOLD_MS = 120000; // 2 minutes = stuck

  // Set up stuck detection
  const stuckTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    if (elapsed > STUCK_THRESHOLD_MS) {
      notifyStuck('ChatGPT Web', queryIndex, elapsed);
    }
  }, 60000); // Check every minute

  const requestPayload: RequestPayload = {
    endpoint: 'https://chatgpt.com',
    method: 'Browser automation (Playwright)',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'en-IN',
    },
    body: {
      input: query,
      submittedVia: 'DOM input field (#prompt-textarea) + submit button',
      browserLocale: 'en-IN',
      browserTimezone: 'Asia/Kolkata',
    },
  };

  try {
    await page.bringToFront();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    let initialCount = 0;
    for (const sel of CHATGPT_SELECTORS.response) {
      initialCount = await page.locator(sel).count();
      if (initialCount > 0) break;
    }

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
            await page.keyboard.type(query, { delay: 10 });
          }
          inputFound = true;
          break;
        }
      } catch { continue; }
    }

    if (!inputFound) {
      clearInterval(stuckTimer);
      return {
        query,
        queryIndex,
        surface: 'chatgpt-web-india-ip',
        success: false,
        error: 'Input field not found',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
        requestPayload,
        ipUsed: proxyIP,
      };
    }

    await page.waitForTimeout(300);

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

    await page.waitForTimeout(3000);

    let response = '';
    const maxWait = 90000;
    const waitStart = Date.now();

    for (const sel of CHATGPT_SELECTORS.response) {
      while (Date.now() - waitStart < maxWait) {
        const currentCount = await page.locator(sel).count();
        if (currentCount > initialCount || initialCount === 0) {
          await page.waitForTimeout(8000);
          break;
        }
        await page.waitForTimeout(1000);
      }

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

    if (!response) {
      clearInterval(stuckTimer);
      return {
        query,
        queryIndex,
        surface: 'chatgpt-web-india-ip',
        success: false,
        error: 'No response found',
        timestamp: new Date().toISOString(),
        responseTimeMs: Date.now() - startTime,
        requestPayload,
        ipUsed: proxyIP,
      };
    }

    clearInterval(stuckTimer);
    return {
      query,
      queryIndex,
      surface: 'chatgpt-web-india-ip',
      success: true,
      response,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: proxyIP,
    };
  } catch (error) {
    clearInterval(stuckTimer);
    return {
      query,
      queryIndex,
      surface: 'chatgpt-web-india-ip',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      requestPayload,
      ipUsed: proxyIP,
    };
  }
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

function generateProvenanceReport(
  surfaceManifests: SurfaceManifest[],
  results: QueryResult[],
  studyMetadata: Record<string, unknown>,
  ranjanData: RanjanResult[]
): string {
  const lines: string[] = [];

  lines.push('═'.repeat(80));
  lines.push('  STUDY PROVENANCE REPORT');
  lines.push('  What Was Submitted to Each Surface and From Which IP');
  lines.push('═'.repeat(80));
  lines.push('');
  lines.push(`Study: ${studyMetadata.studyName}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total Queries: ${studyMetadata.totalQueries}`);
  lines.push(`Total Requests: ${results.length}`);
  lines.push('');

  for (const manifest of surfaceManifests) {
    lines.push('─'.repeat(80));
    lines.push(`SURFACE: ${manifest.surfaceName}`);
    lines.push('─'.repeat(80));
    lines.push('');
    lines.push(`Surface ID:          ${manifest.surfaceId}`);
    lines.push(`Description:         ${manifest.description}`);
    lines.push('');
    lines.push('IP SOURCE:');
    lines.push(`  Type:              ${manifest.ipSource.type}`);
    lines.push(`  Location:          ${manifest.ipSource.location}`);
    lines.push(`  IP Address:        ${manifest.ipSource.ip}`);
    if (manifest.ipSource.proxyProvider) {
      lines.push(`  Proxy Provider:    ${manifest.ipSource.proxyProvider}`);
      lines.push(`  Proxy Config:      ${manifest.ipSource.proxyConfig}`);
    }
    lines.push('');
    lines.push('LOCALIZATION METHOD:');
    lines.push(`  ${manifest.localizationMethod}`);
    lines.push('');
    lines.push('REQUEST TEMPLATE:');
    lines.push(`  Endpoint:          ${manifest.requestTemplate.endpoint}`);
    lines.push(`  Method:            ${manifest.requestTemplate.method}`);
    lines.push('  Headers:');
    for (const [key, value] of Object.entries(manifest.requestTemplate.headers)) {
      lines.push(`    ${key}: ${value}`);
    }
    lines.push('  Body:');
    lines.push(JSON.stringify(manifest.requestTemplate.body, null, 4).split('\n').map(l => '    ' + l).join('\n'));
    lines.push('');
    lines.push('PARAMETERS:');
    for (const [key, value] of Object.entries(manifest.parameters)) {
      if (value === null) {
        lines.push(`  ${key}: null (not used)`);
      } else if (typeof value === 'object') {
        lines.push(`  ${key}:`);
        lines.push(JSON.stringify(value, null, 4).split('\n').map(l => '    ' + l).join('\n'));
      } else {
        lines.push(`  ${key}: ${value}`);
      }
    }
    lines.push('');

    // Results summary for this surface
    const surfaceResults = results.filter(r => r.surface === manifest.surfaceId);
    const successCount = surfaceResults.filter(r => r.success).length;
    lines.push(`RESULTS: ${successCount}/${surfaceResults.length} successful`);
    lines.push('');
  }

  lines.push('═'.repeat(80));
  lines.push('  COMPARISON MATRIX');
  lines.push('═'.repeat(80));
  lines.push('');
  lines.push('| Surface                    | IP Location      | Localization Method          |');
  lines.push('|----------------------------|------------------|------------------------------|');
  for (const manifest of surfaceManifests) {
    const name = manifest.surfaceName.slice(0, 26).padEnd(26);
    const loc = manifest.ipSource.location.slice(0, 16).padEnd(16);
    const method = manifest.localizationMethod.slice(0, 28).padEnd(28);
    lines.push(`| ${name} | ${loc} | ${method} |`);
  }
  lines.push('');

  // ==========================================================================
  // LOCALIZATION METRICS COMPARISON (vs Ranjan's Web Search API)
  // ==========================================================================
  lines.push('═'.repeat(80));
  lines.push('  LOCALIZATION METRICS COMPARISON');
  lines.push('  Comparing Bentham Results vs Ranjan\'s Web Search API Results');
  lines.push('═'.repeat(80));
  lines.push('');

  if (ranjanData.length > 0) {
    // Analyze Ranjan's data
    const ranjanMetrics = ranjanData.map(r => analyzeLocalization(r.response));
    const ranjanTotals = {
      inrPriceCount: ranjanMetrics.reduce((sum, m) => sum + m.inrPriceCount, 0),
      indianRetailerCount: ranjanMetrics.reduce((sum, m) => sum + m.indianRetailerCount, 0),
      indianBrandCount: ranjanMetrics.reduce((sum, m) => sum + m.indianBrandCount, 0),
      huftMentions: ranjanMetrics.reduce((sum, m) => sum + m.huftMentions, 0),
    };

    lines.push('RANJAN\'S WEB SEARCH API RESULTS (from CSV):');
    lines.push(`  ₹ Price mentions:      ${ranjanTotals.inrPriceCount}`);
    lines.push(`  Indian retailers:      ${ranjanTotals.indianRetailerCount}`);
    lines.push(`  Indian brands:         ${ranjanTotals.indianBrandCount}`);
    lines.push(`  HUFT mentions:         ${ranjanTotals.huftMentions}`);
    lines.push('');

    // Analyze each surface from our study
    for (const manifest of surfaceManifests) {
      const surfaceResults = results.filter(r => r.surface === manifest.surfaceId && r.success);
      if (surfaceResults.length === 0) continue;

      const metrics = surfaceResults.map(r => analyzeLocalization(r.response || ''));
      const totals = {
        inrPriceCount: metrics.reduce((sum, m) => sum + m.inrPriceCount, 0),
        indianRetailerCount: metrics.reduce((sum, m) => sum + m.indianRetailerCount, 0),
        indianBrandCount: metrics.reduce((sum, m) => sum + m.indianBrandCount, 0),
        huftMentions: metrics.reduce((sum, m) => sum + m.huftMentions, 0),
      };

      lines.push(`${manifest.surfaceName.toUpperCase()}:`);
      lines.push(`  ₹ Price mentions:      ${totals.inrPriceCount} (${ranjanTotals.inrPriceCount > 0 ? Math.round(totals.inrPriceCount / ranjanTotals.inrPriceCount * 100) : 0}% of Ranjan)`);
      lines.push(`  Indian retailers:      ${totals.indianRetailerCount} (${ranjanTotals.indianRetailerCount > 0 ? Math.round(totals.indianRetailerCount / ranjanTotals.indianRetailerCount * 100) : 0}% of Ranjan)`);
      lines.push(`  Indian brands:         ${totals.indianBrandCount} (${ranjanTotals.indianBrandCount > 0 ? Math.round(totals.indianBrandCount / ranjanTotals.indianBrandCount * 100) : 0}% of Ranjan)`);
      lines.push(`  HUFT mentions:         ${totals.huftMentions} (${ranjanTotals.huftMentions > 0 ? Math.round(totals.huftMentions / ranjanTotals.huftMentions * 100) : 0}% of Ranjan)`);
      lines.push('');
    }
  } else {
    lines.push('⚠️  Ranjan\'s CSV data not available for comparison');
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log('═'.repeat(70));
  console.log('  Ranjan Web Search API Comparison Study');
  console.log('  FOUR-WAY SURFACE COMPARISON WITH PROVENANCE TRACKING');
  console.log('═'.repeat(70));
  console.log('\nSurfaces:');
  console.log('  1. OpenAI API Baseline (no location) - control');
  console.log('  2. OpenAI API + India System Prompt - prompt injection');
  console.log('  3. OpenAI Web Search API + user_location - Ranjan\'s approach');
  console.log('  4. ChatGPT Web + India IP (via CDP) - what consumers see');
  console.log('═'.repeat(70));
  console.log(`\nTotal queries: ${QUERIES.length}`);
  console.log(`Total jobs: ${QUERIES.length * 4} (4 surfaces × ${QUERIES.length} queries)`);
  if (RESUME_FROM_QUERY > 0) {
    console.log(`Resuming from query: ${RESUME_FROM_QUERY + 1}`);
  }
  console.log('');

  // Get direct IP (for API calls)
  console.log('Detecting direct IP address (for API calls)...');
  const directIPInfo = await getDirectIP();
  console.log(`✅ Direct IP: ${directIPInfo.ip} (${directIPInfo.city}, ${directIPInfo.region}, ${directIPInfo.country})`);

  // Connect to Chrome via CDP (user's browser with India proxy extension)
  console.log('\nConnecting to Chrome via CDP (port 9222)...');
  console.log('   Using your browser with ZeroOmega India proxy');

  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
  } catch (error) {
    console.error('\n❌ Could not connect to Chrome.');
    console.error('   Make sure Chrome is running with: --remote-debugging-port=9222');
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('❌ No browser contexts found');
    await browser.close();
    process.exit(1);
  }
  const context = contexts[0];
  console.log('✅ Connected to Chrome via CDP');

  // Get the proxy IP from user's browser (should be India via ZeroOmega)
  console.log('\nVerifying India proxy IP via your browser...');
  const testPage = await context.newPage();
  let proxyIPInfo: IPInfo = {
    ip: 'unknown',
    city: 'Mumbai',
    region: 'Maharashtra',
    country: 'IN',
    org: '2Captcha',
    timezone: 'Asia/Kolkata',
  };
  try {
    await testPage.goto('https://ipinfo.io/json', { timeout: 30000 });
    await testPage.waitForTimeout(2000);
    const bodyText = await testPage.evaluate(() => document.body.innerText);
    proxyIPInfo = JSON.parse(bodyText);
    console.log(`✅ Proxy IP: ${proxyIPInfo.ip} (${proxyIPInfo.city}, ${proxyIPInfo.region}, ${proxyIPInfo.country})`);
    if (proxyIPInfo.country !== 'IN') {
      console.warn(`⚠️  Warning: Proxy IP is in ${proxyIPInfo.country}, not India (IN)`);
      console.warn('   Make sure ZeroOmega proxy is enabled!');
    }
  } catch (e) {
    console.error('❌ Failed to verify proxy IP location:', e);
    console.log('   Continuing anyway...');
  }
  await testPage.close();

  // Generate surface manifests
  const surfaceManifests = generateSurfaceManifests(directIPInfo, proxyIPInfo);

  console.log('\n' + '─'.repeat(70));
  console.log('SURFACE CONFIGURATION SUMMARY');
  console.log('─'.repeat(70));
  for (const manifest of surfaceManifests) {
    console.log(`\n${manifest.surfaceId}:`);
    console.log(`  IP: ${manifest.ipSource.ip} (${manifest.ipSource.location})`);
    console.log(`  Method: ${manifest.localizationMethod.slice(0, 60)}`);
  }
  console.log('\n' + '─'.repeat(70));

  // Find ChatGPT tab
  console.log('\nLooking for ChatGPT tab...');
  let chatgptPage: Page | null = null;
  const pages = context.pages();
  for (const page of pages) {
    const url = page.url();
    if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
      chatgptPage = page;
      console.log(`✅ Found ChatGPT tab: ${url}`);
      break;
    }
  }

  if (!chatgptPage) {
    console.log('\n⚠️  No ChatGPT tab found. Opening one...');
    chatgptPage = await context.newPage();
    await chatgptPage.goto('https://chatgpt.com', { timeout: 60000, waitUntil: 'domcontentloaded' });
    await chatgptPage.waitForTimeout(3000);
  }

  const isLoggedIn = await chatgptPage.evaluate(() => {
    return !document.querySelector('[data-testid="login-button"]') &&
           !window.location.href.includes('/auth/');
  });

  if (!isLoggedIn) {
    console.log('\n⚠️  ChatGPT requires login. Please log in manually in the browser window.');
    console.log('   Press Enter here when you are logged in and ready...');
    await new Promise<void>(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }
  console.log('✅ ChatGPT ready');
  console.log('');

  // Load Ranjan's Web Search API data for comparison
  console.log('Loading Ranjan\'s Web Search API data for comparison...');
  const ranjanData = loadRanjanData();
  if (ranjanData.length > 0) {
    console.log(`✅ Loaded ${ranjanData.length} results from Ranjan's Web Search API CSV`);
  } else {
    console.log('⚠️  Ranjan data not available - comparison section will be skipped');
  }
  console.log('');

  // Load previous results if resuming
  let results: QueryResult[] = [];
  if (RESUME_FROM_QUERY > 0) {
    try {
      const intermediatePath = `studies/ranjan-comparison-intermediate-${RESUME_FROM_QUERY}.json`;
      const previousData = JSON.parse(readFileSync(intermediatePath, 'utf-8'));
      results = previousData.results || [];
      console.log(`📂 Loaded ${results.length} previous results from ${intermediatePath}`);
    } catch {
      console.log(`⚠️  Could not load previous results, starting fresh\n`);
    }
  }

  const startTime = Date.now();
  let skipOpenAI = false;

  for (let i = RESUME_FROM_QUERY; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    const progress = `[${i + 1}/${QUERIES.length}]`;

    console.log(`\n${progress} "${query.slice(0, 55)}${query.length > 55 ? '...' : ''}"`);
    console.log('─'.repeat(70));

    // 1. OpenAI API Baseline
    if (!skipOpenAI) {
      process.stdout.write('  → OpenAI API Baseline... ');
      const baselineResult = await queryOpenAIAPIBaseline(query, i, directIPInfo.ip);
      results.push(baselineResult);
      if (baselineResult.success) {
        console.log(`✅ (${baselineResult.responseTimeMs}ms) [IP: ${directIPInfo.ip}]`);
      } else {
        console.log(`❌ ${baselineResult.error?.slice(0, 40)}`);
        if (baselineResult.error?.includes('insufficient_quota') || baselineResult.error?.includes('429') || baselineResult.error?.includes('rate_limit')) {
          notify('OpenAI quota/rate limit exceeded! Skipping remaining OpenAI API calls.', true);
          skipOpenAI = true;
        }
      }
    }

    // 2. OpenAI API + India System Prompt
    if (!skipOpenAI) {
      process.stdout.write('  → OpenAI API + India Prompt... ');
      const promptResult = await queryOpenAIAPIWithIndiaPrompt(query, i, directIPInfo.ip);
      results.push(promptResult);
      if (promptResult.success) {
        console.log(`✅ (${promptResult.responseTimeMs}ms) [IP: ${directIPInfo.ip}]`);
      } else {
        console.log(`❌ ${promptResult.error?.slice(0, 40)}`);
      }
    }

    // 3. OpenAI Web Search API + user_location
    if (!skipOpenAI) {
      process.stdout.write('  → OpenAI Web Search API... ');
      const webSearchResult = await queryOpenAIWebSearchAPI(query, i, directIPInfo.ip);
      results.push(webSearchResult);
      if (webSearchResult.success) {
        const sourceCount = webSearchResult.sources?.length || 0;
        console.log(`✅ (${webSearchResult.responseTimeMs}ms) [IP: ${directIPInfo.ip}] [${sourceCount} sources]`);
      } else {
        console.log(`❌ ${webSearchResult.error?.slice(0, 40)}`);
      }
    }

    // 4. ChatGPT Web with India IP
    process.stdout.write('  → ChatGPT Web + India IP... ');
    const chatgptResult = await queryChatGPTWeb(query, i, chatgptPage, proxyIPInfo.ip);
    results.push(chatgptResult);
    console.log(chatgptResult.success ? `✅ (${chatgptResult.responseTimeMs}ms) [IP: ${proxyIPInfo.ip}]` : `❌ ${chatgptResult.error}`);

    // Save intermediate results every 5 queries
    if ((i + 1) % 5 === 0) {
      const intermediatePath = `studies/ranjan-comparison-intermediate-${i + 1}.json`;
      writeFileSync(intermediatePath, JSON.stringify({ results, lastQuery: i, surfaceManifests }, null, 2));
      console.log(`\n  💾 Saved intermediate results to ${intermediatePath}`);
    }

    // Delay between queries
    if (i < QUERIES.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const totalTime = Date.now() - startTime;

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('  RESULTS SUMMARY');
  console.log('═'.repeat(70));

  const surfaces = ['openai-api-baseline', 'openai-api-india-prompt', 'openai-web-search-api', 'chatgpt-web-india-ip'];
  for (const surface of surfaces) {
    const surfaceResults = results.filter(r => r.surface === surface);
    const successCount = surfaceResults.filter(r => r.success).length;
    const manifest = surfaceManifests.find(m => m.surfaceId === surface);
    const ip = manifest?.ipSource.ip || 'unknown';
    console.log(`${surface.padEnd(30)} ${successCount}/${surfaceResults.length} successful [IP: ${ip}]`);
  }
  console.log(`\nTotal time: ${Math.round(totalTime / 1000 / 60)} minutes`);

  // Generate provenance report
  const studyMetadata = {
    studyName: manifest.name,
    totalQueries: QUERIES.length,
  };
  const provenanceReport = generateProvenanceReport(surfaceManifests, results, studyMetadata, ranjanData);

  // Save final results
  const outputPath = 'studies/ranjan-comparison-results.json';
  writeFileSync(outputPath, JSON.stringify({
    studyId: crypto.randomUUID(),
    studyName: manifest.name,
    description: 'Four-way comparison of OpenAI surfaces for India localization with full provenance tracking',
    surfaceManifests,
    configuration: {
      systemPrompt: INDIA_SYSTEM_PROMPT,
      userLocation: INDIA_USER_LOCATION,
      directIP: directIPInfo,
      proxyIP: proxyIPInfo,
    },
    timestamp: new Date().toISOString(),
    totalTimeMs: totalTime,
    summary: {
      totalQueries: QUERIES.length,
      surfaces: Object.fromEntries(surfaces.map(s => {
        const sr = results.filter(r => r.surface === s);
        const manifest = surfaceManifests.find(m => m.surfaceId === s);
        return [s, {
          total: sr.length,
          successful: sr.filter(r => r.success).length,
          ipUsed: manifest?.ipSource.ip,
          localizationMethod: manifest?.localizationMethod,
        }];
      })),
    },
    results,
  }, null, 2));

  // Save provenance report
  const reportPath = 'studies/ranjan-comparison-provenance-report.txt';
  writeFileSync(reportPath, provenanceReport);

  console.log(`\n✅ Results saved to: ${outputPath}`);
  console.log(`✅ Provenance report saved to: ${reportPath}`);
  console.log('\n' + '═'.repeat(70));
  console.log('  PROVENANCE SUMMARY');
  console.log('═'.repeat(70));
  console.log('\n| Surface                          | IP Address       | Location              |');
  console.log('|----------------------------------|------------------|-----------------------|');
  for (const manifest of surfaceManifests) {
    const name = manifest.surfaceName.slice(0, 32).padEnd(32);
    const ip = manifest.ipSource.ip.slice(0, 16).padEnd(16);
    const loc = manifest.ipSource.location.slice(0, 21).padEnd(21);
    console.log(`| ${name} | ${ip} | ${loc} |`);
  }
  console.log('');

  // Disconnect from CDP (user's browser stays open)
  await browser.close();
  console.log('\n✅ Study complete! Your browser stays open.');
}

main().catch(console.error);
