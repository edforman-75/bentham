/**
 * Metadata Collector
 * Extracts comprehensive metadata from web pages including:
 * - Meta tags (title, description, keywords, robots)
 * - Open Graph tags
 * - Twitter Card tags
 * - JSON-LD structured data
 * - Product-specific data (tags, categories, variants)
 */

import { Page } from 'playwright';
import { extractJsonLd } from './jsonld-collector.js';

/**
 * Standard meta tags
 */
export interface MetaTags {
  title: string | null;
  description: string | null;
  keywords: string | null;
  robots: string | null;
  canonical: string | null;
  author: string | null;
  viewport: string | null;
}

/**
 * Open Graph tags
 */
export interface OpenGraphTags {
  title: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
  type: string | null;
  siteName: string | null;
  locale: string | null;
  /** Price for products */
  'product:price:amount': string | null;
  'product:price:currency': string | null;
}

/**
 * Twitter Card tags
 */
export interface TwitterCardTags {
  card: string | null;
  title: string | null;
  description: string | null;
  image: string | null;
  site: string | null;
  creator: string | null;
}

/**
 * Product-specific metadata (extracted from page content)
 */
export interface ProductMetadata {
  /** Product name/title */
  name: string | null;
  /** Product description */
  description: string | null;
  /** Price */
  price: string | null;
  /** Currency */
  currency: string | null;
  /** SKU or product ID */
  sku: string | null;
  /** Brand name */
  brand: string | null;
  /** Product tags/labels (e.g., Shopify product tags) */
  tags: string[];
  /** Categories/collections */
  categories: string[];
  /** Product variants */
  variants: Array<{
    name: string;
    sku?: string;
    price?: string;
    available?: boolean;
  }>;
  /** Availability status */
  availability: string | null;
  /** Rating info */
  rating: {
    value: number | null;
    count: number | null;
  };
  /** Images */
  images: string[];
}

/**
 * Collection-specific metadata (extracted from page content)
 */
export interface CollectionMetadata {
  /** Collection name/title */
  name: string | null;
  /** Collection description */
  description: string | null;
  /** Number of products in collection */
  productCount: number | null;
  /** Subcategories or filter options */
  subcategories: string[];
  /** Product URLs found in the collection */
  productUrls: string[];
  /** Breadcrumb path */
  breadcrumbs: string[];
  /** Sort/filter options available */
  filters: string[];
}

/**
 * Complete page metadata result
 */
export interface PageMetadataResult {
  url: string;
  timestamp: string;
  success: boolean;
  error?: string;

  /** Page title from <title> tag */
  pageTitle: string;

  /** Standard meta tags */
  metaTags: MetaTags;

  /** Open Graph tags */
  openGraph: OpenGraphTags;

  /** Twitter Card tags */
  twitterCard: TwitterCardTags;

  /** All JSON-LD structured data on the page */
  jsonLd: any[];

  /** Product schema from JSON-LD (if present) */
  productSchema: any | null;

  /** Organization schema from JSON-LD (if present) */
  organizationSchema: any | null;

  /** BreadcrumbList schema from JSON-LD (if present) */
  breadcrumbSchema: any | null;

  /** Extracted product metadata */
  product: ProductMetadata | null;

  /** Extracted collection metadata */
  collection: CollectionMetadata | null;

  /** ItemList/CollectionPage schema from JSON-LD (if present) */
  collectionSchema: any | null;

  /** Page type detection */
  pageType: 'product' | 'collection' | 'article' | 'homepage' | 'other';

  /** Platform detection */
  platform: 'shopify' | 'bigcommerce' | 'woocommerce' | 'magento' | 'custom' | 'unknown';
}

/**
 * Extract all meta tags from the page
 */
async function extractMetaTags(page: Page): Promise<MetaTags> {
  return page.evaluate(() => {
    const getMeta = (name: string): string | null => {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el?.getAttribute('content') || null;
    };

    const canonical = document.querySelector('link[rel="canonical"]');

    return {
      title: document.title || null,
      description: getMeta('description'),
      keywords: getMeta('keywords'),
      robots: getMeta('robots'),
      canonical: canonical?.getAttribute('href') || null,
      author: getMeta('author'),
      viewport: getMeta('viewport'),
    };
  });
}

