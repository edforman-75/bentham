#!/usr/bin/env npx tsx
/**
 * Run Google Visibility Study
 *
 * 12 studies comparing HUFT visibility across Google surfaces:
 *   G1-G4:  Google Search + AI Overview (India/US × Original/IndiaSuffix)
 *   G5-G8:  Google Search Organic only (India/US × Original/IndiaSuffix)
 *   G9-G12: Gemini API (India/US × Original/IndiaSuffix)
 *
 * Usage:
 *   npx tsx scripts/run-google-visibility-study.ts           # Run all studies
 *   npx tsx scripts/run-google-visibility-study.ts g01       # Run specific study
 *   npx tsx scripts/run-google-visibility-study.ts g01-g04   # Run range
 *   npx tsx scripts/run-google-visibility-study.ts --gemini  # Run only Gemini studies
 *   npx tsx scripts/run-google-visibility-study.ts --search  # Run only Search studies
 *
 * Prerequisites:
 *   - GEMINI_API_KEY environment variable for Gemini API
 *   - Chrome running with --remote-debugging-port=9222 for Google Search
 *   - India proxy configured in Chrome for in-mum location studies
 */

import 'dotenv/config';
import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

// Import core execution metadata types
// Using path.resolve to handle module resolution across different execution contexts
import * as url from 'url';
import * as pathModule from 'path';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);
const executionMetadataPath = pathModule.resolve(__dirname, '../packages/core/src/types/execution-metadata');

const executionMetadata = await import(executionMetadataPath);

const {
  createEmptyIPInfo,
  verifyIPLocation,
  characterizeFailure,
  generateRunId,
  getEnvironmentInfo,
  createWarning,
  calculateTimingStats,
  calculateFailureSummary,
} = executionMetadata;

import type {
  IPInfo,
  IPVerification,
  ExecutionTiming,
  FailureCharacterization,
  ExecutionWarning,
  RunIdentification,
  CheckpointInfo,
  WarningSeverity,
} from '../packages/core/src/types/execution-metadata.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const QUERIES = [
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

interface StudyConfig {
  id: string;
  name: string;
  surface: 'google-search' | 'google-ai-api';
  captureAiOverview: boolean;
  location: 'in-mum' | 'us-national';
  promptSuffix: string | null;
  geoLocation?: string;
}

const STUDIES: StudyConfig[] = [
  // Google Search WITH AI Overview
  { id: 'g01', name: 'Google Search + AI Overview - India IP - Original', surface: 'google-search', captureAiOverview: true, location: 'in-mum', promptSuffix: null, geoLocation: 'IN' },
  { id: 'g02', name: 'Google Search + AI Overview - India IP - India Suffix', surface: 'google-search', captureAiOverview: true, location: 'in-mum', promptSuffix: ' in India', geoLocation: 'IN' },
  { id: 'g03', name: 'Google Search + AI Overview - US IP - Original', surface: 'google-search', captureAiOverview: true, location: 'us-national', promptSuffix: null, geoLocation: 'US' },
  { id: 'g04', name: 'Google Search + AI Overview - US IP - India Suffix', surface: 'google-search', captureAiOverview: true, location: 'us-national', promptSuffix: ' in India', geoLocation: 'US' },

  // Google Search WITHOUT AI Overview (organic only)
  { id: 'g05', name: 'Google Search Organic - India IP - Original', surface: 'google-search', captureAiOverview: false, location: 'in-mum', promptSuffix: null, geoLocation: 'IN' },
  { id: 'g06', name: 'Google Search Organic - India IP - India Suffix', surface: 'google-search', captureAiOverview: false, location: 'in-mum', promptSuffix: ' in India', geoLocation: 'IN' },
  { id: 'g07', name: 'Google Search Organic - US IP - Original', surface: 'google-search', captureAiOverview: false, location: 'us-national', promptSuffix: null, geoLocation: 'US' },
  { id: 'g08', name: 'Google Search Organic - US IP - India Suffix', surface: 'google-search', captureAiOverview: false, location: 'us-national', promptSuffix: ' in India', geoLocation: 'US' },

  // Gemini API
  { id: 'g09', name: 'Gemini API - US IP - Original', surface: 'google-ai-api', captureAiOverview: false, location: 'us-national', promptSuffix: null },
  { id: 'g10', name: 'Gemini API - US IP - India Suffix', surface: 'google-ai-api', captureAiOverview: false, location: 'us-national', promptSuffix: ' in India' },
  { id: 'g11', name: 'Gemini API - India IP - Original', surface: 'google-ai-api', captureAiOverview: false, location: 'in-mum', promptSuffix: null },
  { id: 'g12', name: 'Gemini API - India IP - India Suffix', surface: 'google-ai-api', captureAiOverview: false, location: 'in-mum', promptSuffix: ' in India' },
];

const OUTPUT_DIR = 'studies/google';

// Session recovery thresholds
const MAX_CONSECUTIVE_FAILURES = 3;  // Trigger session recovery after this many consecutive failures
const MAX_SESSION_RECOVERIES = 5;    // Maximum session recovery attempts per study

import * as readline from 'readline';

// =============================================================================
// SERPAPI CONFIGURATION
// =============================================================================

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const USE_SERPAPI = !!SERPAPI_KEY; // Use SerpAPI if key is configured

interface SerpAPIResponse {
  search_metadata: {
    id: string;
    status: string;
    json_endpoint: string;
    created_at: string;
    processed_at: string;
    google_url: string;
    raw_html_file: string;
    total_time_taken: number;
  };
  search_parameters: {
    engine: string;
    q: string;
    location_requested?: string;
    location_used?: string;
    google_domain: string;
    hl: string;
    gl: string;
  };
  search_information?: {
    query_displayed: string;
    total_results?: number;
    time_taken_displayed?: number;
    organic_results_state?: string;
  };
  ai_overview?: {
    text?: string;
    text_blocks?: Array<{
      type: string;
      snippet?: string;
      list?: Array<{ snippet: string }>;
    }>;
    references?: Array<{
      title: string;
      link: string;
      snippet?: string;
    }>;
    // Sometimes SerpAPI returns a link to fetch AI Overview separately
    page_token?: string;
    serpapi_link?: string;
  };
  organic_results?: Array<{
    position: number;
    title: string;
    link: string;
    snippet?: string;
    snippet_highlighted_words?: string[];
  }>;
  error?: string;
}

/**
 * Execute Google Search via SerpAPI - no CAPTCHA worries!
 */
