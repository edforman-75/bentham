import {
  AttributeDefinition,
  CategorySchema,
  MerchandiseCategory,
  Retailer,
  RetailerSchema,
  SchemaRegistryConfig,
} from './types';
import { getCategorySchema, getAvailableCategories } from './categories';
import { AmazonSchemaClient, createAmazonClient } from './clients/amazon-client';
import { WalmartSchemaClient, createWalmartClient } from './clients/walmart-client';

/**
 * Schema Registry - Central hub for product attribute schemas
 *
 * Manages:
 * - Internal category schemas (apparel, electronics, etc.)
 * - Retailer-specific schemas (Amazon, Walmart)
 * - Schema normalization and mapping
 * - Caching and synchronization
 */
export class SchemaRegistry {
  private config: SchemaRegistryConfig;
  private amazonClient?: AmazonSchemaClient;
  private walmartClient?: WalmartSchemaClient;

  // Cache for retailer schemas
  private retailerSchemaCache: Map<string, RetailerSchema> = new Map();

  constructor(config: SchemaRegistryConfig = {}) {
    this.config = config;

    // Initialize retailer clients if credentials provided
    if (config.amazon) {
      this.amazonClient = createAmazonClient(config.amazon);
    }
    if (config.walmart) {
      this.walmartClient = createWalmartClient(config.walmart);
    }
  }

  // ============================================================================
  // INTERNAL SCHEMAS
  // ============================================================================

  /**
   * Get our internal schema for a category
   */
  getCategorySchema(category: MerchandiseCategory): CategorySchema | undefined {
    return getCategorySchema(category);
  }

  /**
   * Get all available internal categories
   */
  getAvailableCategories(): MerchandiseCategory[] {
    return getAvailableCategories();
  }

  /**
   * Get all attributes for a category (core + category-specific + variants)
   */
  getAllCategoryAttributes(category: MerchandiseCategory): AttributeDefinition[] {
    const schema = this.getCategorySchema(category);
    if (!schema) return [];

    return [
      ...schema.coreAttributes,
      ...schema.categoryAttributes,
      ...(schema.variantAttributes || []),
      ...(schema.complianceAttributes || []),
    ];
  }

  /**
   * Get required attributes for a category
   */
  getRequiredAttributes(category: MerchandiseCategory): AttributeDefinition[] {
    return this.getAllCategoryAttributes(category).filter(attr => attr.required);
  }

  /**
   * Get attributes by importance level
   */
  getAttributesByImportance(
    category: MerchandiseCategory,
    importance: 'critical' | 'high' | 'medium' | 'low'
  ): AttributeDefinition[] {
    return this.getAllCategoryAttributes(category).filter(
      attr => attr.aiHints?.importance === importance
    );
  }

  /**
   * Get AI-visible attributes (attributes that should be exposed to AI systems)
   */
  getAIVisibleAttributes(category: MerchandiseCategory): AttributeDefinition[] {
    return this.getAllCategoryAttributes(category).filter(
      attr => attr.aiHints?.aiVisible !== false
    );
  }

  // ============================================================================
  // RETAILER SCHEMAS
  // ============================================================================

  /**
   * Fetch a retailer schema for a product type
   */
  async fetchRetailerSchema(
    retailer: Retailer,
    productType: string,
    options?: {
      marketplaceId?: string;
      category?: MerchandiseCategory;
      forceRefresh?: boolean;
    }
  ): Promise<RetailerSchema> {
    const cacheKey = `${retailer}:${productType}`;

    // Check cache first (unless force refresh)
    if (!options?.forceRefresh && this.config.cache?.enabled !== false) {
      const cached = this.retailerSchemaCache.get(cacheKey);
      if (cached && new Date(cached.expiresAt || 0) > new Date()) {
        return cached;
      }
    }

    let schema: RetailerSchema;

    switch (retailer) {
      case 'amazon':
        if (!this.amazonClient) {
          throw new Error('Amazon client not configured. Provide amazon credentials in config.');
        }
        schema = await this.amazonClient.fetchRetailerSchema(
          productType,
          options?.marketplaceId || 'ATVPDKIKX0DER', // US marketplace default
          options?.category
        );
        break;

      case 'walmart':
        if (!this.walmartClient) {
          throw new Error('Walmart client not configured. Provide walmart credentials in config.');
        }
        schema = await this.walmartClient.fetchRetailerSchema(
          productType,
          options?.category
        );
        break;

      default:
        throw new Error(`Retailer ${retailer} not supported`);
    }

    // Cache the schema
    this.retailerSchemaCache.set(cacheKey, schema);

    return schema;
  }

  /**
   * List available product types for a retailer
   */
  async listRetailerProductTypes(
    retailer: Retailer,
    marketplaceId?: string
  ): Promise<string[]> {
    switch (retailer) {
      case 'amazon':
        if (!this.amazonClient) {
          throw new Error('Amazon client not configured');
        }
        return this.amazonClient.listProductTypes(marketplaceId || 'ATVPDKIKX0DER');

      case 'walmart':
        if (!this.walmartClient) {
          throw new Error('Walmart client not configured');
        }
        return this.walmartClient.listProductTypes();

      default:
        throw new Error(`Retailer ${retailer} not supported`);
    }
  }

  // ============================================================================
  // SCHEMA COMPARISON & MAPPING
  // ============================================================================

