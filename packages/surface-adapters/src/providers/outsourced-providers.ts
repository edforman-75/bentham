/**
 * Outsourced Execution Provider Stubs
 *
 * These are placeholder implementations for outsourced providers.
 * When anti-bot defenses become unbeatable or we need to scale rapidly,
 * implement one of these providers and configure failover.
 *
 * IMPLEMENTATION NEEDED: Build one of these when ready to failover.
 */

import type {
  ExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  ProviderHealthStatus,
} from './execution-provider';

/**
 * ============================================================
 * APIFY EXECUTION PROVIDER
 * ============================================================
 *
 * Apify (https://apify.com) provides:
 * - Pre-built actors for ChatGPT, Perplexity, Google, etc.
 * - Proxy rotation included
 * - Anti-detection built into actors
 *
 * Pricing: $0.25-0.50 per actor run (varies by actor)
 *
 * To implement:
 * 1. npm install apify-client
 * 2. Create actors for each surface or use existing ones
 * 3. Map our ExecutionRequest to Apify actor input
 * 4. Map actor output to our ExecutionResult
 */
export interface ApifyProviderConfig {
  /** Apify API token */
  apiToken: string;
  /** Actor IDs for each surface */
  actorIds: Record<string, string>;
  /** Memory allocation per run (MB) */
  memoryMbytes?: number;
  /** Build to use (latest or specific) */
  build?: string;
}

export class ApifyExecutionProvider implements ExecutionProvider {
  readonly name = 'apify';

  constructor(_config: ApifyProviderConfig) {
    // Implementation needed
  }

  async initialize(): Promise<void> {
    throw new Error(
      'ApifyExecutionProvider not implemented. See outsourced-providers.ts for implementation guide.'
    );
  }

  async shutdown(): Promise<void> {
    throw new Error('Not implemented');
  }

  supportsSurface(_surfaceId: string): boolean {
    throw new Error('Not implemented');
  }

  async execute(_request: ExecutionRequest): Promise<ExecutionResult> {
    throw new Error('Not implemented');
  }

  async getHealth(): Promise<ProviderHealthStatus> {
    throw new Error('Not implemented');
  }

  estimateCost(_request: ExecutionRequest): number {
    // Apify charges ~$0.25-0.50 per actor run
    return 0.35; // Average estimate
  }
}

/**
 * ============================================================
 * BROWSERLESS EXECUTION PROVIDER
 * ============================================================
 *
 * Browserless (https://browserless.io) provides:
 * - Playwright/Puppeteer-compatible API
 * - Cloud browser instances
 * - Stealth mode built-in
 *
 * Pricing: $0.01-0.02 per session
 *
 * To implement:
 * 1. Use Playwright with browserless endpoint
 * 2. Connect via: playwright.chromium.connect(browserlessUrl)
 * 3. Reuse our existing web adapter logic
 * 4. Just swap the browser provider
 */
export interface BrowserlessProviderConfig {
  /** Browserless API key */
  apiKey: string;
  /** Browserless endpoint (default: wss://chrome.browserless.io) */
  endpoint?: string;
  /** Enable stealth mode */
  stealth?: boolean;
  /** Proxy to use (browserless supports proxy-chain) */
  proxy?: string;
}

export class BrowserlessExecutionProvider implements ExecutionProvider {
  readonly name = 'browserless';

  constructor(_config: BrowserlessProviderConfig) {
    // Implementation needed
  }

  async initialize(): Promise<void> {
    throw new Error(
      'BrowserlessExecutionProvider not implemented. See outsourced-providers.ts for implementation guide.'
    );
  }

  async shutdown(): Promise<void> {
    throw new Error('Not implemented');
  }

  supportsSurface(_surfaceId: string): boolean {
    // Browserless supports all web surfaces
    throw new Error('Not implemented');
  }

  async execute(_request: ExecutionRequest): Promise<ExecutionResult> {
    throw new Error('Not implemented');
  }

  async getHealth(): Promise<ProviderHealthStatus> {
    throw new Error('Not implemented');
  }

  estimateCost(_request: ExecutionRequest): number {
    // Browserless charges ~$0.01-0.02 per session
    return 0.015;
  }
}

/**
 * ============================================================
 * BRIGHT DATA SCRAPER EXECUTION PROVIDER
 * ============================================================
 *
 * Bright Data (https://brightdata.com) provides:
 * - Web Scraper IDE with pre-built templates
 * - Scraping Browser (Playwright with anti-detection)
 * - Best-in-class residential proxy network
 *
 * Pricing: $500-2000/mo for scraping, $15-25/GB for proxies
 *
 * To implement:
 * 1. Use Bright Data's Scraping Browser API
 * 2. Or use their Web Scraper IDE for complex surfaces
 * 3. Proxy included in Scraping Browser
 */
export interface BrightDataProviderConfig {
  /** Bright Data customer ID */
  customerId: string;
  /** Bright Data zone password */
  zonePassword: string;
  /** Zone to use (residential, datacenter, etc.) */
  zone: string;
  /** Scraping Browser endpoint */
  scrapingBrowserEndpoint?: string;
}

export class BrightDataExecutionProvider implements ExecutionProvider {
  readonly name = 'brightdata';

  constructor(_config: BrightDataProviderConfig) {
    // Implementation needed
  }

  async initialize(): Promise<void> {
    throw new Error(
      'BrightDataExecutionProvider not implemented. See outsourced-providers.ts for implementation guide.'
    );
  }

  async shutdown(): Promise<void> {
    throw new Error('Not implemented');
  }

  supportsSurface(_surfaceId: string): boolean {
    throw new Error('Not implemented');
  }

  async execute(_request: ExecutionRequest): Promise<ExecutionResult> {
    throw new Error('Not implemented');
  }

  async getHealth(): Promise<ProviderHealthStatus> {
    throw new Error('Not implemented');
  }

  estimateCost(_request: ExecutionRequest): number {
    // Bright Data Scraping Browser: ~$0.05-0.10 per request
    return 0.075;
  }
}

/**
 * ============================================================
 * IMPLEMENTATION CHECKLIST
 * ============================================================
 *
 * When implementing an outsourced provider:
 *
 * 1. [ ] Install provider SDK (npm install apify-client, etc.)
 * 2. [ ] Add API credentials to credential-vault
 * 3. [ ] Implement initialize() - validate credentials, warm up
 * 4. [ ] Implement supportsSurface() - return which surfaces work
 * 5. [ ] Implement execute() - map request/response formats
 * 6. [ ] Implement getHealth() - check API status, quotas
 * 7. [ ] Implement estimateCost() - accurate cost estimation
 * 8. [ ] Add integration tests (test with 100 queries quarterly)
 * 9. [ ] Document surface-specific configuration
 * 10. [ ] Update cost-analysis.html with actual costs
 *
 * Failover activation:
 * 1. Register provider with ExecutionProviderManager
 * 2. Set provider priority per surface
 * 3. Configure failover thresholds
 * 4. Monitor via dashboard
 */
