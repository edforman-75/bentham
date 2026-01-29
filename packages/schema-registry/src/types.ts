import { z } from 'zod';

// ============================================================================
// MERCHANDISE CATEGORIES
// ============================================================================

export const MerchandiseCategory = z.enum([
  'apparel',
  'footwear',
  'jewelry',
  'watches',
  'grocery',
  'pet_food',
  'pet_supplies',
  'electronics',
  'computers',
  'home_furniture',
  'home_decor',
  'beauty',
  'personal_care',
  'toys',
  'baby',
  'sports',
  'outdoors',
  'automotive',
  'tools',
  'garden',
  'office',
  'books',
  'music',
  'movies',
  'health',
  'supplements',
]);

export type MerchandiseCategory = z.infer<typeof MerchandiseCategory>;

// ============================================================================
// ATTRIBUTE TYPES
// ============================================================================

export const AttributeType = z.enum([
  'string',
  'text', // Long text / HTML
  'number',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'enum', // Single select from list
  'multi_enum', // Multi-select from list
  'url',
  'image_url',
  'dimension', // With unit (e.g., "10 inches")
  'weight', // With unit (e.g., "2.5 lbs")
  'price', // Currency amount
  'percentage',
  'json', // Structured data
  'array', // List of values
]);

export type AttributeType = z.infer<typeof AttributeType>;

// ============================================================================
// VALIDATION RULES
// ============================================================================

export const ValidationRule = z.object({
  type: z.enum([
    'min_length',
    'max_length',
    'min_value',
    'max_value',
    'pattern', // Regex
    'enum_values', // Allowed values list
    'required_if', // Conditional requirement
    'unique',
    'url_format',
    'image_dimensions',
    'file_size',
    'character_set', // e.g., ASCII only
  ]),
  value: z.union([z.string(), z.number(), z.array(z.string()), z.record(z.unknown())]),
  message: z.string().optional(),
});

export type ValidationRule = z.infer<typeof ValidationRule>;

// ============================================================================
// ATTRIBUTE DEFINITION
// ============================================================================

export const AttributeDefinition = z.object({
  // Core identity
  id: z.string(), // Unique identifier within schema
  name: z.string(), // Display name
  description: z.string().optional(),

  // Type information
  type: AttributeType,
  isArray: z.boolean().optional(), // Is this a list of values? (defaults to false)

  // Requirements
  required: z.boolean().optional(), // defaults to false
  requiredFor: z.array(z.string()).optional(), // Required for specific categories/conditions

  // Validation
  validations: z.array(ValidationRule).optional(), // defaults to []
  enumValues: z.array(z.object({
    value: z.string(),
    label: z.string(),
    aliases: z.array(z.string()).optional(), // Alternative spellings/names
  })).optional(),

  // AI Optimization hints
  aiHints: z.object({
    importance: z.enum(['critical', 'high', 'medium', 'low']).optional(),
    searchable: z.boolean().optional(), // Should be indexed for search
    filterable: z.boolean().optional(), // Used in faceted navigation
    aiVisible: z.boolean().optional(), // Exposed to AI systems
    semanticType: z.string().optional(), // e.g., "benefit", "feature", "spec"
  }).optional(),

  // Mapping information
  retailerMappings: z.record(z.string(), z.object({
    fieldName: z.string(),
    fieldPath: z.string().optional(), // JSONPath for nested fields
    transform: z.string().optional(), // Transformation rule name
  })).optional(),
});

export type AttributeDefinition = z.infer<typeof AttributeDefinition>;

// ============================================================================
// CATEGORY SCHEMA
// ============================================================================