  /**
   * Compare internal schema with retailer schema to find gaps
   */
  compareSchemas(
    category: MerchandiseCategory,
    retailerSchema: RetailerSchema
  ): {
    matched: Array<{ internal: AttributeDefinition; retailer: AttributeDefinition }>;
    missingInRetailer: AttributeDefinition[];
    missingInInternal: AttributeDefinition[];
    requirementMismatches: Array<{
      attribute: string;
      internalRequired: boolean;
      retailerRequired: boolean;
    }>;
  } {
    const internalAttrs = this.getAllCategoryAttributes(category);
    const retailerAttrs = retailerSchema.attributes;

    const matched: Array<{ internal: AttributeDefinition; retailer: AttributeDefinition }> = [];
    const missingInRetailer: AttributeDefinition[] = [];
    const missingInInternal: AttributeDefinition[] = [];
    const requirementMismatches: Array<{
      attribute: string;
      internalRequired: boolean;
      retailerRequired: boolean;
    }> = [];

    // Find matches and missing in retailer
    for (const internal of internalAttrs) {
      const mapping = internal.retailerMappings?.[retailerSchema.retailer];
      const retailerAttr = mapping
        ? retailerAttrs.find(r => r.id === mapping.fieldName)
        : retailerAttrs.find(r =>
            r.id.toLowerCase() === internal.id.toLowerCase() ||
            r.name.toLowerCase() === internal.name.toLowerCase()
          );

      if (retailerAttr) {
        matched.push({ internal, retailer: retailerAttr });

        // Check for requirement mismatches
        if ((internal.required ?? false) !== (retailerAttr.required ?? false)) {
          requirementMismatches.push({
            attribute: internal.id,
            internalRequired: internal.required ?? false,
            retailerRequired: retailerAttr.required ?? false,
          });
        }
      } else {
        missingInRetailer.push(internal);
      }
    }

    // Find missing in internal
    for (const retailerAttr of retailerAttrs) {
      const hasMatch = matched.some(m => m.retailer.id === retailerAttr.id);
      if (!hasMatch) {
        missingInInternal.push(retailerAttr);
      }
    }

    return {
      matched,
      missingInRetailer,
      missingInInternal,
      requirementMismatches,
    };
  }

  /**
   * Generate a mapping plan for transforming internal data to retailer format
   */
  generateMappingPlan(
    category: MerchandiseCategory,
    retailer: Retailer
  ): Array<{
    internalField: string;
    retailerField: string;
    transform?: string;
    required: boolean;
  }> {
    const internalAttrs = this.getAllCategoryAttributes(category);
    const plan: Array<{
      internalField: string;
      retailerField: string;
      transform?: string;
      required: boolean;
    }> = [];

    for (const attr of internalAttrs) {
      const mapping = attr.retailerMappings?.[retailer];
      if (mapping) {
        plan.push({
          internalField: attr.id,
          retailerField: mapping.fieldName,
          transform: mapping.transform,
          required: attr.required ?? false,
        });
      }
    }

    return plan;
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate product data against a category schema
   */
  validateProduct(
    data: Record<string, unknown>,
    category: MerchandiseCategory
  ): {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings: Array<{ field: string; message: string }>;
  } {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    const attrs = this.getAllCategoryAttributes(category);

    for (const attr of attrs) {
      const value = data[attr.id];

      // Check required
      if (attr.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: attr.id,
          message: `${attr.name} is required`,
        });
        continue;
      }

      if (value === undefined || value === null) continue;

      // Check validations
      for (const validation of attr.validations || []) {
        switch (validation.type) {
          case 'min_length':
            if (typeof value === 'string' && value.length < (validation.value as number)) {
              errors.push({
                field: attr.id,
                message: validation.message || `${attr.name} must be at least ${validation.value} characters`,
              });
            }
            break;

          case 'max_length':
            if (typeof value === 'string' && value.length > (validation.value as number)) {
              errors.push({
                field: attr.id,
                message: validation.message || `${attr.name} cannot exceed ${validation.value} characters`,
              });
            }
            break;

          case 'min_value':
            if (typeof value === 'number' && value < (validation.value as number)) {
              errors.push({
                field: attr.id,
                message: validation.message || `${attr.name} must be at least ${validation.value}`,
              });
            }
            break;

          case 'max_value':
            if (typeof value === 'number' && value > (validation.value as number)) {
              errors.push({
                field: attr.id,
                message: validation.message || `${attr.name} cannot exceed ${validation.value}`,
              });
            }
            break;

          case 'pattern':
            if (typeof value === 'string' && !new RegExp(validation.value as string).test(value)) {
              errors.push({
                field: attr.id,
                message: validation.message || `${attr.name} format is invalid`,
              });
            }
            break;

          case 'enum_values':
            if (attr.enumValues) {
              const validValues = attr.enumValues.map(e => e.value);
              const checkValue = Array.isArray(value) ? value : [value];
              for (const v of checkValue) {
                if (!validValues.includes(v as string)) {
                  errors.push({
                    field: attr.id,
                    message: `${attr.name} has invalid value: ${v}`,
                  });
                }
              }
            }
            break;
        }
      }

      // AI hints warnings
      if (attr.aiHints?.importance === 'critical' && !value) {
        warnings.push({
          field: attr.id,
          message: `${attr.name} is critical for AI visibility`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Clear the retailer schema cache
   */
  clearCache(): void {
    this.retailerSchemaCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ key: string; expiresAt: string }>;
  } {
    const entries: Array<{ key: string; expiresAt: string }> = [];

    for (const [key, schema] of this.retailerSchemaCache.entries()) {
      entries.push({
        key,
        expiresAt: schema.expiresAt || 'never',
      });
    }

    return {
      size: this.retailerSchemaCache.size,
      entries,
    };
  }
}

/**
 * Create a new schema registry instance
 */
export function createSchemaRegistry(config?: SchemaRegistryConfig): SchemaRegistry {
  return new SchemaRegistry(config);
}
