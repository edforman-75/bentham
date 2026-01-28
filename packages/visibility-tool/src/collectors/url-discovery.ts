/**
 * URL Discovery Module
 * Auto-discovers product page URLs from brand sites and Amazon stores
 */

import { Page } from 'playwright';

export interface DiscoveredProduct {
  url: string;
  name: string;
  source: 'brand-site' | 'amazon' | 'walmart' | 'flipkart';
  /** Product ID on the marketplace (ASIN, SKU, etc.) */
  productId?: string;
  /** Price if available */
  price?: string;
  /** Rating if available */
  rating?: string;
}

export interface DiscoveryOptions {
  maxProducts: number;
  timeout: number;
}

/**
 * Amazon regional domains
 */
export type AmazonRegion = 'us' | 'in' | 'uk' | 'de' | 'fr' | 'es' | 'it' | 'ca' | 'jp' | 'au';

export const AMAZON_DOMAINS: Record<AmazonRegion, string> = {
  us: 'amazon.com',
  in: 'amazon.in',
  uk: 'amazon.co.uk',
  de: 'amazon.de',
  fr: 'amazon.fr',
  es: 'amazon.es',
  it: 'amazon.it',
  ca: 'amazon.ca',
  jp: 'amazon.co.jp',
  au: 'amazon.com.au',
};

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
 * Extract Amazon domain from URL (supports all regional sites)
 */
function getAmazonDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'amazon.com';
  }
}

/**
 * Detect Amazon region from URL
 */
export function detectAmazonRegion(url: string): AmazonRegion | null {
  const domain = getAmazonDomain(url);
  for (const [region, regionDomain] of Object.entries(AMAZON_DOMAINS)) {
    if (domain === regionDomain || domain === `www.${regionDomain}`) {
      return region as AmazonRegion;
    }
  }
  return null;
}

/**
 * Discover product URLs from an Amazon brand store
 * Supports all Amazon regional sites (US, India, UK, etc.)
 */