async function executeGoogleSearchViaSerpAPI(
  query: string,
  captureAiOverview: boolean,
  location: 'in-mum' | 'us-national'
): Promise<{ response: string; aiOverview?: string; organicResults?: OrganicResult[]; sources?: SourceCitation[]; serpApiMetadata?: any }> {

  if (!SERPAPI_KEY) {
    throw new Error('SERPAPI_KEY not configured in .env');
  }

  // Map location to SerpAPI parameters
  const locationParams = location === 'in-mum'
    ? { location: 'Mumbai,Maharashtra,India', google_domain: 'google.co.in', gl: 'in', hl: 'en' }
    : { location: 'United States', google_domain: 'google.com', gl: 'us', hl: 'en' };

  const params = new URLSearchParams({
    api_key: SERPAPI_KEY,
    engine: 'google',
    q: query,
    ...locationParams,
  });

  const url = `https://serpapi.com/search.json?${params}`;

  try {
    const response = await fetch(url);
    const data: SerpAPIResponse = await response.json();

    if (data.error) {
      throw new Error(`SerpAPI error: ${data.error}`);
    }

    // Extract AI Overview if present
    let aiOverview: string | undefined;
    let sources: SourceCitation[] = [];

    if (data.ai_overview) {
      // Check if we have inline text_blocks or need a second call
      if (data.ai_overview.text_blocks) {
        // Inline AI Overview - parse directly
        aiOverview = data.ai_overview.text_blocks
          .map(block => {
            // SerpAPI uses 'snippet' not 'text' for text content
            if (block.snippet) return block.snippet;
            // List items are objects with 'snippet' property
            if (block.list) return block.list.map(item => item.snippet).join('\n');
            return '';
          })
          .filter(Boolean)
          .join('\n\n');

        // Extract sources/references
        if (data.ai_overview.references) {
          sources = data.ai_overview.references.map((source, idx) => ({
            index: idx + 1,
            title: source.title,
            url: source.link,
          }));
        }
      } else if (data.ai_overview.text) {
        aiOverview = data.ai_overview.text;
      } else if (data.ai_overview.serpapi_link && data.ai_overview.page_token) {
        // Need to make a second call to get AI Overview content
        try {
          const aiOverviewUrl = `https://serpapi.com/search.json?api_key=${SERPAPI_KEY}&engine=google_ai_overview&page_token=${data.ai_overview.page_token}`;
          const aiResponse = await fetch(aiOverviewUrl);
          const aiData = await aiResponse.json();

          if (aiData.ai_overview?.text_blocks) {
            aiOverview = aiData.ai_overview.text_blocks
              .map((block: any) => {
                if (block.snippet) return block.snippet;
                if (block.list) return block.list.map((item: any) => item.snippet).join('\n');
                return '';
              })
              .filter(Boolean)
              .join('\n\n');

            if (aiData.ai_overview.references) {
              sources = aiData.ai_overview.references.map((source: any, idx: number) => ({
                index: idx + 1,
                title: source.title,
                url: source.link,
              }));
            }
          }
        } catch (e) {
          console.log(`    ⚠️ Failed to fetch AI Overview via serpapi_link: ${e}`);
        }
      }
    }

    // Extract organic results
    const organicResults: OrganicResult[] = (data.organic_results || [])
      .slice(0, 10)
      .map(result => ({
        position: result.position,
        title: result.title,
        url: result.link,
        snippet: result.snippet || '',
      }));

    // Build response text (combine AI overview and organic results)
    const responseParts: string[] = [];
    if (aiOverview) {
      responseParts.push(`AI Overview:\n${aiOverview}`);
    }
    if (organicResults.length > 0) {
      responseParts.push(`\nOrganic Results:\n${organicResults.map(r => `${r.position}. ${r.title}`).join('\n')}`);
    }

    return {
      response: responseParts.join('\n') || 'No results found',
      aiOverview,
      organicResults,
      sources,
      serpApiMetadata: {
        searchId: data.search_metadata?.id,
        totalResults: data.search_information?.total_results,
        timeTaken: data.search_metadata?.total_time_taken,
        googleUrl: data.search_metadata?.google_url,
        locationUsed: data.search_parameters?.location_used,
      },
    };

  } catch (error) {
    throw new Error(`SerpAPI request failed: ${error}`);
  }
}

// =============================================================================
// PROXY CONFIGURATION
// =============================================================================

interface ProxyConfig {
  server: string;      // e.g., 'socks5://proxy.example.com:1080' or 'http://proxy:8080'
  username?: string;
  password?: string;
  location: string;    // 'in-mum', 'us-national', etc.
  name: string;        // Human-readable name
}

// Configure your proxies here - loaded from environment or hardcoded
// Format: PROXY_IN_1="socks5://user:pass@host:port" PROXY_IN_2="..." etc.
function loadProxyConfigs(): ProxyConfig[] {
  const proxies: ProxyConfig[] = [];

  // India proxies
  for (let i = 1; i <= 5; i++) {
    const envVar = process.env[`PROXY_IN_${i}`];
    if (envVar) {
      proxies.push(parseProxyUrl(envVar, 'in-mum', `India Proxy ${i}`));
    }
  }

  // US proxies
  for (let i = 1; i <= 5; i++) {
    const envVar = process.env[`PROXY_US_${i}`];
    if (envVar) {
      proxies.push(parseProxyUrl(envVar, 'us-national', `US Proxy ${i}`));
    }
  }

  // Cherry Proxy - if configured as single rotating endpoint
  if (process.env.CHERRY_PROXY_IN) {
    proxies.push(parseProxyUrl(process.env.CHERRY_PROXY_IN, 'in-mum', 'Cherry Proxy India'));
  }
  if (process.env.CHERRY_PROXY_US) {
    proxies.push(parseProxyUrl(process.env.CHERRY_PROXY_US, 'us-national', 'Cherry Proxy US'));
  }

  // Local SOCKS proxy (e.g., SSH tunnel)
  if (process.env.LOCAL_SOCKS_PROXY) {
    proxies.push(parseProxyUrl(process.env.LOCAL_SOCKS_PROXY, 'unknown', 'Local SOCKS'));
  }

  return proxies;
}

function parseProxyUrl(url: string, location: string, name: string): ProxyConfig {
  // Parse URLs like: socks5://user:pass@host:port or http://host:port
  const config: ProxyConfig = { server: url, location, name };

  try {
    // Extract auth if present
    const match = url.match(/^(socks5?|https?):\/\/(?:([^:]+):([^@]+)@)?(.+)$/);
    if (match) {
      const [, protocol, user, pass, hostPort] = match;
      if (user && pass) {
        config.server = `${protocol}://${hostPort}`;
        config.username = user;
        config.password = pass;
      }
    }
  } catch {
    // Keep original URL if parsing fails
  }

  return config;
}

// Track which proxies have been used/blocked in this session
const blockedProxies = new Set<string>();
let currentProxyIndex = 0;
let sessionCounter = 0;

/**
 * Generate a random session ID for Cherry Proxy to get a new IP.
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `G${timestamp}${random}`;
}

/**
 * Modify Cherry Proxy URL with a new session ID to force a new IP.
 * Cherry Proxy format: http://user-zone-custom-region-IN-sessid-XXX-sessTime-120:pass@host:port
 */
function refreshCherryProxySession(proxy: ProxyConfig): ProxyConfig {
  const newSessionId = generateSessionId();
  sessionCounter++;

  // Check if this is a Cherry Proxy URL (contains 'sessid-')
  const fullUrl = proxy.username && proxy.password
    ? `http://${proxy.username}:${proxy.password}@${proxy.server.replace(/^https?:\/\//, '')}`
    : proxy.server;

  if (fullUrl.includes('sessid-')) {
    // Replace the session ID in the username portion
    const newUrl = fullUrl.replace(/sessid-[^-]+-sessTime/, `sessid-${newSessionId}-sessTime`);
    const refreshed = parseProxyUrl(newUrl, proxy.location, `${proxy.name} (session ${sessionCounter})`);
    console.log(`🔄 Refreshed Cherry Proxy session ID: ${newSessionId}`);
    return refreshed;
  }

  return proxy;
}

function getNextProxy(location: string, allProxies: ProxyConfig[]): ProxyConfig | null {
  const locationProxies = allProxies.filter(p =>
    p.location === location || p.location === 'unknown'
  );

  // Find first non-blocked proxy
  for (const proxy of locationProxies) {
    if (!blockedProxies.has(proxy.server)) {
      return proxy;
    }
  }

  // All proxies blocked - reset and try again (they may have recovered)
  if (locationProxies.length > 0) {
    console.log('⚠️  All proxies were blocked, resetting block list...');
    blockedProxies.clear();
    return locationProxies[0];
  }

  return null;
}

function markProxyBlocked(proxy: ProxyConfig) {
  blockedProxies.add(proxy.server);
  console.log(`🚫 Marked proxy as blocked: ${proxy.name}`);
}

// =============================================================================
// TYPES
// =============================================================================

interface QueryResult {
  queryIndex: number;
  originalQuery: string;
  submittedQuery: string;
  response: string;
  aiOverview?: string;
  organicResults?: OrganicResult[];
  sources?: SourceCitation[];
  timestamp: string;
  durationMs: number;
  success: boolean;
  error?: string;
  failure?: FailureCharacterization;
  warnings?: ExecutionWarning[];
  responseSizeBytes?: number;
}

interface OrganicResult {
  position: number;
  title: string;
  url: string;
  snippet: string;
}

interface SourceCitation {
  index: number;
  title: string;
  url: string;
}

// IPInfo imported from @bentham/core

interface StudyResult {
  // Run identification for correlation
  run: RunIdentification;

  // Study identifiers
  study: string;
  studyName: string;
  surface: string;
  location: string;
  expectedLocation: 'in-mum' | 'us-national';
  promptSuffix: string | null;
  captureAiOverview: boolean;

  // Timestamps and timing
  timestamp: string;
  timing: ExecutionTiming;

  // IP verification
  ipVerification: IPVerification;

  // Results
  results: QueryResult[];

