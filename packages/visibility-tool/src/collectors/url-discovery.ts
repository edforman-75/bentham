/**
 * URL Discovery Module
 * Auto-discovers product page URLs from brand sites and Amazon stores
 */

import { Page } from 'playwright';

export interface DiscoveredProduct {
  url: string;
  name: string;
  source: 'brand-site' | 'amazon';
}

export interface DiscoveryOptions {
  maxProducts: number;
  timeout: number;
}

const DEFAULT_DISCOVERY_OPTIONS: DiscoveryOptions = {
  maxProducts: 50,
  timeout: 30000,
};

/**
 * Common URL patterns that indicate product pages
 */
const PRODUCT_URL_PATTERNS = [
  /\/products?\//i,
  /\/p\//i,
  /\/item\//i,
  /\/shop\/.+\/.+/i,
  /\/collections?\/.+\/.+/i,
  /\/[^/]+-[^/]+\.html$/i,  // product-name.html
  /\/dp\/[A-Z0-9]{10}/i,     // Amazon ASIN pattern
];

/**
 * URL patterns to exclude (not product pages)
 */
const EXCLUDE_PATTERNS = [
  /\/cart/i,
  /\/checkout/i,
  /\/account/i,
  /\/login/i,
  /\/register/i,
  /\/wishlist/i,
  /\/search/i,
  /\/category/i,
  /\/collections?\/?$/i,  // Collection index, not product
  /\/blog/i,
  /\/about/i,
  /\/contact/i,
  /\/faq/i,
  /\/help/i,
  /\/privacy/i,
  /\/terms/i,
  /\/shipping/i,
  /\/returns/i,
];

/**
 * Check if a URL looks like a product page
 */