/**
 * Extract Open Graph tags from the page
 */
async function extractOpenGraphTags(page: Page): Promise<OpenGraphTags> {
  return page.evaluate(() => {
    const getOg = (property: string): string | null => {
      const el = document.querySelector(`meta[property="og:${property}"]`);
      return el?.getAttribute('content') || null;
    };

    return {
      title: getOg('title'),
      description: getOg('description'),
      image: getOg('image'),
      url: getOg('url'),
      type: getOg('type'),
      siteName: getOg('site_name'),
      locale: getOg('locale'),
      'product:price:amount': document.querySelector('meta[property="product:price:amount"]')?.getAttribute('content') || null,
      'product:price:currency': document.querySelector('meta[property="product:price:currency"]')?.getAttribute('content') || null,
    };
  });
}

/**
 * Extract Twitter Card tags from the page
 */
async function extractTwitterCardTags(page: Page): Promise<TwitterCardTags> {
  return page.evaluate(() => {
    const getTwitter = (name: string): string | null => {
      const el = document.querySelector(`meta[name="twitter:${name}"], meta[property="twitter:${name}"]`);
      return el?.getAttribute('content') || null;
    };

    return {
      card: getTwitter('card'),
      title: getTwitter('title'),
      description: getTwitter('description'),
      image: getTwitter('image'),
      site: getTwitter('site'),
      creator: getTwitter('creator'),
    };
  });
}

/**
 * Detect the page type based on URL, content, and metadata
 */
async function detectPageType(page: Page, jsonLd: any[]): Promise<PageMetadataResult['pageType']> {
  // Check JSON-LD first
  const hasProduct = jsonLd.some(item =>
    item['@type'] === 'Product' ||
    (Array.isArray(item['@type']) && item['@type'].includes('Product'))
  );
  if (hasProduct) return 'product';

  const hasCollection = jsonLd.some(item =>
    item['@type'] === 'CollectionPage' ||
    item['@type'] === 'ItemList'
  );
  if (hasCollection) return 'collection';

  const hasArticle = jsonLd.some(item =>
    item['@type'] === 'Article' ||
    item['@type'] === 'BlogPosting' ||
    item['@type'] === 'NewsArticle'
  );
  if (hasArticle) return 'article';

  // Check URL patterns
  const url = page.url().toLowerCase();
  if (url.includes('/products/') || url.includes('/product/') || url.includes('/p/')) {
    return 'product';
  }
  if (url.includes('/collections/') || url.includes('/category/') || url.includes('/c/')) {
    return 'collection';
  }
  if (url.includes('/blog/') || url.includes('/article/') || url.includes('/news/')) {
    return 'article';
  }

  // Check if it's homepage
  const path = new URL(page.url()).pathname;
  if (path === '/' || path === '') {
    return 'homepage';
  }

  return 'other';
}

/**
 * Detect the ecommerce platform
 */
async function detectPlatform(page: Page): Promise<PageMetadataResult['platform']> {
  return page.evaluate(() => {
    // Shopify detection
    if (
      (window as any).Shopify ||
      document.querySelector('script[src*="cdn.shopify.com"]') ||
      document.querySelector('link[href*="cdn.shopify.com"]')
    ) {
      return 'shopify';
    }

    // BigCommerce detection
    if (
      (window as any).BCData ||
      document.querySelector('script[src*="bigcommerce.com"]')
    ) {
      return 'bigcommerce';
    }

    // WooCommerce detection
    if (
      document.body.classList.contains('woocommerce') ||
      document.querySelector('.woocommerce') ||
      document.querySelector('script[src*="woocommerce"]')
    ) {
      return 'woocommerce';
    }

    // Magento detection
    if (
      (window as any).Mage ||
      document.querySelector('script[src*="mage/"]') ||
      document.body.classList.contains('cms-index-index')
    ) {
      return 'magento';
    }

    // Check for common ecommerce indicators
    if (
      document.querySelector('[data-product-id]') ||
      document.querySelector('.product-page') ||
      document.querySelector('#product-template')
    ) {
      return 'custom';
    }

    return 'unknown';
  });
}

/**
 * Extract product-specific metadata from the page
 */