export async function discoverAmazonProducts(
  page: Page,
  amazonStoreUrl: string,
  options: Partial<DiscoveryOptions> = {}
): Promise<DiscoveredProduct[]> {
  const opts = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  const discovered: Map<string, DiscoveredProduct> = new Map();
  const amazonDomain = getAmazonDomain(amazonStoreUrl);
  const region = detectAmazonRegion(amazonStoreUrl);

  console.log(`Discovering products from Amazon (${region || 'unknown region'}): ${amazonStoreUrl} (max: ${opts.maxProducts})`);

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
      const results: Array<{ asin: string; name: string; price?: string; rating?: string }> = [];
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

        // Try to get price
        const priceEl = el.querySelector('.a-price .a-offscreen, [class*="price"]');
        const price = priceEl?.textContent?.trim() || undefined;

        // Try to get rating
        const ratingEl = el.querySelector('.a-icon-star-small, [class*="star"]');
        const rating = ratingEl?.getAttribute('aria-label') || ratingEl?.textContent?.trim() || undefined;

        results.push({
          asin,
          name,
          price,
          rating,
        });
      }

      return results;
    });

    for (const product of products) {
      if (discovered.size >= opts.maxProducts) break;

      const productUrl = `https://www.${amazonDomain}/dp/${product.asin}`;
      discovered.set(product.asin, {
        url: productUrl,
        name: product.name || `Product ${product.asin}`,
        source: 'amazon',
        productId: product.asin,
        price: product.price,
        rating: product.rating,
      });
      console.log(`  Found: ${productUrl} - ${product.name || '(unnamed)'}`);
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
 * Discover product URLs from a Walmart brand/search page
 */
export async function discoverWalmartProducts(
  page: Page,
  walmartUrl: string,
  options: Partial<DiscoveryOptions> = {}
): Promise<DiscoveredProduct[]> {
  const opts = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  const discovered: Map<string, DiscoveredProduct> = new Map();

  console.log(`Discovering products from Walmart: ${walmartUrl} (max: ${opts.maxProducts})`);

  try {
    await page.goto(walmartUrl, {
      waitUntil: 'domcontentloaded',
      timeout: opts.timeout,
    });

    // Wait for product grid to load
    await page.waitForTimeout(2000);

    // Scroll to load more products
    for (let i = 0; i < 3 && discovered.size < opts.maxProducts; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1000);
    }

    // Extract product links from Walmart
    // Walmart product URLs follow pattern: /ip/product-name/product-id
    const products = await page.$$eval('a[href*="/ip/"]', (elements) => {
      const results: Array<{ productId: string; name: string; url: string; price?: string; rating?: string }> = [];
      const seenIds = new Set<string>();

      for (const el of elements) {
        const href = (el as HTMLAnchorElement).href;
        // Extract product ID from URL (last segment after /ip/)
        const match = href.match(/\/ip\/[^/]+\/(\d+)/);
        if (!match) continue;

        const productId = match[1];
        if (seenIds.has(productId)) continue;
        seenIds.add(productId);

        // Try to get product name
        const productCard = el.closest('[data-item-id], [data-testid="list-view"]') || el;
        const nameEl = productCard.querySelector('[data-automation-id="product-title"], span[class*="truncate"], h3, h2');
        const name = nameEl?.textContent?.trim() || '';

        // Try to get price
        const priceEl = productCard.querySelector('[data-automation-id="product-price"], [class*="price"]');
        const price = priceEl?.textContent?.trim() || undefined;

        // Try to get rating
        const ratingEl = productCard.querySelector('[class*="rating"], [aria-label*="star"]');
        const rating = ratingEl?.getAttribute('aria-label') || ratingEl?.textContent?.trim() || undefined;

        results.push({
          productId,
          name,
          url: `https://www.walmart.com/ip/${productId}`,
          price,
          rating,
        });
      }

      return results;
    });

    for (const product of products) {
      if (discovered.size >= opts.maxProducts) break;

      discovered.set(product.productId, {
        url: product.url,
        name: product.name || `Product ${product.productId}`,
        source: 'walmart',
        productId: product.productId,
        price: product.price,
        rating: product.rating,
      });
      console.log(`  Found: ${product.url} - ${product.name || '(unnamed)'}`);
    }

  } catch (error) {
    console.warn(`Failed to discover Walmart products:`, error);
  }

  console.log(`Discovered ${discovered.size} products from Walmart`);
  return Array.from(discovered.values());
}

/**
 * Discover product URLs from a Flipkart brand/search page
 *
 * IMPORTANT: Flipkart is India's primary e-commerce platform.
 * - Accessible from US but may have limited functionality
 * - For production use, recommend India-based proxy/VPN
 * - Interface selectors based on Indian locale
 * - Prices are in INR
 */