function isProductUrl(url: string, baseDomain: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be same domain (or subdomain)
    if (!parsed.hostname.includes(baseDomain)) {
      return false;
    }

    // Check exclusion patterns
    for (const pattern of EXCLUDE_PATTERNS) {
      if (pattern.test(url)) {
        return false;
      }
    }

    // Check product patterns
    for (const pattern of PRODUCT_URL_PATTERNS) {
      if (pattern.test(url)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Extract base domain from URL (e.g., "hoka.com" from "https://www.hoka.com/products/...")
 */
function getBaseDomain(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.split('.');
    // Get last two parts (domain.tld)
    return parts.slice(-2).join('.');
  } catch {
    return '';
  }
}

/**
 * Discover product URLs from a brand website
 */
export async function discoverBrandSiteProducts(
  page: Page,
  brandSiteUrl: string,
  options: Partial<DiscoveryOptions> = {}
): Promise<DiscoveredProduct[]> {
  const opts = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  const baseDomain = getBaseDomain(brandSiteUrl);
  const discovered: Map<string, DiscoveredProduct> = new Map();
  const visited: Set<string> = new Set();
  const toVisit: string[] = [brandSiteUrl];

  console.log(`Discovering products from ${brandSiteUrl} (max: ${opts.maxProducts})`);

  while (toVisit.length > 0 && discovered.size < opts.maxProducts) {
    const currentUrl = toVisit.shift()!;

    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      await page.goto(currentUrl, {
        waitUntil: 'domcontentloaded',
        timeout: opts.timeout,
      });

      // Wait for dynamic content
      await page.waitForTimeout(1500);

      // Extract all links from the page
      const links = await page.$$eval('a[href]', (anchors) =>
        anchors.map(a => ({
          url: (a as HTMLAnchorElement).href,
          text: a.textContent?.trim() || '',
        }))
      );

      for (const link of links) {
        if (discovered.size >= opts.maxProducts) break;

        // Normalize URL (remove fragments, trailing slashes)
        let normalizedUrl: string;
        try {
          const parsed = new URL(link.url);
          parsed.hash = '';
          normalizedUrl = parsed.toString().replace(/\/$/, '');
        } catch {
          continue;
        }

        if (discovered.has(normalizedUrl)) continue;

        if (isProductUrl(normalizedUrl, baseDomain)) {
          discovered.set(normalizedUrl, {
            url: normalizedUrl,
            name: link.text || extractProductNameFromUrl(normalizedUrl),
            source: 'brand-site',
          });
          console.log(`  Found: ${normalizedUrl}`);
        } else if (!visited.has(normalizedUrl) && normalizedUrl.includes(baseDomain)) {
          // Add to crawl queue if it's on the same domain
          // Only crawl collection/shop pages to find more products
          if (/\/(shop|collection|products|catalog)/i.test(normalizedUrl)) {
            toVisit.push(normalizedUrl);
          }
        }
      }

      // Small delay between page loads
      await page.waitForTimeout(500);

    } catch (error) {
      console.warn(`Failed to crawl ${currentUrl}:`, error);
    }
  }

  console.log(`Discovered ${discovered.size} products from brand site`);
  return Array.from(discovered.values());
}

/**
 * Discover product URLs from an Amazon brand store
 */
export async function discoverAmazonProducts(
  page: Page,
  amazonStoreUrl: string,
  options: Partial<DiscoveryOptions> = {}
): Promise<DiscoveredProduct[]> {
  const opts = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  const discovered: Map<string, DiscoveredProduct> = new Map();

  console.log(`Discovering products from Amazon store: ${amazonStoreUrl} (max: ${opts.maxProducts})`);

  try {
    await page.goto(amazonStoreUrl, {
      waitUntil: 'domcontentloaded',
      timeout: opts.timeout,
    });

    // Wait for product grid to load
    await page.waitForTimeout(2000);

    // Scroll to load more products (Amazon uses infinite scroll on some stores)
    for (let i = 0; i < 3 && discovered.size < opts.maxProducts; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1000);
    }

    // Extract product links - Amazon store format
    // Products are typically in data-asin attributes or /dp/ASIN links
    const products = await page.$$eval('[data-asin], a[href*="/dp/"]', (elements) => {
      const results: Array<{ asin: string; name: string; url: string }> = [];
      const seenAsins = new Set<string>();

      for (const el of elements) {
        // Try to get ASIN from data attribute
        let asin = el.getAttribute('data-asin') || '';

        // Or from href
        if (!asin) {
          const href = el.getAttribute('href') || '';
          const match = href.match(/\/dp\/([A-Z0-9]{10})/i);
          if (match) asin = match[1];
        }

        if (!asin || asin.length !== 10 || seenAsins.has(asin)) continue;
        seenAsins.add(asin);

        // Try to get product name
        const nameEl = el.querySelector('.p13n-sc-truncate, [class*="product-title"], h2, h3, span[class*="truncate"]');
        const name = nameEl?.textContent?.trim() || '';

        results.push({
          asin,
          name,
          url: `https://www.amazon.com/dp/${asin}`,
        });
      }

      return results;
    });

    for (const product of products) {
      if (discovered.size >= opts.maxProducts) break;

      discovered.set(product.asin, {
        url: product.url,
        name: product.name || `Product ${product.asin}`,
        source: 'amazon',
      });
      console.log(`  Found: ${product.url} - ${product.name || '(unnamed)'}`);
    }

  } catch (error) {
    console.warn(`Failed to discover Amazon products:`, error);
  }

  console.log(`Discovered ${discovered.size} products from Amazon store`);
  return Array.from(discovered.values());
}

/**
 * Extract a human-readable product name from a URL
 */
function extractProductNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;

    // Get the last meaningful segment
    const segments = path.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || '';

    // Remove file extension
    const nameWithoutExt = lastSegment.replace(/\.\w+$/, '');

    // Convert dashes/underscores to spaces and title case
    return nameWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Unknown Product';
  }
}

/**
 * Discover all products for a brand (both brand site and Amazon)
 */
export async function discoverAllProducts(
  page: Page,
  brandSiteUrl?: string,
  amazonStoreUrl?: string,
  options: Partial<DiscoveryOptions> = {}
): Promise<DiscoveredProduct[]> {
  const allProducts: DiscoveredProduct[] = [];

  if (brandSiteUrl) {
    const brandProducts = await discoverBrandSiteProducts(page, brandSiteUrl, options);
    allProducts.push(...brandProducts);
  }

  if (amazonStoreUrl) {
    const amazonProducts = await discoverAmazonProducts(page, amazonStoreUrl, options);
    allProducts.push(...amazonProducts);
  }

  return allProducts;
}
