#!/usr/bin/env node
/**
 * Marketplace Image Transformer CLI
 *
 * Automatically transforms Shopify product images for Amazon/Walmart.
 * Detects image type (person/product) and applies appropriate rules.
 *
 * Usage:
 *   npx ts-node marketplace-transform.ts --store tascperformance.com --limit 10
 *   npx ts-node marketplace-transform.ts --store tascperformance.com --output ./output
 */

import * as fs from 'fs';
import * as path from 'path';

// Configuration from environment
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'maximusgolden';

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  images: Array<{
    id: number;
    src: string;
    alt: string | null;
    width: number;
    height: number;
  }>;
}

interface ImageAnalysis {
  hasPerson: boolean;
  hasWhiteBackground: boolean;
  aspectRatio: number;
  needsBackgroundRemoval: boolean;
  recommendedTransform: 'standard' | 'edge-to-edge' | 'scale-up';
  confidence: number;
}

interface TransformedImage {
  productTitle: string;
  productHandle: string;
  originalUrl: string;
  amazonUrl: string;
  walmartUrl: string;
  analysis: ImageAnalysis;
  transformation: string;
}

// ============================================
// Image Analysis (Heuristic-based)
// ============================================

function analyzeImageFromUrl(url: string, width: number, height: number): ImageAnalysis {
  const filename = url.toLowerCase();
  const aspectRatio = height / width;

  // Detect if image likely has a person
  const personIndicators = ['front', 'fullbody', 'fb_', 'model', 'lifestyle', 'worn', 'wearing'];
  const productStringIndicators = ['flat', 'product', 'sku', '_only', 'detail'];
  const productRegexIndicators = [/tm\d{3}/, /tw\d{3}/];

  const hasPerson = personIndicators.some(p => filename.includes(p)) &&
    !productStringIndicators.some(p => filename.includes(p)) &&
    !productRegexIndicators.some(r => r.test(filename));

  // Detect if likely has white background (heuristic based on common patterns)
  // Images with gray/colored backgrounds often have certain naming patterns
  const grayBgIndicators = ['polo', 'heather', 'gray', 'grey'];
  const whiteBgIndicators = ['white', 'studio', 'clean'];

  const hasWhiteBackground = !grayBgIndicators.some(p => filename.includes(p)) ||
    whiteBgIndicators.some(p => filename.includes(p));

  // Determine recommended transform
  let recommendedTransform: 'standard' | 'edge-to-edge' | 'scale-up' = 'standard';

  // Edge-to-edge ONLY for polos with gray backgrounds (they look best filling the frame)
  const isPoloProduct = filename.includes('polo');

  if (!hasPerson && !hasWhiteBackground && isPoloProduct) {
    // Polo with gray background - edge-to-edge scaling
    recommendedTransform = 'edge-to-edge';
  } else if (!hasPerson && aspectRatio < 1.2) {
    // Wide product image - scale up to fill frame
    recommendedTransform = 'scale-up';
  }
  // All other products (including non-polo gray backgrounds) use 'standard' - float with white padding

  return {
    hasPerson,
    hasWhiteBackground,
    aspectRatio,
    needsBackgroundRemoval: !hasWhiteBackground && !hasPerson,
    recommendedTransform,
    confidence: 0.7, // Heuristic confidence
  };
}

// ============================================
// Transformation URL Builders
// ============================================