  // Summary statistics
  summary: {
    total: number;
    successful: number;
    failed: number;
    avgDurationMs: number;
    medianDurationMs?: number;
    p95DurationMs?: number;
    failureRate: number;
  };

  // Failure analysis
  failures?: {
    totalFailures: number;
    byCategory: Record<string, number>;
    failedQueryIndices: number[];
    failurePattern: 'transient' | 'systematic' | 'mixed' | 'none';
  };

  // Warnings
  warnings?: ExecutionWarning[];

  // Checkpoints saved
  checkpoints?: CheckpointInfo[];

  // Environment info
  environment: {
    nodeVersion: string;
    platform: string;
    benthamVersion: string;
    timezone: string;
  };

  // Schema version for future compatibility
  schemaVersion: '1.0';
}

// =============================================================================
// UTILITIES
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function notify(message: string, urgent: boolean = false) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = urgent ? '🚨' : '📢';
  console.log(`\n${prefix} [${timestamp}] ${message}`);

  if (process.platform === 'darwin') {
    const title = urgent ? 'BENTHAM ALERT' : 'Bentham Status';
    exec(`osascript -e 'display notification "${message}" with title "${title}"'`);
  }

  if (urgent) {
    process.stdout.write('\x07\x07\x07');
  }
}

/**
 * Prompt user to set up a new session and wait for confirmation.
 */
async function promptForSessionRecovery(reason: string, recoveryAttempt: number): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n' + '🔴'.repeat(35));
  console.log(`\n⚠️  SESSION BLOCKED - Recovery attempt ${recoveryAttempt}/${MAX_SESSION_RECOVERIES}`);
  console.log(`   Reason: ${reason}`);
  console.log('\n📋 TO CONTINUE, please:');
  console.log('   1. Close the blocked Chrome tab');
  console.log('   2. Change your IP (switch proxy server, reconnect VPN, etc.)');
  console.log('   3. Verify new IP at https://ipinfo.io');
  console.log('   4. Make sure Chrome is still running with --remote-debugging-port=9222');
  console.log('\n' + '🔴'.repeat(35));

  notify('SESSION BLOCKED - Human intervention required!', true);

  return new Promise((resolve) => {
    rl.question('\n👉 Press ENTER when ready to continue (or type "skip" to skip remaining queries, "abort" to abort study): ', (answer) => {
      rl.close();
      const lowerAnswer = answer.toLowerCase().trim();
      if (lowerAnswer === 'abort') {
        console.log('   User chose to abort study.');
        resolve(false);
      } else if (lowerAnswer === 'skip') {
        console.log('   User chose to skip remaining queries.');
        resolve(false);
      } else {
        console.log('   Attempting to reconnect...');
        resolve(true);
      }
    });
  });
}

/**
 * Reconnect to Chrome via CDP.
 */
async function reconnectToChrome(): Promise<Browser | null> {
  try {
    console.log('\n🔄 Reconnecting to Chrome via CDP...');
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✓ Reconnected to Chrome');
    return browser;
  } catch (error) {
    console.error('❌ Failed to reconnect to Chrome:', error);
    return null;
  }
}

/**
 * Launch a new browser with proxy settings and stealth mode.
 */
async function launchBrowserWithProxy(proxy: ProxyConfig | null): Promise<Browser> {
  const launchOptions: any = {
    headless: false, // Use headed mode so user can see what's happening
    // Stealth args to avoid detection
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
    ],
  };

  if (proxy) {
    console.log(`\n🌐 Launching browser with proxy: ${proxy.name}`);
    console.log(`   Server: ${proxy.server}`);

    launchOptions.proxy = {
      server: proxy.server,
    };

    if (proxy.username && proxy.password) {
      launchOptions.proxy.username = proxy.username;
      launchOptions.proxy.password = proxy.password;
    }
  } else {
    console.log('\n🌐 Launching browser without proxy (direct connection)');
  }

  const browser = await chromium.launch(launchOptions);
  console.log('✓ Browser launched');
  return browser;
}

/**
 * Create a new browser context with anti-detection measures.
 */
async function createContextWithProxy(browser: Browser, proxy: ProxyConfig | null): Promise<{ context: any; page: Page }> {
  // Randomize viewport slightly to avoid fingerprinting
  const viewportWidth = 1280 + Math.floor(Math.random() * 100);
  const viewportHeight = 800 + Math.floor(Math.random() * 100);

  // Use a recent, common user agent
  const userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  ];
  const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

  const contextOptions: any = {
    viewport: { width: viewportWidth, height: viewportHeight },
    userAgent,
    // Realistic locale and timezone
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    // Permissions that a real browser would have
    permissions: ['geolocation'],
  };

  const context = await browser.newContext(contextOptions);

  // Add anti-detection scripts to every page
  await context.addInitScript(() => {
    // Mask navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Add realistic plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
    });

    // Add realistic languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'hi'],
    });

    // Mask automation flags
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0,
    });

    // Override permissions query for notifications
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });

  const page = await context.newPage();

  return { context, page };
}

interface BrowserSession {
  browser: Browser;
  context: any;
  page: Page;
  proxy: ProxyConfig | null;
}

/**
 * Create a new browser session with the specified proxy.
 * For Cherry Proxy, generates a new session ID to get a fresh IP.
 */
async function createBrowserSession(
  proxy: ProxyConfig | null,
  closePrevious?: BrowserSession,
  options?: { warmUp?: boolean; geoLocation?: string }
): Promise<BrowserSession> {
  // Close previous session if provided
  if (closePrevious) {
    try {
      await closePrevious.browser.close();
    } catch {
      // Ignore close errors
    }
  }

  // Refresh Cherry Proxy session ID to get a new IP
  const actualProxy = proxy ? refreshCherryProxySession(proxy) : null;

  const browser = await launchBrowserWithProxy(actualProxy);
  const { context, page } = await createContextWithProxy(browser, actualProxy);

  // Warm up the session if requested (default: true for search studies)
  if (options?.warmUp !== false) {
    await warmUpSession(page, options?.geoLocation || 'IN');
  }

  return { browser, context, page, proxy: actualProxy };
}

function modifyQueryForIndia(query: string, suffix: string | null): string {
  if (!suffix) return query;

  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('in india') || lowerQuery.includes('indian')) {
    return query;
  }

  return query.replace(/\?$/, '') + suffix + '?';
}

/**
 * Random delay with human-like variance.
 * baseMs is the minimum, adds up to 50% more randomly.
 */
function humanDelay(baseMs: number): Promise<void> {
  const variance = baseMs * 0.5 * Math.random();
  return delay(baseMs + variance);
}

/**
 * Warm up the browser session to look more human-like.
 * - Visit Google homepage
 * - Accept cookie consent if present
 * - Maybe do a benign search first
 * - Add natural pauses
 */
async function warmUpSession(page: Page, geoLocation: string = 'IN'): Promise<void> {
  console.log('🔥 Warming up session (human-like behavior)...');

  try {
    // 1. Visit Google homepage first
    const googleUrl = geoLocation === 'IN' ? 'https://www.google.co.in' : 'https://www.google.com';
    console.log(`   Visiting ${googleUrl}...`);
    await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await humanDelay(2000);

    // 2. Try to accept cookie consent if present
    try {
      const acceptButton = page.locator('button:has-text("Accept all"), button:has-text("I agree"), button:has-text("Accept")').first();
      if (await acceptButton.isVisible({ timeout: 2000 })) {
        console.log('   Accepting cookie consent...');
        await acceptButton.click();
        await humanDelay(1000);
      }
    } catch {
      // No cookie banner, that's fine
    }

    // 3. Do a benign "warm-up" search to establish normal behavior
    console.log('   Performing warm-up search...');
    const warmUpQueries = [
      'weather today',
      'time now',
      'what day is it',
      'hello google',
    ];
    const warmUpQuery = warmUpQueries[Math.floor(Math.random() * warmUpQueries.length)];

    // Find and use the search box
    const searchBox = page.locator('textarea[name="q"], input[name="q"]').first();
    if (await searchBox.isVisible({ timeout: 3000 })) {
      // Type slowly like a human
      await searchBox.click();
      await humanDelay(500);
      await searchBox.fill(warmUpQuery);
      await humanDelay(800);
      await searchBox.press('Enter');
      await humanDelay(3000);

      // Scroll a bit like a human would
      await page.mouse.wheel(0, 300);
      await humanDelay(1500);

      console.log('   ✓ Warm-up complete');
    }
  } catch (error) {
    console.log(`   ⚠️ Warm-up had issues (continuing anyway): ${error}`);
  }
}