export async function discoverFlipkartProducts(
  page: Page,
  flipkartUrl: string,
  options: Partial<DiscoveryOptions> = {}
): Promise<DiscoveredProduct[]> {
  const opts = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
  const discovered: Map<string, DiscoveredProduct> = new Map();

  console.log(`Discovering products from Flipkart: ${flipkartUrl} (max: ${opts.maxProducts})`);

  try {
    await page.goto(flipkartUrl, {
      waitUntil: 'domcontentloaded',
      timeout: opts.timeout,
    });

    // Wait for product grid to load
    await page.waitForTimeout(2000);

    // Scroll to load more products
    for (let i = 0; i < 3 && discovered.size < opts.maxProducts; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1000);
    }

    // Extract product links from Flipkart
    // Flipkart product URLs follow pattern: /product-name/p/itm... with pid parameter
    const products = await page.$$eval('a[href*="/p/itm"]', (elements) => {
      const results: Array<{ productId: string; name: string; url: string; price?: string; rating?: string }> = [];
      const seenIds = new Set<string>();

      for (const el of elements) {
        const href = (el as HTMLAnchorElement).href;
        // Extract product ID from URL
        const pidMatch = href.match(/pid=([A-Z0-9]+)/i) || href.match(/\/p\/(itm[A-Z0-9]+)/i);
        if (!pidMatch) continue;

        const productId = pidMatch[1];
        if (seenIds.has(productId)) continue;
        seenIds.add(productId);

        // Try to get product name
        const productCard = el.closest('[data-id], ._1AtVbE, ._4ddWXP') || el;
        const nameEl = productCard.querySelector('._4rR01T, .s1Q9rs, ._2WkVRV, [class*="title"]');
        const name = nameEl?.textContent?.trim() || '';

        // Try to get price
        const priceEl = productCard.querySelector('._30jeq3, ._1_WHN1');
        const price = priceEl?.textContent?.trim() || undefined;

        // Try to get rating
        const ratingEl = productCard.querySelector('._3LWZlK, [class*="rating"]');
        const rating = ratingEl?.textContent?.trim() || undefined;

        // Construct clean URL
        const urlObj = new URL(href);
        const cleanUrl = `${urlObj.origin}${urlObj.pathname}?pid=${productId}`;

        results.push({
          productId,
          name,
          url: cleanUrl,
          price,
          rating,
        });
      }

      return results;
    });

    for (const product of products) {
      if (discovered.size >= opts.maxProducts) break;

      discovered.set(product.productId, {
        url: product.url,
        name: product.name || `Product ${product.productId}`,
        source: 'flipkart',
        productId: product.productId,
        price: product.price,
        rating: product.rating,
      });
      console.log(`  Found: ${product.url} - ${product.name || '(unnamed)'}`);
    }

  } catch (error) {
    console.warn(`Failed to discover Flipkart products:`, error);
  }

  console.log(`Discovered ${discovered.size} products from Flipkart`);
  return Array.from(discovered.values());
}

/**
 * Options for discovering products across all marketplaces
 */
export interface AllProductsOptions extends Partial<DiscoveryOptions> {
  brandSiteUrl?: string;
  amazonStoreUrl?: string;
  walmartUrl?: string;
  flipkartUrl?: string;
}

/**
 * Discover all products for a brand across all supported marketplaces
 */
export async function discoverAllProducts(
  page: Page,
  brandSiteUrl?: string,
  amazonStoreUrl?: string,
  options?: Partial<DiscoveryOptions>
): Promise<DiscoveredProduct[]>;

export async function discoverAllProducts(
  page: Page,
  options: AllProductsOptions
): Promise<DiscoveredProduct[]>;

export async function discoverAllProducts(
  page: Page,
  brandSiteUrlOrOptions?: string | AllProductsOptions,
  amazonStoreUrl?: string,
  options?: Partial<DiscoveryOptions>
): Promise<DiscoveredProduct[]> {
  const allProducts: DiscoveredProduct[] = [];

  // Handle both call signatures
  let opts: AllProductsOptions;
  if (typeof brandSiteUrlOrOptions === 'object') {
    opts = brandSiteUrlOrOptions;
  } else {
    opts = {
      ...(options || {}),
      brandSiteUrl: brandSiteUrlOrOptions,
      amazonStoreUrl,
    };
  }

  if (opts.brandSiteUrl) {
    const brandProducts = await discoverBrandSiteProducts(page, opts.brandSiteUrl, opts);
    allProducts.push(...brandProducts);
  }

  if (opts.amazonStoreUrl) {
    const amazonProducts = await discoverAmazonProducts(page, opts.amazonStoreUrl, opts);
    allProducts.push(...amazonProducts);
  }

  if (opts.walmartUrl) {
    const walmartProducts = await discoverWalmartProducts(page, opts.walmartUrl, opts);
    allProducts.push(...walmartProducts);
  }

  if (opts.flipkartUrl) {
    const flipkartProducts = await discoverFlipkartProducts(page, opts.flipkartUrl, opts);
    allProducts.push(...flipkartProducts);
  }

  return allProducts;
}