function buildAmazonUrl(sourceUrl: string, analysis: ImageAnalysis): { url: string; transformation: string } {
  const encoded = encodeURIComponent(sourceUrl);
  const W = 1600, H = 1600, Q = 92;

  if (analysis.hasPerson) {
    // Person: center, don't crop head
    const transformation = `w_${W},h_${H},c_pad,g_center,b_auto:border,f_jpg,q_${Q}`;
    return {
      url: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transformation}/${encoded}`,
      transformation: 'c_pad,g_center (person - keep centered)',
    };
  }

  if (analysis.recommendedTransform === 'edge-to-edge') {
    // Edge-to-edge: scale to full width, add small margin, crop
    const scaledHeight = Math.round(W * analysis.aspectRatio);
    const topMargin = 20;
    const padHeight = scaledHeight + topMargin;
    const transformation = `c_scale,w_${W}/c_pad,h_${padHeight},g_south,b_white/c_crop,w_${W},h_${H},g_north,f_jpg,q_${Q}`;
    return {
      url: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transformation}/${encoded}`,
      transformation: 'edge-to-edge (scale full width, 20px top margin)',
    };
  }

  if (analysis.recommendedTransform === 'scale-up') {
    // Scale up product to fill more of frame
    const scaleFactor = 1.4;
    const scaledWidth = Math.round(W * scaleFactor);
    const transformation = `c_scale,w_${scaledWidth}/c_lpad,w_${W},h_${H},g_center,b_auto:border,f_jpg,q_${Q}`;
    return {
      url: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transformation}/${encoded}`,
      transformation: `scale-up ${scaleFactor}x (enlarge product, center)`,
    };
  }

  // Standard: position at bottom with edge sampling
  const transformation = `w_${W},h_${H},c_pad,g_south,b_auto:border,f_jpg,q_${Q}`;
  return {
    url: `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/${transformation}/${encoded}`,
    transformation: 'c_pad,g_south (product - position at bottom)',
  };
}

function buildWalmartUrl(sourceUrl: string, analysis: ImageAnalysis): string {
  const encoded = encodeURIComponent(sourceUrl);
  const W = 2000, H = 2000, Q = 90;

  if (analysis.hasPerson) {
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_${W},h_${H},c_pad,g_center,b_auto:border,f_jpg,q_${Q}/${encoded}`;
  }

  if (analysis.recommendedTransform === 'edge-to-edge') {
    const scaledHeight = Math.round(W * analysis.aspectRatio);
    const topMargin = 25;
    const padHeight = scaledHeight + topMargin;
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/c_scale,w_${W}/c_pad,h_${padHeight},g_south,b_white/c_crop,w_${W},h_${H},g_north,f_jpg,q_${Q}/${encoded}`;
  }

  if (analysis.recommendedTransform === 'scale-up') {
    const scaledWidth = Math.round(W * 1.4);
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/c_scale,w_${scaledWidth}/c_lpad,w_${W},h_${H},g_center,b_auto:border,f_jpg,q_${Q}/${encoded}`;
  }

  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/fetch/w_${W},h_${H},c_pad,g_south,b_auto:border,f_jpg,q_${Q}/${encoded}`;
}

// ============================================
// Image Selection (Choose best image per product)
// ============================================

function selectBestImage(images: ShopifyProduct['images']): ShopifyProduct['images'][0] | null {
  if (images.length === 0) return null;

  // Scoring system for image selection
  const scores = images.map((img, index) => {
    let score = 0;
    const filename = img.src.toLowerCase();

    // Prefer flat lay / product-only shots
    if (/tm\d{3}|tw\d{3}/.test(filename)) score += 10;  // SKU pattern
    if (filename.includes('flat')) score += 8;
    if (filename.includes('product')) score += 8;

    // Deprioritize lifestyle/detail shots
    if (filename.includes('detail')) score -= 10;
    if (filename.includes('lifestyle')) score -= 5;
    if (filename.includes('back')) score -= 3;
    if (filename.includes('side')) score -= 2;

    // Prefer higher resolution
    if (img.width >= 1000) score += 2;
    if (img.width >= 1500) score += 2;

    // Slight preference for first image (usually the main one)
    if (index === 0) score += 1;

    return { img, score };
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  return scores[0].img;
}

// ============================================
// Shopify API
// ============================================

async function fetchShopifyProducts(store: string, limit: number = 10): Promise<ShopifyProduct[]> {
  const url = `https://${store}/products.json?limit=${limit}`;

  console.log(`Fetching products from ${store}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.products || [];
}

// ============================================
// Main Processing
// ============================================

async function processProducts(
  store: string,
  limit: number,
  outputDir?: string
): Promise<TransformedImage[]> {
  const products = await fetchShopifyProducts(store, limit);
  console.log(`Found ${products.length} products\n`);

  const results: TransformedImage[] = [];

  for (const product of products) {
    const bestImage = selectBestImage(product.images);
    if (!bestImage) {
      console.log(`⚠ ${product.title}: No images found, skipping`);
      continue;
    }

    const analysis = analyzeImageFromUrl(bestImage.src, bestImage.width, bestImage.height);
    const amazon = buildAmazonUrl(bestImage.src, analysis);
    const walmartUrl = buildWalmartUrl(bestImage.src, analysis);

    const result: TransformedImage = {
      productTitle: product.title,
      productHandle: product.handle,
      originalUrl: bestImage.src,
      amazonUrl: amazon.url,
      walmartUrl: walmartUrl,
      analysis,
      transformation: amazon.transformation,
    };

    results.push(result);

    // Console output
    const personIcon = analysis.hasPerson ? '👤' : '📦';
    const bgIcon = analysis.hasWhiteBackground ? '⬜' : '🔲';
    console.log(`✓ ${product.title}`);
    console.log(`  ${personIcon} ${analysis.hasPerson ? 'Person' : 'Product only'} | ${bgIcon} ${analysis.hasWhiteBackground ? 'White BG' : 'Gray BG'}`);
    console.log(`  Transform: ${amazon.transformation}`);
    console.log();
  }

  // Save results if output directory specified
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    // Save JSON
    const jsonPath = path.join(outputDir, 'marketplace-images.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Saved JSON to ${jsonPath}`);

    // Save CSV
    const csvPath = path.join(outputDir, 'marketplace-images.csv');
    const csvHeader = 'Product,Handle,Original URL,Amazon URL,Walmart URL,Has Person,White BG,Transform\n';
    const csvRows = results.map(r =>
      `"${r.productTitle}","${r.productHandle}","${r.originalUrl}","${r.amazonUrl}","${r.walmartUrl}",${r.analysis.hasPerson},${r.analysis.hasWhiteBackground},"${r.transformation}"`
    ).join('\n');
    fs.writeFileSync(csvPath, csvHeader + csvRows);
    console.log(`📁 Saved CSV to ${csvPath}`);
  }

  return results;
}

