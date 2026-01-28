import { z } from 'zod';

// Surface types
export const SurfaceType = z.enum([
  'openai-api',
  'openai-responses-api',
  'chatgpt-web',
  'gemini-api',
  'google-ai-overview',
  'google-organic',
  'bing-search',
  'perplexity',
  'meta-ai',
  'amazon-search',
  'amazon-rufus',
  'jsonld-pdp',    // Brand site product pages
  'amazon-pdp',    // Amazon product pages
]);

// Brand definition
export const BrandSchema = z.object({
  name: z.string(),
  category: z.enum(['primary', 'competitor']),
  segment: z.string().optional(), // e.g., "running", "boots", "sandals"
  brandSiteUrl: z.string().url(), // Required: where brand sells online
  amazonStoreUrl: z.string().url().optional(), // Amazon brand store if exists
  productScope: z.enum(['all', 'specific']).default('all'), // 'all' = auto-discover, 'specific' = use provided URLs
  productUrls: z.array(z.string().url()).optional(), // Brand site product pages (when scope is 'specific')
  amazonProductUrls: z.array(z.string().url()).optional(), // Amazon product pages (when scope is 'specific')
});

// Query definition
export const QuerySchema = z.object({
  text: z.string(),
  amazonQuery: z.string().optional(), // Short 2-3 word version for Amazon search
  category: z.string(),
  intent: z.enum(['informational', 'commercial', 'navigational', 'transactional']).optional(),
});

// Test definition (surface + location + completion target)
export const TestSchema = z.object({
  surface: SurfaceType,
  country: z.string().optional(), // ISO country code, 'all' for PDP tests
  city: z.string().optional(),
  completionTarget: z.number().min(0).max(100).default(90), // % of queries that must succeed
  note: z.string().optional(),
  type: z.enum(['brand-site', 'amazon', 'ai-surface']).optional(),
});

// Report type enum
export const ReportTypeId = z.enum([
  'ceo-strategic',      // VP/CEO Strategic Report (Deckers-style)
  'competitive-intel',  // Competitive Intelligence Brief
  'technical-audit',    // Technical SEO Audit
]);

// Report configuration
export const ReportConfigSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  clientName: z.string().optional(),
  logoUrl: z.string().optional(),
  reportType: ReportTypeId.default('ceo-strategic'), // Which report template to use
  includeCharts: z.boolean().default(true),
  includeRawData: z.boolean().default(false),
  theme: z.enum(['corporate', 'minimal', 'detailed']).default('corporate'),
});

// Job settings
export const JobSettingsSchema = z.object({
  deadline: z.string().optional(), // ISO date string
  defaultCompletionTarget: z.number().min(0).max(100).default(90),
});

// Execution options (internal)
export const ExecutionOptionsSchema = z.object({
  parallelSurfaces: z.boolean().default(false),
  retryAttempts: z.number().default(3),
  delayBetweenRequests: z.number().default(2000), // ms
  screenshotEnabled: z.boolean().default(true),
  stealthMode: z.boolean().default(true),
});

// Full manifest schema
export const ManifestSchema = z.object({
  // Metadata
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default('1.0'),
  createdAt: z.string().optional(),

  // Study configuration
  brands: z.array(BrandSchema),
  queries: z.array(QuerySchema).default([]),
  tests: z.array(TestSchema).default([]),

  // Output configuration
  outputDir: z.string(),
  report: ReportConfigSchema,

  // Job settings
  job: JobSettingsSchema.optional(),

  // Execution options (internal)
  options: ExecutionOptionsSchema.optional(),
});

// Legacy support: also accept 'surfaces' array and convert
export const LegacyManifestSchema = ManifestSchema.extend({
  surfaces: z.array(z.object({
    name: SurfaceType,
    enabled: z.boolean().default(true),
    config: z.record(z.any()).optional(),
  })).optional(),
  locations: z.array(z.object({
    country: z.string(),
    name: z.string().optional(),
    cities: z.array(z.string()).optional(),
  })).optional(),
});

// Type exports
export type Brand = z.infer<typeof BrandSchema>;
export type Query = z.infer<typeof QuerySchema>;
export type Test = z.infer<typeof TestSchema>;
export type ReportConfig = z.infer<typeof ReportConfigSchema>;
export type JobSettings = z.infer<typeof JobSettingsSchema>;
export type ExecutionOptions = z.infer<typeof ExecutionOptionsSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

// Validation helper with legacy conversion
export function validateManifest(data: unknown): Manifest {
  const parsed = LegacyManifestSchema.parse(data);

  // Convert legacy surfaces/locations to tests if needed
  if (parsed.surfaces && parsed.surfaces.length > 0 && (!parsed.tests || parsed.tests.length === 0)) {
    const locations = parsed.locations || [{ country: 'us', name: 'United States' }];
    const tests: Test[] = [];

    for (const surface of parsed.surfaces) {
      if (surface.enabled) {
        if (surface.name === 'jsonld-pdp') {
          tests.push({
            surface: 'jsonld-pdp',
            type: 'brand-site',
            completionTarget: 90,
          });
        } else {
          for (const location of locations) {
            tests.push({
              surface: surface.name,
              country: location.country,
              completionTarget: 90,
            });
          }
        }
      }
    }

    parsed.tests = tests;
  }

  // Remove legacy fields
  const { surfaces, locations, ...manifest } = parsed;

  return manifest as Manifest;
}

// Create empty manifest template
export function createManifestTemplate(): Manifest {
  return {
    id: `study-${Date.now()}`,
    name: 'New Visibility Study',
    description: '',
    version: '1.0',
    createdAt: new Date().toISOString(),
    brands: [],
    queries: [],
    tests: [],
    outputDir: './results',
    report: {
      title: 'AI Visibility Assessment',
      reportType: 'ceo-strategic',
      theme: 'corporate',
      includeCharts: true,
      includeRawData: false,
    },
    job: {
      defaultCompletionTarget: 90,
    },
    options: {
      parallelSurfaces: false,
      retryAttempts: 3,
      delayBetweenRequests: 2000,
      screenshotEnabled: true,
      stealthMode: true,
    },
  };
}
