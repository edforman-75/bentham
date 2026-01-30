# @bentham/schema-registry

Central hub for product attribute schemas across retailers and categories.

## Overview

The Schema Registry manages product attribute schemas for e-commerce integrations, providing:

- Internal category schemas (apparel, electronics, etc.)
- Retailer-specific schemas (Amazon, Walmart)
- Schema normalization and mapping between internal and retailer formats
- Validation of product data against schemas
- Caching and synchronization of retailer schemas

## Installation

```bash
pnpm add @bentham/schema-registry
```

## Quick Start

```typescript
import { createSchemaRegistry } from '@bentham/schema-registry';

// Create registry with retailer credentials
const registry = createSchemaRegistry({
  amazon: {
    clientId: process.env.AMAZON_CLIENT_ID,
    clientSecret: process.env.AMAZON_CLIENT_SECRET,
  },
  walmart: {
    clientId: process.env.WALMART_CLIENT_ID,
    clientSecret: process.env.WALMART_CLIENT_SECRET,
  },
});

// Get internal schema for a category
const apparelSchema = registry.getCategorySchema('apparel');

// Get required attributes
const required = registry.getRequiredAttributes('apparel');

// Get AI-visible attributes
const aiVisible = registry.getAIVisibleAttributes('apparel');

// Fetch retailer schema
const amazonSchema = await registry.fetchRetailerSchema('amazon', 'SHIRT');

// Compare schemas to find gaps
const comparison = registry.compareSchemas('apparel', amazonSchema);

// Validate product data
const result = registry.validateProduct(productData, 'apparel');
```

## API Reference

### SchemaRegistry

#### Category Methods

- `getCategorySchema(category)` - Get internal schema for a category
- `getAvailableCategories()` - List all available categories
- `getAllCategoryAttributes(category)` - Get all attributes for a category
- `getRequiredAttributes(category)` - Get required attributes only
- `getAttributesByImportance(category, importance)` - Filter by importance level
- `getAIVisibleAttributes(category)` - Get attributes visible to AI systems

#### Retailer Methods

- `fetchRetailerSchema(retailer, productType, options)` - Fetch schema from retailer API
- `listRetailerProductTypes(retailer, marketplaceId)` - List available product types

#### Comparison & Mapping

- `compareSchemas(category, retailerSchema)` - Compare internal vs retailer schemas
- `generateMappingPlan(category, retailer)` - Generate field mapping plan

#### Validation

- `validateProduct(data, category)` - Validate product data against schema

#### Cache

- `clearCache()` - Clear retailer schema cache
- `getCacheStats()` - Get cache statistics

## Testing

```bash
pnpm test
```

## Dependencies

- Amazon SP-API client (optional, for Amazon schema sync)
- Walmart API client (optional, for Walmart schema sync)