export const CategorySchema = z.object({
  category: MerchandiseCategory,
  version: z.string(),
  lastUpdated: z.string().datetime(),

  // Core attributes every product needs
  coreAttributes: z.array(AttributeDefinition),

  // Category-specific attributes
  categoryAttributes: z.array(AttributeDefinition),

  // Variant attributes (size, color, etc.)
  variantAttributes: z.array(AttributeDefinition).optional(),

  // Compliance/regulatory attributes
  complianceAttributes: z.array(AttributeDefinition).optional(),

  // Metadata
  metadata: z.object({
    source: z.string(), // e.g., "amazon_ptd", "walmart_spec", "internal"
    sourceVersion: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
});

export type CategorySchema = z.infer<typeof CategorySchema>;

// ============================================================================
// RETAILER TYPES
// ============================================================================

export const Retailer = z.enum([
  'amazon',
  'walmart',
  'target',
  'shopify',
  'bigcommerce',
  'google_shopping',
  'facebook_commerce',
  'ebay',
  'etsy',
  'wayfair',
  'best_buy',
  'nordstrom',
  'zappos',
  'rei',
  'chewy',
  'petco',
]);

export type Retailer = z.infer<typeof Retailer>;

// ============================================================================
// RETAILER SCHEMA (raw from API)
// ============================================================================

export const RetailerSchema = z.object({
  retailer: Retailer,
  productType: z.string(), // Retailer's product type identifier
  category: MerchandiseCategory.optional(), // Our normalized category
  version: z.string(),
  fetchedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),

  // Raw schema from retailer
  rawSchema: z.unknown(),

  // Parsed attributes
  attributes: z.array(AttributeDefinition),

  // Validation rules specific to retailer
  validationRules: z.array(z.object({
    rule: z.string(),
    fields: z.array(z.string()),
    condition: z.string().optional(),
  })).optional(),
});

export type RetailerSchema = z.infer<typeof RetailerSchema>;

// ============================================================================
// NORMALIZED PRODUCT DATA
// ============================================================================

export const NormalizedProduct = z.object({
  // Identity
  id: z.string(),
  sku: z.string().optional(),
  gtin: z.string().optional(), // UPC/EAN/ISBN
  mpn: z.string().optional(), // Manufacturer Part Number

  // Classification
  category: MerchandiseCategory,
  subcategories: z.array(z.string()).optional(),

  // Core content
  title: z.string(),
  description: z.string(),
  shortDescription: z.string().optional(),
  bulletPoints: z.array(z.string()).optional(),

  // Brand
  brand: z.string(),
  manufacturer: z.string().optional(),

  // Pricing
  price: z.object({
    amount: z.number(),
    currency: z.string(),
    compareAt: z.number().optional(),
  }).optional(),

  // Media
  images: z.array(z.object({
    url: z.string(),
    alt: z.string().optional(),
    type: z.enum(['main', 'variant', 'lifestyle', 'size_chart', 'swatch']).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })),
  videos: z.array(z.object({
    url: z.string(),
    type: z.enum(['product', 'how_to', 'lifestyle']).optional(),
  })).optional(),

  // Category-specific attributes (dynamic)
  attributes: z.record(z.string(), z.unknown()),

  // Variants
  variants: z.array(z.object({
    id: z.string(),
    sku: z.string().optional(),
    attributes: z.record(z.string(), z.unknown()), // e.g., { size: "M", color: "Blue" }
    price: z.object({
      amount: z.number(),
      currency: z.string(),
    }).optional(),
    inventory: z.number().optional(),
    images: z.array(z.string()).optional(), // Image URLs for this variant
  })).optional(),

  // Compliance
  compliance: z.object({
    warnings: z.array(z.string()).optional(),
    certifications: z.array(z.string()).optional(),
    countryOfOrigin: z.string().optional(),
  }).optional(),

  // Metadata
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    source: z.string(),
    sourceId: z.string().optional(),
  }),
});

export type NormalizedProduct = z.infer<typeof NormalizedProduct>;

// ============================================================================
// SCHEMA REGISTRY CONFIGURATION
// ============================================================================

export const SchemaRegistryConfig = z.object({
  // API credentials
  amazon: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    refreshToken: z.string(),
    region: z.enum(['na', 'eu', 'fe']).default('na'),
  }).optional(),

  walmart: z.object({
    clientId: z.string(),
    clientSecret: z.string(),
  }).optional(),

  // Cache settings
  cache: z.object({
    enabled: z.boolean().default(true),
    ttlHours: z.number().default(24),
    storageType: z.enum(['memory', 'file', 'redis']).default('memory'),
    storagePath: z.string().optional(), // For file storage
  }).optional(),

  // Sync settings
  sync: z.object({
    autoSync: z.boolean().default(false),
    syncIntervalHours: z.number().default(24),
  }).optional(),
});

export type SchemaRegistryConfig = z.infer<typeof SchemaRegistryConfig>;