// =============================================================================
// 2CAPTCHA SOLVER
// =============================================================================

const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY;

interface CaptchaSolveResult {
  success: boolean;
  solution?: string;
  error?: string;
  cost?: number;
}

/**
 * Solve Google reCAPTCHA v2 using 2Captcha service.
 * Returns the g-recaptcha-response token.
 */
async function solveRecaptchaV2(siteKey: string, pageUrl: string): Promise<CaptchaSolveResult> {
  if (!TWOCAPTCHA_API_KEY) {
    return { success: false, error: 'TWOCAPTCHA_API_KEY not configured' };
  }

  console.log('   🔐 Sending CAPTCHA to 2Captcha...');

  try {
    // Step 1: Submit CAPTCHA
    const submitUrl = `https://2captcha.com/in.php?key=${TWOCAPTCHA_API_KEY}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${encodeURIComponent(pageUrl)}&json=1`;
    const submitResponse = await fetch(submitUrl);
    const submitData = await submitResponse.json();

    if (submitData.status !== 1) {
      return { success: false, error: `Submit failed: ${submitData.request}` };
    }

    const taskId = submitData.request;
    console.log(`   📋 Task ID: ${taskId}`);

    // Step 2: Poll for result (with timeout)
    const maxAttempts = 30; // 30 * 5s = 150s max wait
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await delay(5000); // Wait 5 seconds between polls

      const resultUrl = `https://2captcha.com/res.php?key=${TWOCAPTCHA_API_KEY}&action=get&id=${taskId}&json=1`;
      const resultResponse = await fetch(resultUrl);
      const resultData = await resultResponse.json();

      if (resultData.status === 1) {
        console.log('   ✓ CAPTCHA solved!');
        return {
          success: true,
          solution: resultData.request,
          cost: 0.003, // ~$0.003 per reCAPTCHA
        };
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        return { success: false, error: `Solve failed: ${resultData.request}` };
      }

      if (attempt % 4 === 0) {
        console.log(`   ⏳ Waiting for solution... (${(attempt + 1) * 5}s)`);
      }
    }

    return { success: false, error: 'Timeout waiting for CAPTCHA solution' };

  } catch (error) {
    return { success: false, error: `2Captcha error: ${error}` };
  }
}

/**
 * Extract reCAPTCHA sitekey from a Google sorry/CAPTCHA page.
 */
async function extractRecaptchaSiteKey(page: Page): Promise<string | null> {
  try {
    // Look for the sitekey in various places
    const siteKey = await page.evaluate(() => {
      // Check data-sitekey attribute
      const recaptchaDiv = document.querySelector('.g-recaptcha, [data-sitekey]');
      if (recaptchaDiv) {
        return recaptchaDiv.getAttribute('data-sitekey');
      }

      // Check script src for sitekey parameter
      const scripts = document.querySelectorAll('script[src*="recaptcha"]');
      for (const script of scripts) {
        const src = script.getAttribute('src') || '';
        const match = src.match(/[?&]k=([^&]+)/);
        if (match) return match[1];
      }

      // Check for grecaptcha object
      if ((window as any).grecaptcha && (window as any).___grecaptcha_cfg) {
        const clients = (window as any).___grecaptcha_cfg.clients;
        if (clients) {
          for (const key in clients) {
            const client = clients[key];
            if (client && client.id) return client.id;
          }
        }
      }

      return null;
    });

    return siteKey;
  } catch {
    return null;
  }
}

/**
 * Attempt to solve CAPTCHA on current page and continue.
 */
async function attemptCaptchaSolve(page: Page): Promise<boolean> {
  if (!TWOCAPTCHA_API_KEY) {
    console.log('   ⚠️ 2Captcha API key not configured - cannot solve CAPTCHA');
    return false;
  }

  console.log('   🔍 Attempting to solve CAPTCHA...');

  // Extract sitekey
  const siteKey = await extractRecaptchaSiteKey(page);
  if (!siteKey) {
    console.log('   ❌ Could not extract reCAPTCHA sitekey');
    return false;
  }

  console.log(`   📎 Found sitekey: ${siteKey.substring(0, 20)}...`);

  // Solve the CAPTCHA
  const result = await solveRecaptchaV2(siteKey, page.url());
  if (!result.success) {
    console.log(`   ❌ CAPTCHA solve failed: ${result.error}`);
    return false;
  }

  // Inject the solution
  try {
    await page.evaluate((token: string) => {
      // Set the response in the textarea
      const responseField = document.querySelector('#g-recaptcha-response, [name="g-recaptcha-response"]') as HTMLTextAreaElement;
      if (responseField) {
        responseField.value = token;
        responseField.style.display = 'block'; // Make visible temporarily
      }

      // Try to trigger callback if available
      if ((window as any).___grecaptcha_cfg) {
        const clients = (window as any).___grecaptcha_cfg.clients;
        for (const key in clients) {
          const client = clients[key];
          if (client && client.callback) {
            client.callback(token);
            return;
          }
        }
      }

      // Try submitting the form
      const form = document.querySelector('form');
      if (form) {
        form.submit();
      }
    }, result.solution!);

    // Wait for navigation
    await delay(2000);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

    // Check if we're still on CAPTCHA page
    const stillCaptcha = await detectCaptcha(page);
    if (stillCaptcha.detected) {
      console.log('   ⚠️ Still on CAPTCHA page after solution injection');
      return false;
    }

    console.log('   ✓ CAPTCHA bypassed successfully!');
    return true;

  } catch (error) {
    console.log(`   ❌ Failed to inject CAPTCHA solution: ${error}`);
    return false;
  }
}