// ============================================
// CLI Entry Point
// ============================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let store = '';
  let limit = 10;
  let outputDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--store' && args[i + 1]) {
      store = args[i + 1].replace(/^https?:\/\//, '').replace(/\/$/, '');
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      console.log(`
Marketplace Image Transformer

Transforms Shopify product images for Amazon/Walmart compliance.

Usage:
  npx ts-node marketplace-transform.ts --store <shopify-store> [options]

Options:
  --store <url>     Shopify store domain (required)
  --limit <n>       Number of products to process (default: 10)
  --output <dir>    Output directory for JSON/CSV results
  --help            Show this help

Examples:
  npx ts-node marketplace-transform.ts --store tascperformance.com
  npx ts-node marketplace-transform.ts --store tascperformance.com --limit 50 --output ./output

Environment Variables:
  CLOUDINARY_CLOUD_NAME   Cloudinary cloud name (default: maximusgolden)
  REMOVEBG_API_KEY        remove.bg API key (for background removal)
`);
      process.exit(0);
    }
  }

  if (!store) {
    console.error('Error: --store is required\n');
    console.error('Usage: npx ts-node marketplace-transform.ts --store <shopify-store>');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('  Marketplace Image Transformer');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Store: ${store}`);
  console.log(`Limit: ${limit} products`);
  console.log(`Cloudinary: ${CLOUDINARY_CLOUD_NAME}`);
  console.log('═══════════════════════════════════════════════════\n');

  try {
    const results = await processProducts(store, limit, outputDir);

    console.log('═══════════════════════════════════════════════════');
    console.log(`  Processed ${results.length} products`);
    console.log('═══════════════════════════════════════════════════');

    // Summary
    const withPerson = results.filter(r => r.analysis.hasPerson).length;
    const needsBgRemoval = results.filter(r => r.analysis.needsBackgroundRemoval).length;

    console.log(`  👤 With person: ${withPerson}`);
    console.log(`  📦 Product only: ${results.length - withPerson}`);
    console.log(`  🔲 Needs remove.bg: ${needsBgRemoval}`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