async function extractProductMetadata(
  page: Page,
  jsonLd: any[],
  platform: PageMetadataResult['platform']
): Promise<ProductMetadata | null> {
  // First try to get data from JSON-LD
  const productSchema = jsonLd.find(item =>
    item['@type'] === 'Product' ||
    (Array.isArray(item['@type']) && item['@type'].includes('Product'))
  );

  // Extract from DOM
  const domData = await page.evaluate((platformType) => {
    const result: any = {
      tags: [] as string[],
      categories: [] as string[],
      variants: [] as any[],
      images: [] as string[],
    };

    // Get product name
    result.name = document.querySelector('h1')?.textContent?.trim() ||
      document.querySelector('[data-product-title]')?.textContent?.trim() ||
      null;

    // Get product description
    result.description =
      document.querySelector('[data-product-description]')?.textContent?.trim() ||
      document.querySelector('.product-description')?.textContent?.trim() ||
      document.querySelector('[itemprop="description"]')?.textContent?.trim() ||
      null;

    // Get price
    const priceEl = document.querySelector('[data-product-price], .product-price, [itemprop="price"]');
    result.price = priceEl?.textContent?.trim()?.replace(/[^\d.,]/g, '') || null;

    // Get currency
    result.currency = document.querySelector('[itemprop="priceCurrency"]')?.getAttribute('content') || null;

    // Get SKU
    result.sku =
      document.querySelector('[data-product-sku], [itemprop="sku"]')?.textContent?.trim() ||
      document.querySelector('[data-product-id]')?.getAttribute('data-product-id') ||
      null;

    // Platform-specific tag extraction
    if (platformType === 'shopify') {
      // Shopify stores product data in window.ShopifyAnalytics or meta tags
      const shopifyMeta = document.querySelector('meta[property="product:tag"]');
      if (shopifyMeta) {
        result.tags = [shopifyMeta.getAttribute('content')!];
      }

      // Get all product tags from meta
      document.querySelectorAll('meta[property="product:tag"]').forEach(el => {
        const tag = el.getAttribute('content');
        if (tag && !result.tags.includes(tag)) {
          result.tags.push(tag);
        }
      });

      // Get collection/category from breadcrumbs or URL
      const breadcrumbs = document.querySelectorAll('.breadcrumb a, nav[aria-label="Breadcrumb"] a');
      breadcrumbs.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text !== 'Home' && !result.categories.includes(text)) {
          result.categories.push(text);
        }
      });
    }

    // Get images
    document.querySelectorAll('[data-product-image], .product-image img, [itemprop="image"]').forEach(el => {
      const src = el.getAttribute('src') || el.getAttribute('data-src');
      if (src && !result.images.includes(src)) {
        result.images.push(src);
      }
    });

    // Get availability
    const availabilityEl = document.querySelector('[itemprop="availability"]');
    result.availability = availabilityEl?.getAttribute('href')?.replace('https://schema.org/', '') ||
      availabilityEl?.textContent?.trim() ||
      null;

    return result;
  }, platform);

  // Merge JSON-LD data with DOM data
  if (!productSchema && !domData.name) {
    return null;
  }

  return {
    name: productSchema?.name || domData.name,
    description: productSchema?.description || domData.description,
    price: productSchema?.offers?.price?.toString() || domData.price,
    currency: productSchema?.offers?.priceCurrency || domData.currency,
    sku: productSchema?.sku || domData.sku,
    brand: productSchema?.brand?.name || productSchema?.brand || null,
    tags: domData.tags,
    categories: domData.categories,
    variants: productSchema?.hasVariant?.map((v: any) => ({
      name: v.name,
      sku: v.sku,
      price: v.offers?.price?.toString(),
      available: v.offers?.availability?.includes('InStock'),
    })) || domData.variants,
    availability: productSchema?.offers?.availability?.replace('https://schema.org/', '') || domData.availability,
    rating: {
      value: productSchema?.aggregateRating?.ratingValue || null,
      count: productSchema?.aggregateRating?.reviewCount || null,
    },
    images: productSchema?.image ?
      (Array.isArray(productSchema.image) ? productSchema.image : [productSchema.image]) :
      domData.images,
  };
}

/**
 * Extract collection-specific metadata from the page
 */
