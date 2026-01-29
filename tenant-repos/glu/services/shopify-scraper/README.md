# Store Scraper Service

Scrapes e-commerce stores to extract product data and generate CSV files for bulk updates.

## Quick Start

```bash
# Scrape a Shopify store (auto-detected)
npx ts-node scrape-store.ts tascperformance.com

# Scrape with options
npx ts-node scrape-store.ts tascperformance.com --output ./data --max-products 100

# Quick scrape (API only, no page rendering)
npx ts-node scrape-store.ts mystore.com --skip-pages
```

## Features

### Platform Support
- **Shopify** - Auto-detected via `/products.json` endpoint
- **BigCommerce** - Via generic scraper
- **WooCommerce** - Via generic scraper
- **Magento** - Via generic scraper
- **Squarespace** - Via generic scraper
- **Any platform** with sitemap.xml

### Data Extracted
- Product titles, descriptions, prices
- Variants with SKUs
- Images with alt text
- JSON-LD schema (Product markup)
- Meta tags (title, description, OG tags)
- Collections/categories

### Output Formats

**For Shopify stores:**
- `<store>-shopify-import-<date>.csv` - Bulk import format
- `<store>-optimization-<date>.csv` - AI visibility recommendations
- `<store>-<date>.json` - Full scrape data

**For other platforms:**
- `<store>-products-<date>.csv` - Generic product CSV
- `<store>-optimization-<date>.csv` - AI visibility recommendations
- `<store>-<date>.json` - Full scrape data

## Programmatic Usage

```typescript
import { scrapeStore } from './scrape-store';

const result = await scrapeStore('tascperformance.com', {
  output: './data',
  maxProducts: 500,
  skipPages: false,
  format: 'both',
});

console.log(`Scraped ${result.stats.productsScraped} products`);
console.log(`Files: ${JSON.stringify(result.files)}`);
```

## Shopify Write-Back

The Shopify import CSV can be used directly in Shopify Admin:
1. Go to Products > Import
2. Upload the generated CSV
3. Select "Overwrite products with matching handles"

## Files

- `index.ts` - Shopify-specific scraper
- `generic-scraper.ts` - Platform-agnostic scraper
- `scrape-store.ts` - Unified CLI with auto-detection
- `types.ts` - Type definitions