async function getIPInfo(page: Page): Promise<{ ipInfo: IPInfo; lookupDurationMs: number }> {
  const startTime = Date.now();
  try {
    const newPage = await page.context().newPage();
    await newPage.goto('https://ipinfo.io/json', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const content = await newPage.textContent('body');
    await newPage.close();

    const data = JSON.parse(content || '{}');
    const lookupDurationMs = Date.now() - startTime;

    return {
      ipInfo: {
        ip: data.ip || 'unknown',
        country: data.country || 'unknown',
        city: data.city || 'unknown',
        region: data.region || 'unknown',
        org: data.org || 'unknown',
        timezone: data.timezone || 'unknown',
        loc: data.loc || 'unknown',
        postal: data.postal,
        hostname: data.hostname,
        asn: data.asn,
        isProxy: undefined, // ipinfo.io doesn't provide this in basic API
      },
      lookupDurationMs,
    };
  } catch (error) {
    console.error('Failed to get IP info:', error);
    return {
      ipInfo: createEmptyIPInfo(),
      lookupDurationMs: Date.now() - startTime,
    };
  }
}

// verifyIPLocation imported from @bentham/core

function formatIPBanner(verification: IPVerification): string {
  const { ipInfo, expectedLocation, expectedCountry, verified, lookupDurationMs } = verification;
  const status = verified ? '✓ VERIFIED' : '⚠ MISMATCH';
  const lookupInfo = lookupDurationMs ? ` (${lookupDurationMs}ms)` : '';
  return `
┌─────────────────────────────────────────────────────────────────────┐
│ IP CONFIGURATION${lookupInfo.padStart(52)}│
├─────────────────────────────────────────────────────────────────────┤
│ IP Address:    ${ipInfo.ip.padEnd(52)}│
│ Location:      ${(ipInfo.city + ', ' + ipInfo.region + ', ' + ipInfo.country).padEnd(52)}│
│ Organization:  ${ipInfo.org.slice(0, 52).padEnd(52)}│
│ Timezone:      ${ipInfo.timezone.padEnd(52)}│
│ Coordinates:   ${ipInfo.loc.padEnd(52)}│
├─────────────────────────────────────────────────────────────────────┤
│ Expected:      ${(expectedLocation + ' (' + expectedCountry + ')').padEnd(52)}│
│ Status:        ${status.padEnd(52)}│
└─────────────────────────────────────────────────────────────────────┘`;
}

function saveIntermediateResults(studyId: string, results: StudyResult): CheckpointInfo {
  const filename = path.join(OUTPUT_DIR, `${studyId}-intermediate-${results.results.length}.json`);
  const content = JSON.stringify(results, null, 2);
  fs.writeFileSync(filename, content);

  return {
    filePath: filename,
    savedAt: new Date().toISOString(),
    queriesCompleted: results.results.length,
    totalQueries: QUERIES.length,
    fileSizeBytes: Buffer.byteLength(content, 'utf8'),
  };
}

// =============================================================================
// CAPTCHA DETECTION
// =============================================================================

const CAPTCHA_INDICATORS = [
  'unusual traffic',
  'not a robot',
  'recaptcha',
  'captcha',
  'verify you',
  'automated requests',
  'sorry/index',
  'blocked',
];

interface CaptchaDetectionResult {
  detected: boolean;
  indicator?: string;
  pageUrl?: string;
}

async function detectCaptcha(page: Page): Promise<CaptchaDetectionResult> {
  try {
    const url = page.url().toLowerCase();
    const content = await page.content();
    const lowerContent = content.toLowerCase();

    // Check URL for CAPTCHA redirect
    if (url.includes('sorry/index') || url.includes('recaptcha')) {
      return { detected: true, indicator: 'URL redirect', pageUrl: url };
    }

    // Check page content for CAPTCHA indicators
    for (const indicator of CAPTCHA_INDICATORS) {
      if (lowerContent.includes(indicator)) {
        return { detected: true, indicator, pageUrl: url };
      }
    }

    return { detected: false };
  } catch {
    return { detected: false };
  }
}

// =============================================================================
// GOOGLE SEARCH ADAPTER
// =============================================================================

/**
 * Type text like a human - character by character with random delays
 */
async function humanType(page: Page, selector: string, text: string): Promise<void> {
  const element = page.locator(selector).first();
  await element.click();
  await delay(200 + Math.random() * 300);

  for (const char of text) {
    await element.type(char, { delay: 50 + Math.random() * 100 });
  }
}

/**
 * Execute a Google search by typing in the search box like a human.
 * This avoids the suspicious direct URL navigation pattern.
 */
async function executeGoogleSearch(
  page: Page,
  query: string,
  captureAiOverview: boolean,
  geoLocation: string
): Promise<{ response: string; aiOverview?: string; organicResults?: OrganicResult[]; sources?: SourceCitation[]; captchaDetected?: boolean }> {

  // Check if we're already on a Google page with search box
  const currentUrl = page.url();
  const isOnGoogle = currentUrl.includes('google.com') || currentUrl.includes('google.co.in');

  if (!isOnGoogle) {
    // Navigate to Google homepage first
    const googleUrl = geoLocation === 'IN' ? 'https://www.google.co.in' : 'https://www.google.com';
    await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(1000 + Math.random() * 1000);
  }

  // Check for CAPTCHA before searching
  let captchaCheck = await detectCaptcha(page);
  if (captchaCheck.detected) {
    console.log('   ⚠️ CAPTCHA detected before search, attempting to solve...');
    const solved = await attemptCaptchaSolve(page);
    if (!solved) {
      throw new Error(`CAPTCHA detected before search: ${captchaCheck.indicator} (URL: ${captchaCheck.pageUrl})`);
    }
    // Navigate back to Google after solving
    const googleUrl = geoLocation === 'IN' ? 'https://www.google.co.in' : 'https://www.google.com';
    await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await delay(1000);
  }

  // Find search box and clear any existing text
  const searchBox = page.locator('textarea[name="q"], input[name="q"]').first();

  try {
    await searchBox.click();
    await delay(300 + Math.random() * 200);

    // Clear existing text (if any) - triple click to select all, then delete
    await searchBox.click({ clickCount: 3 });
    await delay(100);
    await page.keyboard.press('Backspace');
    await delay(200 + Math.random() * 200);

    // Type the query character by character (human-like)
    for (const char of query) {
      await searchBox.type(char, { delay: 30 + Math.random() * 70 });
    }

    await delay(500 + Math.random() * 500);

    // Press Enter to search
    await page.keyboard.press('Enter');

    // Wait for navigation and results to load
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await delay(2000 + Math.random() * 1500); // Wait for AI Overview to potentially load

  } catch (error) {
    // If search box interaction fails, fall back to URL method as last resort
    console.log('   Search box interaction failed, trying URL method...');
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000);
  }

  // Check for CAPTCHA after search
  captchaCheck = await detectCaptcha(page);
  if (captchaCheck.detected) {
    console.log('   ⚠️ CAPTCHA detected after search, attempting to solve...');
    const solved = await attemptCaptchaSolve(page);
    if (!solved) {
      throw new Error(`CAPTCHA detected: ${captchaCheck.indicator} (URL: ${captchaCheck.pageUrl})`);
    }
    // Wait for results to load after CAPTCHA solve
    await delay(2000);
  }

  let aiOverview: string | undefined;
  let sources: SourceCitation[] = [];
  let organicResults: OrganicResult[] = [];

  // Capture AI Overview if requested
  if (captureAiOverview) {
    // Try multiple selectors for AI Overview
    const aiSelectors = [
      '[data-attrid="SGEAnswer"]',
      '[data-async-type="agi"]',
      '.M8OgIe',
      '.wDYxhc[data-md]',
      '.kp-wholepage [data-attrid*="Answer"]',
      '.IZ6rdc',
      '[jsname="N760b"]'
    ];

    for (const selector of aiSelectors) {
      try {
        const aiElement = await page.$(selector);
        if (aiElement) {
          aiOverview = await aiElement.innerText();

          // Extract source citations from AI Overview
          const sourceLinks = await aiElement.$$('a[href]');
          for (let i = 0; i < sourceLinks.length && i < 10; i++) {
            const link = sourceLinks[i];
            const href = await link.getAttribute('href');
            const title = await link.innerText();
            if (href && !href.includes('google.com') && title) {
              sources.push({ index: sources.length + 1, title, url: href });
            }
          }
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Capture organic results
  const resultElements = await page.$$('.g:not([data-async-type])');
  for (let i = 0; i < Math.min(resultElements.length, 10); i++) {
    try {
      const el = resultElements[i];
      const titleEl = await el.$('h3');
      const linkEl = await el.$('a');
      const snippetEl = await el.$('.VwiC3b, .IsZvec');

      if (titleEl && linkEl) {
        organicResults.push({
          position: i + 1,
          title: await titleEl.innerText(),
          url: await linkEl.getAttribute('href') || '',
          snippet: snippetEl ? await snippetEl.innerText() : ''
        });
      }
    } catch {
      continue;
    }
  }

  // Build response text
  let response = '';
  if (aiOverview) {
    response = `[AI OVERVIEW]\n${aiOverview}\n\n`;
  }

  if (organicResults.length > 0) {
    response += '[ORGANIC RESULTS]\n';
    for (const result of organicResults) {
      response += `${result.position}. ${result.title}\n   ${result.url}\n   ${result.snippet}\n\n`;
    }
  }

  return { response, aiOverview, organicResults, sources };
}

// =============================================================================
// GEMINI API ADAPTER
// =============================================================================

async function executeGeminiAPI(query: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable not set');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: query }] }],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${error}`);
  }

  const data = await response.json() as any;

  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('Unexpected Gemini API response format');
  }

  return data.candidates[0].content.parts[0].text;
}

// =============================================================================
// STUDY RUNNER
// =============================================================================

async function runStudy(
  study: StudyConfig,
  initialSession: BrowserSession,
  batchRunId: string,
  batchSequence: number,
  batchTotal: number,
  allProxies: ProxyConfig[]
): Promise<{ result: StudyResult; finalSession: BrowserSession }> {
  console.log('\n' + '═'.repeat(70));
  console.log(`  STUDY ${study.id.toUpperCase()}: ${study.name}`);
  console.log('═'.repeat(70));

  // Generate run identification
  const run: RunIdentification = {
    runId: generateRunId(),
    parentRunId: batchRunId,
    batchSequence,
    batchTotal,
    initiatedAt: new Date().toISOString(),
    trigger: 'manual',
  };

  console.log(`\n🔖 Run ID: ${run.runId}`);

  let currentSession = initialSession;
  let currentPage = currentSession.page;

  // Get and verify IP info
  console.log('\nVerifying IP address...');
  const { ipInfo, lookupDurationMs } = await getIPInfo(currentPage);
  let ipVerification = verifyIPLocation(ipInfo, study.location, lookupDurationMs);

  // Display IP banner
  console.log(formatIPBanner(ipVerification));

  // Collect warnings
  const studyWarnings: ExecutionWarning[] = [];

  // If IP doesn't match and we have proxies for this location, try to get a better one
  if (!ipVerification.verified && allProxies.length > 0) {
    const betterProxy = getNextProxy(study.location, allProxies);
    if (betterProxy) {
      console.log(`\n🔄 IP mismatch - switching to proxy for ${study.location}...`);
      try {
        currentSession = await createBrowserSession(betterProxy, currentSession, {
          warmUp: true,
          geoLocation: study.geoLocation,
        });
        currentPage = currentSession.page;

        // Re-verify IP
        const { ipInfo: newIpInfo, lookupDurationMs: newLookupMs } = await getIPInfo(currentPage);
        ipVerification = verifyIPLocation(newIpInfo, study.location, newLookupMs);
        console.log(formatIPBanner(ipVerification));

        if (!ipVerification.verified) {
          studyWarnings.push(createWarning(
            'IP_MISMATCH_AFTER_PROXY',
            `IP ${newIpInfo.country} still doesn't match expected ${ipVerification.expectedCountry} after proxy switch`,
            'high',
            undefined,
            { proxy: betterProxy.name, actualCountry: newIpInfo.country }
          ));
        }
      } catch (error) {
        console.error('Failed to switch proxy:', error);
        studyWarnings.push(createWarning(
          'PROXY_SWITCH_FAILED',
          `Failed to switch to proxy ${betterProxy.name}: ${error}`,
          'high'
        ));
      }
    }
  }

  // Warn if IP still doesn't match expected location
  if (!ipVerification.verified) {
    const expected = study.location === 'in-mum' ? 'India (IN)' : 'United States (US)';
    notify(`IP MISMATCH: Expected ${expected} but got ${ipVerification.ipInfo.country}`, true);
    console.log('\n⚠️  WARNING: IP does not match expected location!');
    console.log('    Study results may not reflect intended geographic perspective.');
    console.log('    Continuing in 5 seconds...\n');

    studyWarnings.push(createWarning(
      'IP_MISMATCH',
      `IP country ${ipVerification.ipInfo.country} does not match expected ${ipVerification.expectedCountry}`,
      'high',
      undefined,
      { actualCountry: ipVerification.ipInfo.country, expectedCountry: ipVerification.expectedCountry }
    ));

    await delay(5000);
  }

  const results: QueryResult[] = [];
  const checkpoints: CheckpointInfo[] = [];
  const startTime = new Date();

  // Track consecutive failures and session recoveries
  let consecutiveFailures = 0;
  let sessionRecoveryAttempts = 0;
  let studyAborted = false;
  let abortReason = '';

  let i = 0;
  while (i < QUERIES.length) {
    // Check if we need session recovery (automatic proxy rotation)
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      sessionRecoveryAttempts++;

      if (sessionRecoveryAttempts > MAX_SESSION_RECOVERIES) {
        studyAborted = true;
        abortReason = `Exceeded ${MAX_SESSION_RECOVERIES} session recovery attempts`;
        notify(`ABORTING ${study.id}: ${abortReason}`, true);
        console.log(`\n🛑 STUDY ABORTED: ${abortReason}`);
        break;
      }

      // Save progress before recovery attempt
      const progressCheckpoint: StudyResult = buildStudyResult(
        run, study, ipVerification, startTime, new Date(), results, checkpoints, studyWarnings
      );
      const checkpoint = saveIntermediateResults(study.id + '-pre-recovery-' + sessionRecoveryAttempts, progressCheckpoint);
      checkpoints.push(checkpoint);
      console.log(`\n💾 Progress saved: ${results.length}/${QUERIES.length} queries completed`);

      // Mark current proxy as blocked
      if (currentSession.proxy) {
        markProxyBlocked(currentSession.proxy);
      }

      // Try to get a new proxy
      const newProxy = getNextProxy(study.location, allProxies);

      if (newProxy) {
        console.log(`\n🔄 Session recovery attempt ${sessionRecoveryAttempts}/${MAX_SESSION_RECOVERIES}`);
        console.log(`   Switching to: ${newProxy.name}`);

        try {
          // Create new browser session with different proxy (fresh session ID for new IP)
          currentSession = await createBrowserSession(newProxy, currentSession, {
            warmUp: true,
            geoLocation: study.geoLocation,
          });
          currentPage = currentSession.page;

          // Verify new IP
          console.log('\n🔍 Verifying new IP address...');
          const { ipInfo: newIpInfo, lookupDurationMs: newLookupMs } = await getIPInfo(currentPage);
          const newIpVerification = verifyIPLocation(newIpInfo, study.location, newLookupMs);
          console.log(formatIPBanner(newIpVerification));

          if (newIpInfo.ip === ipVerification.ipInfo.ip) {
            console.log('⚠️  WARNING: IP address has not changed! Proxy may not be working.');
            studyWarnings.push(createWarning(
              'IP_NOT_CHANGED',
              `IP remained ${newIpInfo.ip} after proxy switch to ${newProxy.name}`,
              'high',
              i
            ));
            // Mark this proxy as blocked too since it didn't change IP
            markProxyBlocked(newProxy);
          } else {
            console.log(`✓ IP changed: ${ipVerification.ipInfo.ip} → ${newIpInfo.ip}`);
            // Update IP verification for metadata
            ipVerification = newIpVerification;
          }

          // Reset failure counter and continue
          consecutiveFailures = 0;
          console.log(`\n▶️  Resuming from query ${i + 1}/${QUERIES.length}...`);

          // Add a longer delay before resuming to avoid immediate re-blocking
          console.log('   Waiting 10 seconds before resuming...');
          await delay(10000);

          continue; // Retry the same query with new session

        } catch (error) {
          console.error(`❌ Failed to create new session with proxy ${newProxy.name}:`, error);
          studyWarnings.push(createWarning(
            'PROXY_SESSION_FAILED',
            `Failed to create session with ${newProxy.name}: ${error}`,
            'high',
            i
          ));
          markProxyBlocked(newProxy);
          // Continue to try next recovery attempt
          continue;
        }
      } else {
        // No proxies available - fall back to user prompt
        console.log('\n⚠️  No available proxies for automatic recovery.');

        const shouldContinue = await promptForSessionRecovery(
          `${consecutiveFailures} consecutive failures and no proxies available`,
          sessionRecoveryAttempts
        );

        if (!shouldContinue) {
          studyAborted = true;
          abortReason = 'User chose to abort/skip after session block (no proxies)';
          break;
        }

        // User will have manually changed something - try to reconnect
        const newBrowser = await reconnectToChrome();
        if (newBrowser) {
          // Close our managed browser and switch to CDP
          try { await currentSession.browser.close(); } catch {}
          currentSession = {
            browser: newBrowser,
            context: newBrowser.contexts()[0],
            page: newBrowser.contexts()[0].pages()[0] || await newBrowser.contexts()[0].newPage(),
            proxy: null
          };
          currentPage = currentSession.page;
        }

        // Verify new IP
        const { ipInfo: newIpInfo, lookupDurationMs: newLookupMs } = await getIPInfo(currentPage);
        console.log(formatIPBanner(verifyIPLocation(newIpInfo, study.location, newLookupMs)));

        consecutiveFailures = 0;
        continue;
      }
    }

    const originalQuery = QUERIES[i];
    const submittedQuery = modifyQueryForIndia(originalQuery, study.promptSuffix);

    console.log(`\n[${i + 1}/${QUERIES.length}] ${submittedQuery.slice(0, 60)}...`);

    const queryStart = Date.now();
    const queryWarnings: ExecutionWarning[] = [];

    try {
      let response = '';
      let aiOverview: string | undefined;
      let organicResults: OrganicResult[] | undefined;
      let sources: SourceCitation[] | undefined;

      if (study.surface === 'google-search') {
        // Use SerpAPI if available (more reliable, no CAPTCHA issues)
        if (USE_SERPAPI) {
          const searchResult = await executeGoogleSearchViaSerpAPI(
            submittedQuery,
            study.captureAiOverview,
            study.location
          );
          response = searchResult.response;
          aiOverview = searchResult.aiOverview;
          organicResults = searchResult.organicResults;
          sources = searchResult.sources;

          // Log SerpAPI metadata
          if (searchResult.serpApiMetadata) {
            console.log(`  ✓ SerpAPI: ${searchResult.serpApiMetadata.totalResults || 'N/A'} results (${searchResult.serpApiMetadata.timeTaken?.toFixed(2) || 'N/A'}s)`);
          }
        } else {
          // Fallback to browser-based scraping
          const searchResult = await executeGoogleSearch(
            currentPage,
            submittedQuery,
            study.captureAiOverview,
            study.geoLocation || 'US'
          );
          response = searchResult.response;
          aiOverview = searchResult.aiOverview;
          organicResults = searchResult.organicResults;
          sources = searchResult.sources;

          // Check for empty response (possible undetected CAPTCHA)
          if (response.length === 0 && organicResults && organicResults.length === 0) {
            queryWarnings.push(createWarning(
              'EMPTY_RESPONSE',
              'Response was empty - possible undetected CAPTCHA or blocked page',
              'high',
              i
            ));
            // Treat empty responses as failures to trigger recovery
            throw new Error('Empty response - possible undetected CAPTCHA');
          }
        }

        // Warn if AI overview was expected but not found
        if (study.captureAiOverview && !aiOverview) {
          queryWarnings.push(createWarning(
            'NO_AI_OVERVIEW',
            'AI Overview was expected but not found in response',
            'medium',
            i
          ));
        }
      } else {
        response = await executeGeminiAPI(submittedQuery);
      }

      const durationMs = Date.now() - queryStart;
      const responseSizeBytes = Buffer.byteLength(response, 'utf8');

      results.push({
        queryIndex: i,
        originalQuery,
        submittedQuery,
        response,
        aiOverview,
        organicResults,
        sources,
        timestamp: new Date().toISOString(),
        durationMs,
        success: true,
        warnings: queryWarnings.length > 0 ? queryWarnings : undefined,
        responseSizeBytes,
      });

      // Reset consecutive failures on success
      consecutiveFailures = 0;

      console.log(`  ✓ Done (${durationMs}ms) - ${response.length} chars`);

      // Move to next query
      i++;

    } catch (error) {
      const durationMs = Date.now() - queryStart;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const failure = characterizeFailure(error, 0);
      failure.queryIndex = i;

      // Don't add to results yet if we might retry after recovery
      // Only add if it's a non-recoverable error or we've exhausted retries

      // Track failures
      consecutiveFailures++;

      // Check if this was a CAPTCHA
      const isCaptcha = failure.category === 'captcha_required' ||
                        errorMsg.toLowerCase().includes('captcha') ||
                        errorMsg.toLowerCase().includes('empty response');

      if (isCaptcha) {
        console.log(`  ✗ CAPTCHA/BLOCK DETECTED (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${errorMsg}`);
      } else {
        console.log(`  ✗ Failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${errorMsg} (${failure.category})`);
      }

      // If we haven't hit the recovery threshold, record this failure and move on
      if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
        results.push({
          queryIndex: i,
          originalQuery,
          submittedQuery,
          response: '',
          timestamp: new Date().toISOString(),
          durationMs,
          success: false,
          error: errorMsg,
          failure,
          warnings: queryWarnings.length > 0 ? queryWarnings : undefined,
        });
        i++; // Move to next query
      }
      // If we hit the threshold, the loop will trigger recovery and retry this query
    }

    // Save intermediate results every 5 queries
    if (results.length > 0 && results.length % 5 === 0) {
      const endTime = new Date();
      const intermediate: StudyResult = buildStudyResult(
        run, study, ipVerification, startTime, endTime, results, checkpoints, studyWarnings
      );
      const checkpoint = saveIntermediateResults(study.id, intermediate);
      checkpoints.push(checkpoint);
    }

    // Rate limiting delay - longer and more human-like
    // Base: 4-6 seconds, after failures: 8-12 seconds
    const baseDelay = consecutiveFailures > 0 ? 8000 : 4000;
    const variance = baseDelay * 0.5 * Math.random();
    const delayMs = Math.floor(baseDelay + variance);
    console.log(`   ⏱️  Waiting ${(delayMs / 1000).toFixed(1)}s before next query...`);
    await delay(delayMs);
  }

  // Add warning if study had issues
  if (studyAborted) {
    studyWarnings.push(createWarning(
      'STUDY_ABORTED',
      abortReason,
      'high',
      undefined,
      { sessionRecoveryAttempts, queriesCompleted: results.length, totalQueries: QUERIES.length }
    ));
  } else if (sessionRecoveryAttempts > 0) {
    studyWarnings.push(createWarning(
      'SESSION_RECOVERED',
      `Study completed after ${sessionRecoveryAttempts} session recovery attempts`,
      'medium',
      undefined,
      { sessionRecoveryAttempts }
    ));
  }

  const endTime = new Date();
  const successful = results.filter(r => r.success).length;

  console.log('\n' + '-'.repeat(70));
  if (studyAborted) {
    console.log(`🛑 Study ${study.id} ABORTED: ${successful}/${results.length} successful before abort`);
    console.log(`   Reason: ${abortReason}`);
  } else {
    console.log(`Study ${study.id} complete: ${successful}/${results.length} successful (${Math.round((endTime.getTime() - startTime.getTime()) / 1000)}s)`);
  }

  // Log final IP verification status
  console.log(`\n📍 Study executed from IP: ${ipInfo.ip} (${ipInfo.city}, ${ipInfo.country})`);
  console.log(`   IP Verified: ${ipVerification.verified ? '✓ Yes' : '⚠ No'}`);
  console.log(`   Run ID: ${run.runId}`);

  const result = buildStudyResult(run, study, ipVerification, startTime, endTime, results, checkpoints, studyWarnings);

  // Add abort/recovery metadata
  if (studyAborted) {
    (result as any).aborted = true;
    (result as any).abortReason = abortReason;
  }
  if (sessionRecoveryAttempts > 0) {
    (result as any).sessionRecoveries = sessionRecoveryAttempts;
  }

  return { result, finalSession: currentSession };
}