async function extractCollectionMetadata(
  page: Page,
  jsonLd: any[],
): Promise<CollectionMetadata | null> {
  // Get ItemList or CollectionPage schema
  const collectionSchema = jsonLd.find(item =>
    item['@type'] === 'ItemList' ||
    item['@type'] === 'CollectionPage' ||
    (Array.isArray(item['@type']) && (item['@type'].includes('ItemList') || item['@type'].includes('CollectionPage')))
  );

  // Extract from DOM
  const domData = await page.evaluate(() => {
    const result: any = {
      subcategories: [] as string[],
      productUrls: [] as string[],
      breadcrumbs: [] as string[],
      filters: [] as string[],
    };

    // Get collection name from h1 or title
    result.name = document.querySelector('h1')?.textContent?.trim() ||
      document.querySelector('[data-collection-title]')?.textContent?.trim() ||
      null;

    // Get collection description
    result.description =
      document.querySelector('[data-collection-description]')?.textContent?.trim() ||
      document.querySelector('.collection-description')?.textContent?.trim() ||
      document.querySelector('.category-description')?.textContent?.trim() ||
      null;

    // Count products (look for product grid items)
    const productElements = document.querySelectorAll(
      '[data-product-id], .product-card, .product-item, .product-grid-item, [class*="ProductCard"], [class*="product-card"]'
    );
    result.productCount = productElements.length || null;

    // Extract product URLs from the collection
    document.querySelectorAll('a[href*="/products/"], a[href*="/product/"], a[href*="/p/"]').forEach(link => {
      const href = (link as HTMLAnchorElement).href;
      if (href && !result.productUrls.includes(href)) {
        result.productUrls.push(href);
      }
    });

    // Get subcategories (links within the collection that lead to other collections)
    document.querySelectorAll('.subcategory a, .sub-collection a, [data-subcategory] a, .category-nav a').forEach(link => {
      const text = link.textContent?.trim();
      if (text && !result.subcategories.includes(text)) {
        result.subcategories.push(text);
      }
    });

    // Get breadcrumbs
    document.querySelectorAll('.breadcrumb a, nav[aria-label="Breadcrumb"] a, [class*="breadcrumb"] a').forEach(el => {
      const text = el.textContent?.trim();
      if (text && !result.breadcrumbs.includes(text)) {
        result.breadcrumbs.push(text);
      }
    });

    // Get available filters
    document.querySelectorAll('.filter-option, [data-filter], .facet-option, [class*="filter"] label, [class*="Filter"] label').forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length < 50 && !result.filters.includes(text)) {
        result.filters.push(text);
      }
    });

    return result;
  });

  // If no collection data found, return null
  if (!collectionSchema && !domData.name && domData.productUrls.length === 0) {
    return null;
  }

  // Get product count from ItemList if available
  const schemaProductCount = collectionSchema?.numberOfItems ||
    collectionSchema?.itemListElement?.length ||
    null;

  return {
    name: collectionSchema?.name || domData.name,
    description: collectionSchema?.description || domData.description,
    productCount: schemaProductCount || domData.productCount,
    subcategories: domData.subcategories,
    productUrls: domData.productUrls.slice(0, 50), // Limit to first 50
    breadcrumbs: domData.breadcrumbs,
    filters: domData.filters,
  };
}

/**
 * Extract complete metadata from a page
 */
export async function extractPageMetadata(page: Page, url?: string): Promise<PageMetadataResult> {
  const timestamp = new Date().toISOString();
  const pageUrl = url || page.url();

  try {
    // Extract all data in parallel where possible
    const [metaTags, openGraph, twitterCard, jsonLd] = await Promise.all([
      extractMetaTags(page),
      extractOpenGraphTags(page),
      extractTwitterCardTags(page),
      extractJsonLd(page),
    ]);

    const platform = await detectPlatform(page);
    const pageType = await detectPageType(page, jsonLd);

    // Extract schemas
    const productSchema = jsonLd.find(item =>
      item['@type'] === 'Product' ||
      (Array.isArray(item['@type']) && item['@type'].includes('Product'))
    ) || null;

    const organizationSchema = jsonLd.find(item =>
      item['@type'] === 'Organization' ||
      (Array.isArray(item['@type']) && item['@type'].includes('Organization'))
    ) || null;

    const breadcrumbSchema = jsonLd.find(item =>
      item['@type'] === 'BreadcrumbList'
    ) || null;

    const collectionSchema = jsonLd.find(item =>
      item['@type'] === 'ItemList' ||
      item['@type'] === 'CollectionPage' ||
      (Array.isArray(item['@type']) && (item['@type'].includes('ItemList') || item['@type'].includes('CollectionPage')))
    ) || null;

    // Extract product metadata if it's a product page
    const product = pageType === 'product'
      ? await extractProductMetadata(page, jsonLd, platform)
      : null;

    // Extract collection metadata if it's a collection page
    const collection = pageType === 'collection'
      ? await extractCollectionMetadata(page, jsonLd)
      : null;

    return {
      url: pageUrl,
      timestamp,
      success: true,
      pageTitle: metaTags.title || '',
      metaTags,
      openGraph,
      twitterCard,
      jsonLd,
      productSchema,
      organizationSchema,
      breadcrumbSchema,
      collectionSchema,
      product,
      collection,
      pageType,
      platform,
    };

  } catch (error) {
    return {
      url: pageUrl,
      timestamp,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      pageTitle: '',
      metaTags: {
        title: null, description: null, keywords: null, robots: null,
        canonical: null, author: null, viewport: null,
      },
      openGraph: {
        title: null, description: null, image: null, url: null,
        type: null, siteName: null, locale: null,
        'product:price:amount': null, 'product:price:currency': null,
      },
      twitterCard: {
        card: null, title: null, description: null, image: null, site: null, creator: null,
      },
      jsonLd: [],
      productSchema: null,
      organizationSchema: null,
      breadcrumbSchema: null,
      collectionSchema: null,
      product: null,
      collection: null,
      pageType: 'other',
      platform: 'unknown',
    };
  }
}

/**
 * Calculate a metadata completeness score
 */
export function scoreMetadataCompleteness(metadata: PageMetadataResult): {
  score: number;
  breakdown: {
    metaTags: number;
    openGraph: number;
    twitterCard: number;
    structuredData: number;
    productData: number;
  };
  missing: string[];
} {
  const missing: string[] = [];
  let metaScore = 0;
  let ogScore = 0;
  let twitterScore = 0;
  let structuredScore = 0;
  let productScore = 0;

  // Meta tags (25 points max)
  if (metadata.metaTags.title) metaScore += 10;
  else missing.push('meta title');

  if (metadata.metaTags.description) metaScore += 10;
  else missing.push('meta description');

  if (metadata.metaTags.canonical) metaScore += 5;
  else missing.push('canonical URL');

  // Open Graph (25 points max)
  if (metadata.openGraph.title) ogScore += 7;
  else missing.push('og:title');

  if (metadata.openGraph.description) ogScore += 7;
  else missing.push('og:description');

  if (metadata.openGraph.image) ogScore += 7;
  else missing.push('og:image');

  if (metadata.openGraph.type) ogScore += 4;

  // Twitter Card (15 points max)
  if (metadata.twitterCard.card) twitterScore += 5;
  if (metadata.twitterCard.title) twitterScore += 5;
  if (metadata.twitterCard.image) twitterScore += 5;

  // Structured Data (20 points max)
  if (metadata.jsonLd.length > 0) structuredScore += 5;
  else missing.push('JSON-LD structured data');

  if (metadata.productSchema) structuredScore += 10;
  else if (metadata.pageType === 'product') missing.push('Product schema');

  if (metadata.organizationSchema) structuredScore += 3;
  if (metadata.breadcrumbSchema) structuredScore += 2;

  // Product Data (15 points max, only for product pages)
  if (metadata.pageType === 'product' && metadata.product) {
    if (metadata.product.name) productScore += 3;
    if (metadata.product.description) productScore += 3;
    if (metadata.product.price) productScore += 3;
    if (metadata.product.images.length > 0) productScore += 3;
    if (metadata.product.rating.value) productScore += 3;
  } else if (metadata.pageType !== 'product') {
    // Non-product pages get full product score
    productScore = 15;
  }

  const score = Math.min(100, metaScore + ogScore + twitterScore + structuredScore + productScore);

  return {
    score,
    breakdown: {
      metaTags: metaScore,
      openGraph: ogScore,
      twitterCard: twitterScore,
      structuredData: structuredScore,
      productData: productScore,
    },
    missing,
  };
}