/**
 * Build the complete study result object with all metadata.
 */
function buildStudyResult(
  run: RunIdentification,
  study: StudyConfig,
  ipVerification: IPVerification,
  startTime: Date,
  endTime: Date,
  results: QueryResult[],
  checkpoints: CheckpointInfo[],
  warnings: ExecutionWarning[]
): StudyResult {
  const durations = results.map(r => r.durationMs);
  const timingStats = calculateTimingStats(durations);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  // Build failure summary if there were failures
  const failures = results.filter(r => r.failure).map(r => r.failure!);
  const failureSummary = failures.length > 0 ? calculateFailureSummary(failures, results.length) : undefined;

  // Collect all warnings from queries
  const allWarnings = [...warnings];
  for (const result of results) {
    if (result.warnings) {
      allWarnings.push(...result.warnings);
    }
  }

  return {
    run,
    study: study.id,
    studyName: study.name,
    surface: study.surface,
    location: study.location,
    expectedLocation: study.location,
    promptSuffix: study.promptSuffix,
    captureAiOverview: study.captureAiOverview,
    timestamp: endTime.toISOString(),
    timing: {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
    },
    ipVerification,
    results,
    summary: {
      total: results.length,
      successful,
      failed,
      avgDurationMs: timingStats.avg,
      medianDurationMs: timingStats.median,
      p95DurationMs: timingStats.p95,
      failureRate: results.length > 0 ? (failed / results.length) * 100 : 0,
    },
    failures: failureSummary ? {
      totalFailures: failureSummary.totalFailures,
      byCategory: failureSummary.byCategory,
      failedQueryIndices: failureSummary.failedQueryIndices,
      failurePattern: failureSummary.failurePattern,
    } : undefined,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    checkpoints: checkpoints.length > 0 ? checkpoints : undefined,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      benthamVersion: '0.0.1', // TODO: Read from package.json
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    schemaVersion: '1.0',
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  let studiesToRun: StudyConfig[] = STUDIES;

  if (args.includes('--gemini')) {
    studiesToRun = STUDIES.filter(s => s.surface === 'google-ai-api');
  } else if (args.includes('--search')) {
    studiesToRun = STUDIES.filter(s => s.surface === 'google-search');
  } else if (args.includes('--ai-overview')) {
    studiesToRun = STUDIES.filter(s => s.surface === 'google-search' && s.captureAiOverview);
  } else if (args.includes('--organic')) {
    studiesToRun = STUDIES.filter(s => s.surface === 'google-search' && !s.captureAiOverview);
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    // Specific study IDs
    const ids = args[0].toLowerCase();
    if (ids.includes('-')) {
      // Range: g01-g04
      const [start, end] = ids.split('-');
      const startNum = parseInt(start.replace('g', ''));
      const endNum = parseInt(end.replace('g', ''));
      studiesToRun = STUDIES.filter(s => {
        const num = parseInt(s.id.replace('g', ''));
        return num >= startNum && num <= endNum;
      });
    } else {
      // Single study
      studiesToRun = STUDIES.filter(s => s.id === ids);
    }
  }

  if (studiesToRun.length === 0) {
    console.error('No studies matched the specified criteria');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Generate batch run ID for correlation
  const batchRunId = generateRunId();
  const batchStartTime = new Date();

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          GOOGLE VISIBILITY STUDY - HUFT BRAND ANALYSIS            ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Batch Run ID: ${batchRunId.slice(0, 36).padEnd(51)}║`);
  console.log(`║  Studies to run: ${studiesToRun.length.toString().padEnd(49)}║`);
  console.log(`║  Queries per study: ${QUERIES.length.toString().padEnd(46)}║`);
  console.log(`║  Total cells: ${(studiesToRun.length * QUERIES.length).toString().padEnd(52)}║`);
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Check for Gemini API key if running API studies
  const hasApiStudies = studiesToRun.some(s => s.surface === 'google-ai-api');
  if (hasApiStudies && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_AI_API_KEY) {
    console.error('\n❌ GEMINI_API_KEY environment variable required for Gemini API studies');
    process.exit(1);
  }

  // Check for SerpAPI
  const hasSearchStudies = studiesToRun.some(s => s.surface === 'google-search');
  if (USE_SERPAPI && hasSearchStudies) {
    console.log('\n🔍 Using SerpAPI for Google Search studies (no CAPTCHA issues!)');
    console.log('   Location targeting handled via SerpAPI parameters');
  }

  // Load proxy configurations (only needed if not using SerpAPI for search)
  const allProxies = loadProxyConfigs();
  if (!USE_SERPAPI) {
    if (allProxies.length > 0) {
      console.log(`\n🌐 Loaded ${allProxies.length} proxy configurations:`);
      for (const proxy of allProxies) {
        console.log(`   - ${proxy.name} (${proxy.location})`);
      }
    } else {
      console.log('\n⚠️  No proxies configured. Set PROXY_IN_1, PROXY_US_1, etc. in .env for automatic rotation.');
      console.log('   Will use direct connection or existing Chrome proxy settings.');
    }
  }

  // Create initial browser session
  // With SerpAPI, we only need a browser for Gemini API studies (for IP verification)
  let currentSession: BrowserSession;

  const needsBrowser = !USE_SERPAPI && hasSearchStudies;
  const hasApiStudiesNeedingBrowser = studiesToRun.some(s => s.surface === 'google-ai-api');

  if (needsBrowser) {
    // Try to find a proxy for the first study's location
    const firstSearchStudy = studiesToRun.find(s => s.surface === 'google-search');
    const initialProxy = firstSearchStudy ? getNextProxy(firstSearchStudy.location, allProxies) : null;

    if (initialProxy) {
      console.log(`\n🌐 Starting with proxy: ${initialProxy.name}`);
      currentSession = await createBrowserSession(initialProxy, undefined, {
        warmUp: true,
        geoLocation: firstSearchStudy?.geoLocation,
      });
    } else {
      // Try to connect to existing Chrome via CDP
      try {
        console.log('\nConnecting to Chrome via CDP...');
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        console.log('✓ Connected to Chrome');
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        currentSession = { browser, context, page, proxy: null };
      } catch (error) {
        console.log('Could not connect to Chrome via CDP, launching new browser...');
        currentSession = await createBrowserSession(null, undefined, {
          warmUp: true,
          geoLocation: firstSearchStudy?.geoLocation,
        });
      }
    }
  } else {
    // Create minimal headless browser for API studies (IP checking) or SerpAPI mode
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    currentSession = { browser, context, page, proxy: null };
  }

  // Run studies
  const allResults: StudyResult[] = [];
  const batchTotal = studiesToRun.length;

  for (let studyIndex = 0; studyIndex < studiesToRun.length; studyIndex++) {
    const study = studiesToRun[studyIndex];
    try {
      const { result, finalSession } = await runStudy(
        study,
        currentSession,
        batchRunId,
        studyIndex + 1,
        batchTotal,
        allProxies
      );
      allResults.push(result);

      // Use the session from previous study (may have been rotated due to blocking)
      currentSession = finalSession;

      // Save individual study result
      const filename = path.join(OUTPUT_DIR, `${study.id}-${study.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`);
      fs.writeFileSync(filename, JSON.stringify(result, null, 2));
      console.log(`\n📁 Saved: ${filename}`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      notify(`Study ${study.id} failed: ${errorMsg}`, true);
      console.error(`\n❌ Study ${study.id} failed: ${errorMsg}`);
    }

    // Pause between studies
    if (studyIndex < studiesToRun.length - 1) {
      console.log('\nPausing 5 seconds before next study...');
      await delay(5000);
    }
  }

  // Close browser session
  try {
    await currentSession.browser.close();
  } catch {
    // Ignore close errors
  }

  // Save combined results with batch metadata
  const batchEndTime = new Date();
  const combinedFilename = path.join(OUTPUT_DIR, 'google-visibility-study-all-results.json');
  const totalQueries = allResults.reduce((sum, r) => sum + r.results.length, 0);
  const totalSuccessful = allResults.reduce((sum, r) => sum + r.summary.successful, 0);
  const totalFailed = allResults.reduce((sum, r) => sum + r.summary.failed, 0);

  fs.writeFileSync(combinedFilename, JSON.stringify({
    // Batch identification
    batchRunId,
    schemaVersion: '1.0',

    // Timing
    timing: {
      startTime: batchStartTime.toISOString(),
      endTime: batchEndTime.toISOString(),
      durationMs: batchEndTime.getTime() - batchStartTime.getTime(),
    },

    // Summary
    summary: {
      studiesRequested: batchTotal,
      studiesCompleted: allResults.length,
      studiesFailed: batchTotal - allResults.length,
      totalQueries,
      successfulQueries: totalSuccessful,
      failedQueries: totalFailed,
      overallSuccessRate: totalQueries > 0 ? (totalSuccessful / totalQueries) * 100 : 0,
    },

    // Environment
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      benthamVersion: '0.0.1',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },

    // Individual study results
    studies: allResults,
  }, null, 2));

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log('                         STUDY COMPLETE');
  console.log('═'.repeat(70));
  console.log(`\n🔖 Batch Run ID: ${batchRunId}`);
  console.log(`📊 Studies completed: ${allResults.length}/${studiesToRun.length}`);
  console.log(`📝 Total queries: ${totalQueries} (${totalSuccessful} success, ${totalFailed} failed)`);
  console.log(`⏱️  Total duration: ${Math.round((batchEndTime.getTime() - batchStartTime.getTime()) / 1000)}s`);
  console.log(`📁 Results saved to: ${OUTPUT_DIR}/`);

  // Summary table
  console.log('\n┌────────┬─────────────────────────────────────────────┬──────────┬─────────┐');
  console.log('│ Study  │ Name                                        │ Success  │ Failed  │');
  console.log('├────────┼─────────────────────────────────────────────┼──────────┼─────────┤');
  for (const result of allResults) {
    const name = result.studyName.slice(0, 43).padEnd(43);
    console.log(`│ ${result.study.padEnd(6)} │ ${name} │ ${result.summary.successful.toString().padStart(8)} │ ${result.summary.failed.toString().padStart(7)} │`);
  }
  console.log('└────────┴─────────────────────────────────────────────┴──────────┴─────────┘');

  notify('Google visibility study complete!', false);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
