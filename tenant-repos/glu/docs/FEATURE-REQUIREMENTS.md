# Glu Feature Requirements & Data Specifications

**Last Updated:** January 28, 2026
**Status:** Planning

**Cross-Reference:** [Bentham Enhancement Roadmap](https://bentham-strategy-docs-archive.netlify.app/reports/bentham-enhancement-roadmap.html)

---

## Existing Bentham Infrastructure (Already Built)

The following collectors and capabilities already exist in `/packages/visibility-tool/src/collectors/`:

| Collector | Purpose | Status |
|-----------|---------|--------|
| `citation-collector.ts` | Extract citations from AI responses (Perplexity, Google) | **Ready** |
| `reachability-collector.ts` | LLM reachability audit (raw HTML vs rendered, robots.txt) | **Ready** |
| `ai-files-collector.ts` | Discover llms.txt, robots.txt | **Ready** |
| `site-crawler.ts` | Full site crawling | **Ready** |
| `metadata-collector.ts` | Page metadata extraction | **Ready** |
| `ai-referral-collector.ts` | AI referral traffic tracking | **Ready** |
| `url-discovery.ts` | Product URL discovery | **Ready** |
| `jsonld-collector.ts` | JSON-LD schema extraction | **Ready** |
| `serpapi-collector.ts` | Google/Bing search with AI Overview | **Ready** |
| `chatgpt-collector.ts` | ChatGPT Web queries | **Ready** |
| `copilot-collector.ts` | Microsoft Copilot queries | **Ready** |
| `ai-surfaces-collector.ts` | Multi-surface query execution | **Ready** |
| `oxylabs-collector.ts` | Amazon, Walmart, Google scraping | **Ready** |

---

## Architecture Context

```
┌─────────────────────────────────────────────────────────────┐
│                        GLU (Tenant Layer)                    │
│  - User workflows, optimization, analysis, reporting         │
│  - PDP optimization, brand tone, consistency checking        │
│  - Shopify/BigCommerce integrations                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BENTHAM (Core Platform)                   │
│  - Multi-surface query execution                            │
│  - Evidence capture, cost tracking, audit logging           │
│  - Surface adapters (ChatGPT, Google, Perplexity, etc.)     │
└─────────────────────────────────────────────────────────────┘
```

---

# BENTHAM ROADMAP FEATURES (from Enhancement Roadmap)

## R1. Discovery Scan

**Summary:** Run vertical template queries before client input to surface all brands AI mentions in the category.

### Layer
- **Bentham:** Query execution
- **Glu:** Template management, results analysis

### Data Requirements

```typescript
interface DiscoveryScan {
  id: string;
  tenantId: string;

  // Configuration
  vertical: string;              // "pet food", "activewear", "skincare"
  region: string;                // "US", "IN", "UK"

  // Template queries (pre-defined per vertical)
  templateQueries: {
    query: string;
    category: string;            // "best", "comparison", "how-to"
    intent: string;
  }[];

  // Results
  discoveredBrands: {
    brand: string;
    mentionCount: number;
    surfaces: string[];
    averagePosition: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    suggestedAsCompetitor: boolean;
  }[];

  // For client onboarding
  suggestedCompetitors: string[];
  suggestedQueries: string[];

  status: 'running' | 'complete' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

interface VerticalTemplate {
  id: string;
  vertical: string;
  queries: {
    text: string;
    category: string;
    variables?: string[];        // Placeholders like "{brand}"
  }[];
  commonBrands: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Dependencies
- Existing: `ai-surfaces-collector.ts`
- New: Vertical template library
- New: Brand extraction service

---

## R2. Dual-Path Content Ingestion

**Summary:** Support both public site scraping AND client-provided API access for content ingestion.

### Layer
- **Bentham:** Scraping (existing)
- **Manifest Interpreter:** Platform API access

### Data Requirements

```typescript
interface ContentIngestionConfig {
  tenantId: string;
  brandId: string;

  // Path selection
  ingestionPath: 'scrape' | 'api' | 'hybrid';

  // Scrape config (Path 1)
  scrapeConfig?: {
    websiteUrl: string;
    crawlDepth: number;
    includePatterns: string[];
    excludePatterns: string[];
    respectRobotsTxt: boolean;
  };

  // API config (Path 2)
  apiConfig?: {
    platform: 'shopify' | 'bigcommerce' | 'woocommerce' | 'custom';
    credentials: {
      apiKey?: string;
      accessToken?: string;
      storeUrl?: string;
    };
    syncScope: {
      products: boolean;
      collections: boolean;
      pages: boolean;
      blogs: boolean;
    };
  };

  // Hybrid config
  hybridConfig?: {
    useApiFor: string[];         // ['products', 'collections']
    useScrapeFor: string[];      // ['blogs', 'landing_pages']
  };

  lastSyncAt?: Date;
  status: 'active' | 'error' | 'disconnected';
}
```

### Dependencies
- Existing: `site-crawler.ts`, `url-discovery.ts`
- New: Platform API connectors (Manifest Interpreter layer)

---

## R3. Prioritization Framework

**Summary:** Gap-based ranking executable from command line. Score and prioritize optimization opportunities.

### Layer
- **Glu:** Scoring and prioritization logic

### Data Requirements

```typescript
interface PrioritizationResult {
  tenantId: string;
  brandId: string;

  // Scored items
  products: PrioritizedProduct[];
  collections: PrioritizedCollection[];

  // Scoring methodology
  methodology: {
    factors: {
      factor: string;            // "ai_visibility_gap", "revenue_impact", "competitive_threat"
      weight: number;
    }[];
    normalizedTo: number;        // 100
  };

  createdAt: Date;
}

interface PrioritizedProduct {
  productId: string;
  title: string;

  // Scores
  priorityScore: number;         // 0-100
  rank: number;

  // Contributing factors
  factors: {
    aiVisibilityGap: number;     // How much below target
    revenueImpact: number;       // Sales potential
    competitiveGap: number;      // vs competitors
    contentQuality: number;      // Current content score
    lastOptimized: Date | null;
  };

  // Recommendation
  recommendedAction: 'optimize_now' | 'optimize_soon' | 'monitor' | 'skip';
  estimatedImpact: string;
}

interface PrioritizedCollection {
  collectionId: string;
  title: string;
  priorityScore: number;
  productCount: number;
  averageProductScore: number;
}
```

### Dependencies
- Existing: Study results, product data
- New: Scoring algorithm service

---

## R4. Multi-Format Output

**Summary:** Transform Bentham JSON output into plain text, diff, HTML with CSS per target.

### Layer
- **Glu:** Output transformation

### Data Requirements

```typescript
interface OutputFormat {
  format: 'json' | 'plain_text' | 'diff' | 'html' | 'markdown' | 'csv' | 'excel';

  // Format-specific options
  options?: {
    // For HTML
    cssTheme?: string;           // Client's theme
    includeCharts?: boolean;

    // For diff
    diffStyle?: 'unified' | 'side_by_side';

    // For Excel
    includeCharts?: boolean;
    sheetNames?: string[];
  };
}

interface OutputTransformation {
  inputData: object;             // Bentham JSON
  targetFormat: OutputFormat;
  result: string | Buffer;
  metadata: {
    generatedAt: Date;
    inputSize: number;
    outputSize: number;
  };
}

interface ThemeConfig {
  tenantId: string;
  cssUrl?: string;               // Extracted from Shopify theme
  brandColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  fontFamily: string;
  logoUrl?: string;
}
```

### Dependencies
- Existing: Bentham JSON output
- New: Template engine (Handlebars, EJS, etc.)
- New: Theme extraction service

---

## R5. llms.txt Auto-Generation

**Summary:** Generate llms.txt content from site crawl data.

### Layer
- **Bentham:** Discovery (`ai-files-collector.ts`)
- **Glu:** Generation

### Data Requirements

```typescript
interface LlmsTxtGeneration {
  tenantId: string;
  brandId: string;

  // Source data
  sourceData: {
    siteUrl: string;
    crawledPages: number;
    extractedContent: {
      brandName: string;
      brandDescription: string;
      products: { name: string; description: string; url: string }[];
      collections: { name: string; description: string; url: string }[];
      keyPages: { title: string; url: string; type: string }[];
    };
  };

  // Generated content
  generatedLlmsTxt: string;

  // Sections
  sections: {
    brandOverview: string;
    productCatalog: string;
    keyPages: string;
    contactInfo: string;
    restrictedContent?: string;
  };

  // Status
  status: 'draft' | 'approved' | 'published';
  publishedUrl?: string;         // e.g., https://brand.com/llms.txt
  createdAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
}
```

### Dependencies
- Existing: `ai-files-collector.ts`, `site-crawler.ts`
- New: llms.txt generation prompts
- Integration: Shopify Files API for upload

---

## R6. Tag State Extraction

**Summary:** Capture current tags/settings for before/after comparison.

### Layer
- **Glu:** State capture and comparison

### Data Requirements

```typescript
interface TagStateSnapshot {
  tenantId: string;
  brandId: string;
  snapshotId: string;

  capturedAt: Date;
  captureReason: 'manual' | 'pre_optimization' | 'scheduled';

  // Product tags
  products: {
    productId: string;
    title: string;
    tags: string[];
    productType: string;
    vendor: string;
    collections: string[];
  }[];

  // Collection info
  collections: {
    collectionId: string;
    title: string;
    productCount: number;
    rules?: object[];
  }[];

  // Summary
  summary: {
    totalProducts: number;
    totalTags: number;
    uniqueTags: string[];
    tagFrequency: Record<string, number>;
  };
}

interface TagStateComparison {
  beforeSnapshot: string;        // snapshotId
  afterSnapshot: string;

  changes: {
    tagsAdded: { productId: string; tags: string[] }[];
    tagsRemoved: { productId: string; tags: string[] }[];
    collectionsChanged: { productId: string; before: string[]; after: string[] }[];
  };

  summary: {
    productsChanged: number;
    tagsAdded: number;
    tagsRemoved: number;
    netTagChange: number;
  };
}
```

### Dependencies
- Integration: Shopify Admin API (products, collections)
- New: Snapshot storage

---

## R7. Review Citation Tracking

**Summary:** Monitor which reviews AI cites; recommend linking positive reviews.

### Layer
- **Bentham:** Citation extraction
- **Glu:** Review analysis

### Data Requirements

```typescript
interface ReviewCitationAnalysis {
  tenantId: string;
  brandId: string;
  studyId: string;

  // Cited reviews
  citedReviews: {
    sourceUrl: string;
    platform: string;            // "trustpilot", "reddit", "amazon"
    sentiment: 'positive' | 'neutral' | 'negative';
    citedBy: string[];           // AI surfaces
    citedInPrompts: string[];
    reviewSnippet: string;
    reviewRating?: number;
  }[];

  // Analysis
  analysis: {
    totalReviewsCited: number;
    sentimentBreakdown: Record<string, number>;
    platformBreakdown: Record<string, number>;

    // Concerns
    negativeCitations: number;
    outdatedCitations: number;
  };

  // Recommendations
  recommendations: {
    action: 'promote_review' | 'respond_to_negative' | 'request_removal' | 'create_content';
    targetUrl: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
  }[];
}
```

### Dependencies
- Existing: `citation-collector.ts`
- New: Review sentiment analysis
- New: Review platform detection

---

## R8. Staged Content Review (Human-in-the-Loop)

**Summary:** No content is published to client systems without explicit human approval.

### Layer
- **Glu:** Approval workflow

### Data Requirements

```typescript
interface StagedContent {
  id: string;
  tenantId: string;

  // Content
  contentType: 'product' | 'collection' | 'page' | 'llms_txt';
  contentId: string;             // productId, collectionId, etc.
  contentTitle: string;

  // Changes
  originalContent: object;
  proposedContent: object;
  diffSummary: string;

  // Source
  source: 'optimization' | 'bulk_action' | 'ai_generation' | 'manual';
  sourceJobId?: string;

  // Approval workflow
  status: 'pending' | 'approved' | 'rejected' | 'published' | 'expired';
  createdAt: Date;
  expiresAt?: Date;              // Auto-expire if not acted on

  // Approval
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;

  // Publication
  publishedAt?: Date;
  publishedTo?: string[];        // ['shopify', 'amazon']
  publishError?: string;
}

interface ApprovalQueue {
  tenantId: string;

  pending: StagedContent[];
  recentlyApproved: StagedContent[];
  recentlyRejected: StagedContent[];

  stats: {
    pendingCount: number;
    avgTimeToApproval: number;   // minutes
    approvalRate: number;        // percentage
    topRejectionReasons: string[];
  };
}
```

### Dependencies
- New: Approval workflow service
- New: Notification service for approvers
- Integration: Platform APIs for publishing

---

## R9. New Product AI-Readiness Workflow

**Summary:** Analyze new products via webhook triggers, generate content, stage for review.

### Layer
- **Manifest Interpreter:** Webhook listener
- **Glu:** Content generation, staging

### Data Requirements

```typescript
interface NewProductWorkflow {
  id: string;
  tenantId: string;

  // Trigger
  trigger: {
    source: 'webhook' | 'manual' | 'scheduled';
    webhookEventId?: string;
    platform: string;
  };

  // Product
  productId: string;
  productTitle: string;
  productData: object;           // Raw product data from platform

  // Workflow steps
  steps: {
    step: 'analyze' | 'generate' | 'stage' | 'review' | 'publish';
    status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
    startedAt?: Date;
    completedAt?: Date;
    result?: object;
    error?: string;
  }[];

  // Generated content
  generatedContent?: {
    title: string;
    description: string;
    bulletPoints: string[];
    metaDescription: string;
    altTexts: Record<string, string>;
    tags: string[];
    jsonLd: object;
  };

  // AI readiness assessment
  aiReadinessScore?: {
    overall: number;
    factors: {
      contentCompleteness: number;
      schemaMarkup: number;
      keywordOptimization: number;
      competitivePosition: number;
    };
  };

  status: 'in_progress' | 'awaiting_review' | 'published' | 'failed';
  createdAt: Date;
}

interface WebhookConfig {
  tenantId: string;
  platform: 'shopify' | 'bigcommerce';
  webhookUrl: string;
  secret: string;

  // Events to listen for
  events: {
    'products/create': boolean;
    'products/update': boolean;
    'collections/create': boolean;
    'collections/update': boolean;
  };

  status: 'active' | 'inactive';
}
```

### Dependencies
- New: Webhook listener service
- Existing: Content generation
- Existing: Staged content workflow

---

## R10. AI Citation A/B Testing

**Summary:** Run before/after studies to measure impact of content changes on AI citations.

### Layer
- **Bentham:** Study execution
- **Glu:** Comparison analysis

### Data Requirements

```typescript
interface CitationABTest {
  id: string;
  tenantId: string;
  brandId: string;

  // Test configuration
  testName: string;
  hypothesis: string;

  // Content change
  changeDescription: string;
  affectedProducts: string[];
  changeType: 'title' | 'description' | 'schema' | 'claims' | 'multiple';

  // Studies
  beforeStudy: {
    studyId: string;
    runAt: Date;
    results: {
      citationCount: number;
      citationsByUrl: Record<string, number>;
      visibility: number;
    };
  };

  afterStudy?: {
    studyId: string;
    runAt: Date;
    results: {
      citationCount: number;
      citationsByUrl: Record<string, number>;
      visibility: number;
    };
  };

  // Analysis
  comparison?: {
    citationChange: number;      // +/- count
    citationChangePercent: number;
    visibilityChange: number;
    statisticalSignificance: number;
    conclusion: string;
  };

  status: 'before_pending' | 'change_pending' | 'after_pending' | 'complete';
  createdAt: Date;
}
```

### Dependencies
- Existing: Bentham study execution
- Existing: `citation-collector.ts`
- New: Statistical analysis service

---

## R11. AI Referral Traffic Correlation

**Summary:** Link Bentham visibility data to GA4 referral traffic.

### Layer
- **Glu:** Analytics correlation

### Data Requirements

```typescript
interface TrafficCorrelation {
  tenantId: string;
  brandId: string;
  periodStart: Date;
  periodEnd: Date;

  // Visibility data (from Bentham)
  visibility: {
    studyId: string;
    overallScore: number;
    bySurface: Record<string, number>;
    byProduct: Record<string, number>;
  };

  // Traffic data (from GA4)
  traffic: {
    totalSessions: number;
    aiReferralSessions: number;
    aiReferralBreakdown: {
      source: string;            // "chatgpt", "perplexity", "google-ai"
      sessions: number;
      pageviews: number;
      avgSessionDuration: number;
      bounceRate: number;
      conversions: number;
      revenue: number;
    }[];
  };

  // Correlation analysis
  correlation: {
    visibilityToTraffic: number; // Correlation coefficient
    visibilityToRevenue: number;
    lagDays: number;             // How many days visibility leads traffic
    confidence: number;
  };

  // Insights
  insights: {
    insight: string;
    supportingData: string;
    recommendation: string;
  }[];
}

interface GA4Integration {
  tenantId: string;

  // Connection
  propertyId: string;
  credentials: object;           // OAuth tokens

  // Sync config
  syncFrequency: 'daily' | 'weekly';
  metricsToSync: string[];
  dimensionsToSync: string[];

  lastSyncAt?: Date;
  status: 'active' | 'error' | 'disconnected';
}
```

### Dependencies
- Existing: `ai-referral-collector.ts`
- New: GA4 API integration
- New: Correlation analysis service

---

## R12. Trend Analysis

**Summary:** Scheduled monitoring with change highlights and alert flags.

### Layer
- **Bentham:** Scheduled studies
- **Glu:** Trend detection, alerts

### Data Requirements

```typescript
interface TrendAnalysis {
  tenantId: string;
  brandId: string;

  // Time series
  dataPoints: {
    date: Date;
    studyId: string;
    visibility: number;
    bySurface: Record<string, number>;
    byCompetitor: Record<string, number>;
  }[];

  // Trends
  trends: {
    metric: string;
    direction: 'up' | 'down' | 'stable';
    changePercent: number;
    period: string;              // "7d", "30d", "90d"
    significance: 'significant' | 'minor' | 'noise';
  }[];

  // Alerts triggered
  alerts: {
    alertType: 'visibility_drop' | 'competitor_gain' | 'new_competitor' | 'citation_loss';
    triggeredAt: Date;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    acknowledged: boolean;
  }[];

  // Highlights
  highlights: {
    type: 'improvement' | 'decline' | 'anomaly';
    description: string;
    affectedMetric: string;
    change: number;
  }[];
}

interface TrendAlertConfig {
  tenantId: string;

  alerts: {
    alertType: string;
    threshold: number;
    period: string;
    enabled: boolean;
    notifyChannels: ('email' | 'slack' | 'dashboard')[];
  }[];
}
```

### Dependencies
- Existing: Bentham scheduler
- Existing: Study results storage
- New: Trend detection algorithm
- New: Alert dispatch service

---

## R13. Content Performance Metrics

**Summary:** Track citation frequency by URL and content type.

### Layer
- **Glu:** Performance tracking

### Data Requirements

```typescript
interface ContentPerformance {
  tenantId: string;
  brandId: string;
  period: { start: Date; end: Date };

  // By URL
  byUrl: {
    url: string;
    pageType: 'product' | 'collection' | 'blog' | 'page';
    title: string;

    metrics: {
      citationCount: number;
      citedBySurfaces: string[];
      citedInPrompts: string[];
      sentiment: 'positive' | 'neutral' | 'negative';
      trend: 'up' | 'down' | 'stable';
    };
  }[];

  // By content type
  byContentType: {
    contentType: string;
    totalCitations: number;
    avgCitationsPerPage: number;
    topPerformers: string[];
    underperformers: string[];
  }[];

  // Recommendations
  recommendations: {
    url: string;
    currentPerformance: string;
    recommendation: string;
    expectedImpact: string;
  }[];
}
```

### Dependencies
- Existing: `citation-collector.ts`
- New: URL performance tracking
- New: Content type classification

---

## R14. Walmart & Flipkart AI Adapters

**Summary:** Surface marketplace AI monitoring alongside Amazon Rufus.

### Layer
- **Bentham:** New surface adapters

### Data Requirements

```typescript
interface MarketplaceAISurface {
  marketplace: 'amazon' | 'walmart' | 'flipkart';
  region: string;

  // Capabilities
  capabilities: {
    productSearch: boolean;
    aiAssistant: boolean;        // Rufus, Walmart AI, Flipkart AI
    productRecommendations: boolean;
  };

  // Query execution
  queryResult: {
    query: string;
    response: string;
    productsMentioned: {
      productId: string;
      title: string;
      brand: string;
      position: number;
    }[];
    brandMentions: {
      brand: string;
      count: number;
      sentiment: string;
    }[];
  };
}
```

### Dependencies
- Existing: `oxylabs-collector.ts` (Amazon)
- New: Walmart AI surface adapter
- New: Flipkart AI surface adapter

---

## R15. Near-Me Query Optimization

**Summary:** Optimize for "near me" and local queries. Requires retailer location data.

### Layer
- **Glu:** Location optimization

### Data Requirements

```typescript
interface NearMeOptimization {
  tenantId: string;
  brandId: string;

  // Retailer locations
  retailers: {
    retailerId: string;
    name: string;
    locations: {
      locationId: string;
      address: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
      coordinates: { lat: number; lng: number };
      productsCarried: string[];
    }[];
  }[];

  // Local visibility analysis
  localVisibility: {
    city: string;
    state: string;
    queries: string[];           // "dog food near me", "{brand} stores in {city}"
    visibility: number;
    competitorVisibility: Record<string, number>;
  }[];

  // Recommendations
  recommendations: {
    action: 'add_to_google_business' | 'update_store_locator' | 'create_local_content';
    location: string;
    rationale: string;
    expectedImpact: string;
  }[];
}

interface RetailerDataImport {
  tenantId: string;

  // Import source
  source: 'csv' | 'api' | 'manual';
  sourceFile?: string;
  sourceApi?: string;

  // Mapping
  fieldMapping: {
    retailerName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    productsCarried?: string;
  };

  lastImportAt?: Date;
  importedCount: number;
}
```

### Dependencies
- New: Retailer data import service
- New: Local query templates
- New: Store locator integration

---

# FEATURE IMPROVEMENTS + BACKLOG

## 1. Schedule Optimization (Auto-Scoring Alerts)

**Summary:** Platform auto-detects visibility score drops and alerts user. User can automate optimization cycles based on scoring thresholds.

### Layer
- **Bentham:** Scheduled study execution (already exists in `apps/scheduler`)
- **Glu:** Scoring logic, threshold configuration, alert dispatch, optimization triggers

### Data Requirements

```typescript
interface ScheduledStudy {
  id: string;
  tenantId: string;
  brandId: string;

  // Schedule configuration
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly';
    dayOfWeek?: number;  // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    timeUtc: string;     // "09:00"
  };

  // Threshold configuration
  thresholds: {
    overallVisibility: number;      // e.g., 0.70 = 70%
    perSurface?: Record<string, number>;  // e.g., {"chatgpt": 0.75}
    changeThreshold: number;        // Alert if drops by this % from baseline
  };

  // Automation settings
  automation: {
    enabled: boolean;
    triggerOptimizationOnDrop: boolean;
    maxAutoOptimizationsPerMonth: number;
    requireApproval: boolean;       // Human-in-loop before publishing
  };

  // State
  lastRunAt: Date;
  lastScore: number;
  baselineScore: number;
  status: 'active' | 'paused' | 'disabled';
}

interface ScoreAlert {
  id: string;
  studyId: string;
  triggeredAt: Date;
  previousScore: number;
  currentScore: number;
  changePercent: number;
  threshold: number;
  surfaces: SurfaceScoreDelta[];
  actionTaken: 'none' | 'notified' | 'optimization_triggered';
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

interface SurfaceScoreDelta {
  surface: string;
  previousScore: number;
  currentScore: number;
  delta: number;
  contributingQueries: string[];  // Which queries dropped
}
```

### Dependencies
- Bentham: `@bentham/notification-hub` for alerts
- Bentham: `apps/scheduler` for cron execution
- New: Glu scoring service
- New: Glu threshold configuration UI

---

## 2. Highlight Change in PDP Optimization

**Summary:** In PDP optimization review page, highlight content changes and show reason for each change.

### Layer
- **Glu only** - UI/UX feature for optimization review workflow

### Data Requirements

```typescript
interface PDPOptimizationDiff {
  productId: string;
  optimizationId: string;

  changes: ContentChange[];

  metadata: {
    generatedAt: Date;
    modelUsed: string;
    brandToneApplied: string;
    totalChanges: number;
  };
}

interface ContentChange {
  field: 'title' | 'description' | 'bullet_points' | 'meta_description' | 'alt_text' | 'tags';

  // Diff visualization
  original: string;
  optimized: string;
  diffHtml: string;           // HTML with <ins>/<del> tags for highlighting

  // Reasoning
  reason: ChangeReason;
  confidence: number;         // 0-1 model confidence

  // Impact prediction
  expectedImpact: {
    aiVisibility: 'increase' | 'neutral' | 'decrease';
    seoImpact: 'positive' | 'neutral' | 'negative';
    brandToneAlignment: number;  // 0-1
  };
}

interface ChangeReason {
  category:
    | 'keyword_optimization'      // Added AI-relevant keywords
    | 'entity_coherence'          // Aligned with brand entity
    | 'claim_substantiation'      // Added proof/citations
    | 'readability'               // Improved clarity
    | 'schema_alignment'          // Better structured data compatibility
    | 'competitive_gap'           // Addressing competitor advantage
    | 'brand_tone';               // Tone/voice adjustment

  explanation: string;           // Human-readable explanation
  supportingData?: {
    competitorExample?: string;
    keywordData?: { term: string; volume: number }[];
    brandGuidelineReference?: string;
  };
}
```

### Dependencies
- New: Diff generation service (can use `diff` library)
- New: AI explanation generation (Claude/GPT for reasoning)
- Existing: Glu optimization engine

---

## 3. Version History for PDP Optimization

**Summary:** Track all optimization versions with ability to restore/revert to any previous version.

### Layer
- **Glu only** - Content versioning and restore workflow

### Data Requirements

```typescript
interface PDPVersion {
  id: string;
  productId: string;
  version: number;              // Auto-incrementing

  // Content snapshot
  content: {
    title: string;
    description: string;
    bulletPoints: string[];
    metaDescription: string;
    altTexts: Record<string, string>;  // imageId -> altText
    tags: string[];
    jsonLd?: object;
  };

  // Version metadata
  metadata: {
    createdAt: Date;
    createdBy: string;          // userId or 'system'
    source: 'manual' | 'optimization' | 'import' | 'restore';
    optimizationId?: string;    // If from optimization
    restoredFromVersion?: number;

    // What triggered this version
    changeReason: string;

    // Scores at time of creation
    scores?: {
      aiVisibility: number;
      seoScore: number;
      brandToneScore: number;
    };
  };

  // Publishing state
  publishState: {
    status: 'draft' | 'published' | 'archived';
    publishedAt?: Date;
    publishedTo?: string[];     // ['shopify', 'amazon', 'website']
  };
}

interface VersionCompare {
  versionA: number;
  versionB: number;
  differences: ContentChange[];  // Reuse from Feature #2
  scoreComparison: {
    field: string;
    versionAScore: number;
    versionBScore: number;
  }[];
}

interface RestoreRequest {
  productId: string;
  targetVersion: number;
  restoreFields: string[];      // Which fields to restore, or 'all'
  createNewVersion: boolean;    // true = non-destructive restore
  publishImmediately: boolean;
}
```

### Dependencies
- New: Version storage (Postgres table or document store)
- New: Version comparison service
- New: Restore workflow with publish integration

---

## 4. Enhanced Product Selection (Natural Language)

**Summary:** User can use natural language prompts like "Optimize the top 20 highest selling products from last month" to start optimization.

### Layer
- **Glu:** Natural language parsing, product selection logic
- **Integration:** Shopify/BigCommerce APIs for sales data

### Data Requirements

```typescript
interface ProductSelectionPrompt {
  tenantId: string;
  rawPrompt: string;            // "Optimize top 20 highest selling products from last month"

  // Parsed intent
  parsedIntent: {
    action: 'optimize' | 'analyze' | 'audit' | 'export';

    // Selection criteria
    selectionCriteria: {
      metric: 'sales_revenue' | 'sales_units' | 'views' | 'conversion_rate' | 'inventory' | 'margin';
      direction: 'top' | 'bottom';
      count: number;
      timeRange: {
        start: Date;
        end: Date;
        period: 'last_week' | 'last_month' | 'last_quarter' | 'last_year' | 'custom';
      };
    };

    // Filters
    filters?: {
      collections?: string[];
      productTypes?: string[];
      vendors?: string[];
      tags?: string[];
      priceRange?: { min: number; max: number };
      inventoryStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
    };

    // Optimization scope
    optimizationScope?: {
      fields: ('title' | 'description' | 'bullets' | 'alt_text' | 'meta' | 'all')[];
    };
  };

  confidence: number;           // Parser confidence
  clarificationNeeded?: string; // If ambiguous
}

interface ProductSelectionResult {
  promptId: string;
  selectedProducts: SelectedProduct[];
  totalMatching: number;
  appliedFilters: object;
  executedQuery: string;        // For transparency
}

interface SelectedProduct {
  productId: string;
  title: string;
  metricValue: number;          // The value used for ranking
  metricLabel: string;          // "Revenue: $12,450"
  thumbnailUrl: string;
  currentScores: {
    aiVisibility?: number;
    lastOptimized?: Date;
  };
}
```

### External Data Needed
```typescript
// From Shopify/BigCommerce
interface ProductSalesData {
  productId: string;
  variantId?: string;

  // Sales metrics
  salesRevenue: number;
  salesUnits: number;
  ordersCount: number;

  // Performance metrics
  pageViews: number;
  addToCartRate: number;
  conversionRate: number;

  // Inventory
  inventoryQuantity: number;

  // Time period
  periodStart: Date;
  periodEnd: Date;
}
```

### Dependencies
- New: NLP prompt parser (can use Claude/GPT)
- Integration: Shopify Admin API (orders, products, analytics)
- Integration: BigCommerce API
- New: Product ranking service

---

## 5. Bulk Actions (Granular Optimization)

**Summary:** Break optimization into smaller work items. E.g., optimize only image alt text for multiple products, or only descriptions.

### Layer
- **Glu only** - Workflow orchestration for bulk operations

### Data Requirements

```typescript
interface BulkOptimizationJob {
  id: string;
  tenantId: string;

  // Scope
  scope: {
    productIds: string[];
    fields: OptimizableField[];
  };

  // Configuration
  config: {
    brandToneId?: string;
    useCompetitorInsights: boolean;
    preserveKeywords: string[];   // Keywords to keep
    targetLength?: {
      description?: { min: number; max: number };
      bullets?: { min: number; max: number };
    };
  };

  // Progress
  progress: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    currentProductId?: string;
  };

  // Results
  results: BulkOptimizationResult[];

  // State
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedTimeRemaining?: number;
}

type OptimizableField =
  | 'title'
  | 'description'
  | 'bullet_points'
  | 'meta_title'
  | 'meta_description'
  | 'alt_text'           // All images
  | 'tags'
  | 'json_ld'
  | 'collection_description';

interface BulkOptimizationResult {
  productId: string;
  field: OptimizableField;
  status: 'optimized' | 'skipped' | 'failed';

  // If optimized
  original?: string;
  optimized?: string;
  reason?: string;

  // If failed/skipped
  error?: string;
  skipReason?: string;
}

interface BulkActionTemplate {
  id: string;
  name: string;                  // "Alt Text Optimization"
  description: string;
  fields: OptimizableField[];
  defaultConfig: object;
  estimatedTimePerProduct: number;  // seconds
}
```

### Dependencies
- New: Bulk job queue (can use existing Bentham orchestrator pattern)
- New: Field-specific optimization prompts
- New: Progress tracking UI with pause/resume

---

## 6. Deeper Brand Tone Functionality

**Summary:** If brand doesn't have a tone document, help them create one using brand analysis (brand agent).

### Layer
- **Glu only** - Brand analysis and tone generation

### Data Requirements

```typescript
interface BrandTone {
  id: string;
  tenantId: string;
  brandId: string;

  // Core tone attributes
  voice: {
    formality: 'casual' | 'conversational' | 'professional' | 'formal';
    personality: string[];       // ['friendly', 'expert', 'playful']
    perspective: 'first_person' | 'second_person' | 'third_person';
  };

  // Writing style
  style: {
    sentenceLength: 'short' | 'medium' | 'long' | 'varied';
    vocabulary: 'simple' | 'moderate' | 'sophisticated';
    useEmoji: boolean;
    useExclamations: boolean;
    useTechnicalTerms: boolean;
  };

  // Brand-specific
  brandElements: {
    keyPhrases: string[];        // "Made with love", "Since 1985"
    avoidPhrases: string[];      // Competitor terms, off-brand language
    productDescriptors: string[]; // How to describe products
    valuePropositions: string[]; // Core messages to reinforce
  };

  // Examples
  examples: {
    goodExamples: ToneExample[];
    badExamples: ToneExample[];
  };

  // Source
  source: 'uploaded_document' | 'generated' | 'manual';
  sourceDocument?: string;       // URL or file reference
  generatedFrom?: BrandAnalysis;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface ToneExample {
  text: string;
  context: string;               // "Product description", "Email subject"
  rating: 'excellent' | 'good' | 'acceptable';
  notes?: string;
}

interface BrandAnalysis {
  // Sources analyzed
  sources: {
    website: {
      pagesAnalyzed: number;
      sampleContent: string[];
    };
    socialMedia?: {
      platforms: string[];
      postsAnalyzed: number;
    };
    existingProducts?: {
      productsAnalyzed: number;
    };
    competitors?: {
      brandsAnalyzed: string[];
    };
  };

  // Detected attributes
  detectedTone: {
    formality: { value: string; confidence: number };
    personality: { values: string[]; confidence: number };
    vocabulary: { value: string; confidence: number };
  };

  // Key phrases found
  detectedPhrases: {
    phrase: string;
    frequency: number;
    contexts: string[];
  }[];

  // Recommendations
  recommendations: {
    attribute: string;
    currentValue: string;
    recommendedValue: string;
    rationale: string;
  }[];
}

interface ToneGenerationRequest {
  tenantId: string;
  brandId: string;

  // What to analyze
  analysisScope: {
    analyzeWebsite: boolean;
    websiteUrl?: string;
    analyzeSocialMedia: boolean;
    socialHandles?: Record<string, string>;
    analyzeExistingProducts: boolean;
    analyzeCompetitors: boolean;
    competitorBrands?: string[];
  };

  // User preferences (optional)
  preferences?: {
    desiredFormality?: string;
    desiredPersonality?: string[];
    keyPhrasesToInclude?: string[];
    phrasesToAvoid?: string[];
  };
}
```

### Dependencies
- New: Website content scraper (can use Bentham's site-crawler)
- New: Tone analysis AI service
- New: Tone generation prompts
- Optional: Social media API integrations

---

## 7. Integration with Review Apps

**Summary:** Pull review data from review platforms (Yotpo, Judge.me, Stamped, Trustpilot, etc.) for analysis and optimization.

### Layer
- **Glu:** Review aggregation and analysis
- **Bentham:** Could add review collection as a surface type

### Data Requirements

```typescript
interface ReviewIntegration {
  id: string;
  tenantId: string;

  platform: 'yotpo' | 'judge_me' | 'stamped' | 'trustpilot' | 'google_reviews' | 'amazon';

  credentials: {
    apiKey?: string;
    apiSecret?: string;
    storeId?: string;
    accessToken?: string;
  };

  syncConfig: {
    syncFrequency: 'hourly' | 'daily' | 'weekly';
    lastSyncAt: Date;
    syncProductReviews: boolean;
    syncStoreReviews: boolean;
  };

  status: 'active' | 'error' | 'disconnected';
}

interface ProductReview {
  id: string;
  externalId: string;           // Platform's review ID
  platform: string;
  productId: string;

  // Review content
  rating: number;               // 1-5
  title?: string;
  body: string;

  // Reviewer
  reviewer: {
    name: string;
    isVerifiedPurchase: boolean;
    location?: string;
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  helpfulVotes?: number;

  // Analysis (computed)
  analysis?: {
    sentiment: 'positive' | 'neutral' | 'negative';
    themes: string[];           // ['quality', 'shipping', 'value']
    mentionedFeatures: string[];
    issues: string[];
  };
}

interface ReviewAggregation {
  productId: string;

  // Aggregate metrics
  metrics: {
    averageRating: number;
    totalReviews: number;
    ratingDistribution: Record<number, number>;  // {5: 120, 4: 45, ...}
    recommendRate?: number;
  };

  // Sentiment breakdown
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };

  // Theme analysis
  themes: {
    theme: string;
    frequency: number;
    averageSentiment: number;
    exampleReviews: string[];
  }[];

  // For optimization
  optimizationInsights: {
    topPraises: string[];        // Features customers love
    topComplaints: string[];     // Issues to address
    suggestedKeywords: string[]; // Terms customers use
    missingFromDescription: string[];  // Things reviews mention but description doesn't
  };
}
```

### External APIs
- Yotpo API: Reviews, ratings, Q&A
- Judge.me API: Reviews, ratings
- Stamped.io API: Reviews, ratings, NPS
- Trustpilot API: Company reviews
- Google Business Profile API: Location reviews

### Dependencies
- New: Review sync service (per platform)
- New: Review analysis AI service
- New: Review aggregation service

---

# COMPLETELY NEW FLOWS

## 8. Collection Page Optimization

**Summary:** Extend PDP optimization to collection/category pages.

### Layer
- **Glu only** - New optimization target

### Data Requirements

```typescript
interface CollectionOptimization {
  collectionId: string;
  tenantId: string;

  // Current content
  current: {
    title: string;
    description: string;
    metaTitle: string;
    metaDescription: string;
    handle: string;              // URL slug
    image?: {
      url: string;
      altText: string;
    };

    // Collection rules (if smart collection)
    rules?: CollectionRule[];

    // Products in collection
    productCount: number;
    topProducts: string[];       // Product IDs
  };

  // Optimization
  optimized: {
    title: string;
    description: string;
    metaTitle: string;
    metaDescription: string;
    imageAltText?: string;
  };

  // Analysis
  analysis: {
    // What products are in this collection
    productThemes: string[];
    commonKeywords: string[];
    priceRange: { min: number; max: number };

    // AI visibility
    currentVisibility?: number;
    competitorCollections?: {
      competitor: string;
      collectionUrl: string;
      description: string;
    }[];

    // Recommendations
    recommendations: string[];
  };
}

interface CollectionRule {
  column: string;               // 'tag', 'product_type', 'vendor', 'price'
  relation: string;             // 'equals', 'contains', 'greater_than'
  condition: string;            // The value
}
```

### Dependencies
- Existing: PDP optimization engine (extend)
- New: Collection-specific prompts
- Integration: Shopify Collections API

---

## 9. New Product Flow via Image Upload

**Summary:** User uploads product images, Glu generates all content (title, description, bullets, alt text, tags).

### Layer
- **Glu only** - New product creation workflow

### Data Requirements

```typescript
interface ImageBasedProductCreation {
  id: string;
  tenantId: string;

  // Input
  images: UploadedImage[];

  // User hints (optional)
  hints?: {
    productCategory?: string;
    targetPrice?: number;
    targetAudience?: string;
    keyFeatures?: string[];
    brandToneId?: string;
  };

  // AI analysis
  imageAnalysis: {
    detectedObjects: string[];
    detectedColors: string[];
    detectedMaterials: string[];
    detectedStyle: string[];
    suggestedCategory: string;
    confidence: number;
  };

  // Generated content
  generatedContent: {
    title: string;
    description: string;
    bulletPoints: string[];
    metaTitle: string;
    metaDescription: string;
    altTexts: Record<string, string>;  // imageId -> altText
    suggestedTags: string[];
    suggestedCollections: string[];
    suggestedPrice?: { min: number; max: number };
  };

  // Status
  status: 'analyzing' | 'generating' | 'review' | 'published' | 'cancelled';
  createdAt: Date;
}

interface UploadedImage {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  dimensions: { width: number; height: number };
  isPrimary: boolean;

  // AI-generated
  altText?: string;
  analysis?: {
    objects: string[];
    colors: string[];
    style: string;
  };
}
```

### Dependencies
- New: Image analysis service (GPT-4V, Claude Vision)
- New: Content generation from image context
- Existing: Brand tone application

---

## 10. Content Consistency & Inconsistency Flagging

**Summary:** Detect inconsistencies across products, pages, or claims. Flag conflicting information.

### Layer
- **Glu only** - Content analysis and validation

### Data Requirements

```typescript
interface ConsistencyAudit {
  id: string;
  tenantId: string;
  brandId: string;

  // Scope
  scope: {
    products: string[];
    collections: string[];
    pages: string[];
  };

  // Findings
  inconsistencies: Inconsistency[];

  // Summary
  summary: {
    totalItemsChecked: number;
    totalInconsistencies: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };

  createdAt: Date;
}

interface Inconsistency {
  id: string;

  // What's inconsistent
  category:
    | 'brand_name'              // Different spellings/capitalizations
    | 'product_claim'           // Conflicting claims ("100% organic" vs "95% organic")
    | 'pricing'                 // Price inconsistencies
    | 'material'                // Different material descriptions
    | 'sizing'                  // Size chart discrepancies
    | 'warranty'                // Different warranty claims
    | 'origin'                  // Country of origin conflicts
    | 'certifications'          // Certification claims vary
    | 'tone'                    // Tone/voice inconsistency
    | 'terminology';            // Different terms for same thing

  severity: 'critical' | 'warning' | 'info';

  // Where it was found
  locations: {
    itemType: 'product' | 'collection' | 'page';
    itemId: string;
    itemTitle: string;
    field: string;
    value: string;
    context: string;            // Surrounding text
  }[];

  // Analysis
  analysis: {
    description: string;        // "Product A claims '100% bamboo' while Product B claims 'bamboo blend'"
    recommendation: string;     // "Standardize to '100% bamboo viscose'"
    autoFixAvailable: boolean;
    suggestedFix?: string;
  };
}

interface ConsistencyRule {
  id: string;
  tenantId: string;

  // What to check
  ruleType: 'brand_name' | 'claim' | 'terminology' | 'custom';

  // Configuration
  config: {
    // For brand_name
    canonicalValue?: string;    // "TASC Performance" (not "Tasc" or "TASC")

    // For claim
    claimPattern?: string;      // Regex or keywords
    requiredEvidence?: string;  // What must support the claim

    // For terminology
    preferredTerm?: string;
    alternateTerms?: string[];  // Terms to replace

    // For custom
    customRule?: string;        // AI-interpretable rule
  };

  enabled: boolean;
}
```

### Dependencies
- New: Content extraction service (all products/pages)
- New: Consistency analysis AI service
- New: Rule engine for custom checks

---

## 11. Custom Prompt Addition

**Summary:** Allow users to add custom prompts to the query set for visibility studies.

### Layer
- **Glu:** Custom prompt management
- **Bentham:** Already supports custom queries in manifests

### Data Requirements

```typescript
interface CustomPromptSet {
  id: string;
  tenantId: string;
  brandId: string;

  name: string;
  description: string;

  prompts: CustomPrompt[];

  // Usage
  includeInStudies: boolean;
  lastUsedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

interface CustomPrompt {
  id: string;

  // The prompt
  text: string;

  // Classification
  category: string;             // "product", "brand", "comparison", "custom"
  intent: string;               // "purchase", "research", "support"

  // Expected behavior
  expectedBrands?: string[];    // Brands that should appear
  expectedNotBrands?: string[]; // Brands that should NOT appear

  // Metadata
  addedBy: string;
  addedAt: Date;
  notes?: string;
}

interface PromptSuggestion {
  text: string;
  source: 'competitor_analysis' | 'search_console' | 'ai_generated' | 'industry_template';
  relevanceScore: number;
  rationale: string;
}
```

### Dependencies
- Existing: Bentham manifest system
- New: Prompt suggestion engine
- New: Prompt validation service

---

# QUICK WINS FOR USERS

## 12. Visibility Scan (Quick Assessment)

**Summary:** "Where do I stand today vs competition?" / "How visible is my brand today?" - Quick, lightweight visibility check.

### Layer
- **Bentham:** Execute lightweight study
- **Glu:** Results interpretation and display

### Data Requirements

```typescript
interface VisibilityScan {
  id: string;
  tenantId: string;
  brandId: string;

  // Configuration (lightweight)
  config: {
    queryCount: number;         // 10-20 queries (vs 90 for full study)
    surfaces: string[];         // Top 3-4 surfaces
    competitors: string[];      // Top 5 competitors
  };

  // Results
  results: {
    overallScore: number;       // 0-100
    trend: 'up' | 'down' | 'stable';
    trendVsLastScan: number;    // Percentage change

    bySurface: {
      surface: string;
      score: number;
      rank: number;             // vs competitors
    }[];

    vsCompetitors: {
      brand: string;
      score: number;
      gap: number;              // Your score - their score
    }[];

    topStrengths: string[];
    topWeaknesses: string[];

    // Quick recommendations
    quickWins: {
      action: string;
      expectedImpact: 'high' | 'medium' | 'low';
      effort: 'low' | 'medium' | 'high';
    }[];
  };

  // Performance
  executionTime: number;        // seconds
  createdAt: Date;
}
```

### Dependencies
- Existing: Bentham study execution
- New: Lightweight study template
- New: Quick interpretation AI

---

## 13. AI Playground

**Summary:** Type a prompt and check answers across AI platforms. Glu shows areas to improve/fix.

### Layer
- **Bentham:** Multi-surface query execution
- **Glu:** Results comparison and analysis

### Data Requirements

```typescript
interface PlaygroundQuery {
  id: string;
  tenantId: string;

  // Input
  prompt: string;
  surfaces: string[];           // Which AI platforms to query

  // Results
  responses: {
    surface: string;
    response: string;

    // Analysis
    brandMentioned: boolean;
    brandPosition?: number;     // 1st, 2nd, 3rd mentioned
    brandSentiment?: 'positive' | 'neutral' | 'negative';
    competitorsMentioned: string[];

    // Quality indicators
    factualAccuracy?: {
      correct: string[];
      incorrect: string[];
      unverifiable: string[];
    };

    citations?: {
      url: string;
      title: string;
    }[];
  }[];

  // Comparison analysis
  comparison: {
    // Consistency across platforms
    brandMentionedIn: string[];
    brandNotMentionedIn: string[];

    // Positioning differences
    positioningDifferences: {
      surface: string;
      description: string;
    }[];

    // Recommendations
    improvements: {
      area: string;
      currentState: string;
      recommendation: string;
      affectedSurfaces: string[];
    }[];
  };

  createdAt: Date;
}
```

### Dependencies
- Existing: Bentham surface adapters
- New: Real-time query execution (vs batch study)
- New: Cross-platform comparison AI

---

## 14. Prompt Analysis (Deep Dive)

**Summary:** Go deeper on prompt analysis with coverage gaps, intent gaps, geography variations, platform variations, and hallucination detection.

### Layer
- **Glu only** - Advanced analysis on study results

### Data Requirements

```typescript
interface PromptAnalysis {
  studyId: string;
  tenantId: string;
  brandId: string;

  // Coverage gap detection
  coverageGaps: {
    missingPrompts: {
      prompt: string;
      category: string;
      competitors: string[];     // Who shows up instead
      estimatedSearchVolume?: number;
    }[];

    // Prompts where brand appears but weakly
    weakPresence: {
      prompt: string;
      currentPosition: number;
      topCompetitor: string;
      topCompetitorPosition: number;
    }[];
  };

  // Intent type analysis
  intentAnalysis: {
    intentType: string;          // "best X", "X vs Y", "is X reliable", "how to X"
    brandVisibility: number;
    competitorVisibility: Record<string, number>;
    gap: string;                 // "Strong in 'best' prompts, weak in 'reliability' prompts"
  }[];

  // Geographic variations
  geoVariations: {
    region: string;
    brandPositioning: string;    // "premium", "mid-market", "budget"
    competitorPositioning: Record<string, string>;
    pricePerception?: string;
    recommendations: string[];
  }[];

  // Platform variations
  platformVariations: {
    platform: string;
    brandDescription: string;    // How this platform describes the brand
    keyAttributes: string[];
    missingAttributes: string[];
    sentiment: string;
  }[];

  // Hallucination detection
  hallucinations: {
    platform: string;
    prompt: string;
    claim: string;
    status: 'hallucinated' | 'outdated' | 'inaccurate' | 'unverified';
    correction: string;
    source?: string;             // Where correct info should come from
  }[];
}

interface IntentTypeDefinition {
  type: string;
  patterns: string[];            // Regex patterns
  examples: string[];
  expectedBehavior: string;
}
```

### Dependencies
- Existing: Study results data
- New: Coverage gap detection AI
- New: Intent classification service
- New: Hallucination detection service
- New: Geographic analysis (requires multi-geo studies)

---

## 15. Competitive Answer Analysis

**Summary:** Understand why competitors are chosen instead of your brand. Analyze competitor content depth, claims, formatting, citations.

### Layer
- **Glu only** - Competitor analysis

### Data Requirements

```typescript
interface CompetitiveAnswerAnalysis {
  studyId: string;
  brandId: string;

  // Per-competitor breakdown
  competitors: CompetitorAnalysis[];

  // Overall insights
  insights: {
    // Why competitors win
    competitorAdvantages: {
      advantage: string;
      competitors: string[];
      yourStatus: string;
      recommendation: string;
    }[];

    // Where you win
    yourAdvantages: {
      advantage: string;
      affectedCompetitors: string[];
    }[];

    // Quick wins
    quickWins: {
      action: string;
      expectedImpact: string;
      competitors: string[];
    }[];
  };
}

interface CompetitorAnalysis {
  competitorBrand: string;

  // Appearance data
  appearsIn: {
    promptCount: number;
    prompts: string[];
    surfaces: string[];
  };

  // Content analysis
  contentAnalysis: {
    // Depth
    averageContentLength: number;
    contentDepthScore: number;   // 1-10

    // Structure
    usesLists: boolean;
    usesTables: boolean;
    usesFAQs: boolean;
    usesComparisons: boolean;

    // Claims & differentiators
    claims: {
      claim: string;
      substantiated: boolean;
      source?: string;
    }[];

    differentiators: string[];

    // Trust signals
    citations: {
      url: string;
      domain: string;
      trustScore?: number;
    }[];

    awardsOrCertifications: string[];

    // Sample content
    sampleResponses: {
      surface: string;
      prompt: string;
      response: string;
    }[];
  };

  // Your brand comparison
  vsYourBrand: {
    theyHaveYouDont: string[];
    youHaveTheyDont: string[];
    contentGaps: string[];
    structureGaps: string[];
  };
}

interface AutoDetectedCompetitor {
  brand: string;
  frequency: number;            // How often they appear
  coOccurrenceWithYou: number;  // How often you both appear
  category: string;             // "direct", "indirect", "adjacent"
  flagged: boolean;             // Flagged for user attention
}
```

### Dependencies
- Existing: Study results with competitor tracking
- New: Content depth analysis AI
- New: Claim extraction service
- New: Citation analysis service

---

## 16. Trust, Citations & Knowledge Source Mapping

**Summary:** Map where AI systems source information about your brand. Recommend how to improve third-party presence.

### Layer
- **Bentham:** Citation extraction (already in citation-collector)
- **Glu:** Source analysis and recommendations

### Data Requirements

```typescript
interface KnowledgeSourceMap {
  brandId: string;
  tenantId: string;

  // Citation tracking
  citations: {
    url: string;
    domain: string;
    title: string;

    // Usage
    citedBy: string[];          // Which AI platforms
    citedInPrompts: string[];   // Which prompts
    frequency: number;

    // Quality
    domainAuthority?: number;
    trustScore: number;         // 1-10

    // Content assessment
    contentAssessment?: {
      accuracy: 'accurate' | 'partially_accurate' | 'inaccurate' | 'outdated';
      sentiment: 'positive' | 'neutral' | 'negative';
      lastUpdated?: Date;
    };
  }[];

  // Source categories
  sourceBreakdown: {
    category: 'official_website' | 'review_platform' | 'news' | 'forum' | 'social' | 'retailer' | 'wiki' | 'other';
    count: number;
    topSources: string[];
    sentiment: string;
  }[];

  // Third-party visibility
  thirdPartySources: {
    // Review platforms
    reviewPlatforms: {
      platform: string;         // "Trustpilot", "G2", "Capterra"
      profileExists: boolean;
      profileUrl?: string;
      rating?: number;
      reviewCount?: number;
      cited: boolean;
      recommendations: string[];
    }[];

    // Forums & communities
    forums: {
      platform: string;         // "Reddit", "Quora"
      presenceLevel: 'strong' | 'moderate' | 'weak' | 'none';
      sentiment: string;
      topMentions: string[];
      recommendations: string[];
    }[];

    // News & PR
    news: {
      recentMentions: number;
      topPublications: string[];
      sentiment: string;
      recommendations: string[];
    };
  };

  // Recommendations
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    source: string;
    currentState: string;
    recommendation: string;
    expectedImpact: string;
    effort: string;
  }[];

  // Missing sources
  missingSources: {
    source: string;
    whyItMatters: string;
    competitorsPresent: string[];
    actionRequired: string;
  }[];
}

interface CitationHealth {
  totalCitations: number;
  uniqueDomains: number;

  // Health indicators
  officialSourcesCited: number;
  outdatedSourcesCited: number;
  negativeSourcesCited: number;

  // Trends
  citationTrend: 'improving' | 'stable' | 'declining';
  newSourcesThisMonth: string[];
  lostSourcesThisMonth: string[];
}
```

### Dependencies
- Existing: Bentham citation-collector
- New: Domain authority lookup (Moz, Ahrefs API)
- New: Review platform checking service
- New: Source recommendation AI

---

# SUMMARY: DATA INFRASTRUCTURE NEEDED

## New Database Tables (Glu Layer)

| Table | Purpose |
|-------|---------|
| `scheduled_studies` | Store scheduled study configurations |
| `score_alerts` | Track threshold breaches and alerts |
| `pdp_versions` | Content version history |
| `optimization_jobs` | Bulk optimization job tracking |
| `brand_tones` | Brand voice/tone configurations |
| `review_integrations` | Review platform connections |
| `product_reviews` | Synced review data |
| `consistency_rules` | Custom consistency rules |
| `custom_prompts` | User-defined prompts |
| `playground_queries` | Ad-hoc query history |
| `knowledge_sources` | Citation/source mapping |

## New Services Needed

| Service | Purpose |
|---------|---------|
| Scoring Service | Calculate visibility scores from study results |
| Diff Service | Generate content diffs with highlighting |
| NLP Parser | Parse natural language product selection |
| Tone Analyzer | Analyze and generate brand tone |
| Review Sync | Pull reviews from external platforms |
| Consistency Checker | Detect content inconsistencies |
| Image Analyzer | Generate content from product images |
| Citation Analyzer | Map and assess knowledge sources |
| Hallucination Detector | Identify inaccurate AI responses |

## External Integrations Needed

| Integration | Purpose |
|-------------|---------|
| Shopify Admin API | Product data, sales data, collections |
| BigCommerce API | Product data, sales data |
| Yotpo API | Review data |
| Judge.me API | Review data |
| Trustpilot API | Company reviews |
| Moz/Ahrefs API | Domain authority data |

## Bentham Core Enhancements

| Enhancement | Purpose |
|-------------|---------|
| Real-time query mode | For AI Playground (vs batch) |
| Lightweight study template | For quick visibility scans |
| Multi-geo study support | For geographic analysis |
| Enhanced citation extraction | For knowledge source mapping |

---

# FEATURE-TO-INFRASTRUCTURE MAPPING

## Features That Can Leverage Existing Bentham Collectors

### Roadmap Features (R1-R15)

| Feature | Existing Collector(s) | Gap |
|---------|----------------------|-----|
| **R1. Discovery Scan** | `ai-surfaces-collector.ts` | Need vertical templates, brand extraction |
| **R2. Dual-Path Ingestion** | `site-crawler.ts`, `url-discovery.ts` | Need platform API connectors |
| **R3. Prioritization** | Study results | Need scoring algorithm |
| **R4. Multi-Format Output** | N/A (output layer) | Need template engine |
| **R5. llms.txt Generation** | `ai-files-collector.ts`, `site-crawler.ts` | Need generation prompts |
| **R6. Tag State Extraction** | N/A | Need Shopify API integration |
| **R7. Review Citation Tracking** | `citation-collector.ts` | Need sentiment analysis |
| **R8. Staged Content Review** | N/A | New workflow service |
| **R9. New Product Workflow** | Content generation | Need webhook listener |
| **R10. Citation A/B Testing** | `citation-collector.ts` | Need comparison analysis |
| **R11. Traffic Correlation** | `ai-referral-collector.ts` | Need GA4 integration |
| **R12. Trend Analysis** | Study results | Need trend detection |
| **R13. Content Performance** | `citation-collector.ts` | Need URL tracking |
| **R14. Walmart/Flipkart** | `oxylabs-collector.ts` (partial) | Need new adapters |
| **R15. Near-Me Queries** | `serpapi-collector.ts` | Need retailer data |

### Backlog Features (1-16)

| New Feature | Existing Collector(s) | Gap |
|-------------|----------------------|-----|
| **Trust/Citations Mapping** | `citation-collector.ts` | Need domain authority lookup, review platform integration |
| **LLM Reachability Check** | `reachability-collector.ts` | **Ready** - compares raw HTML vs JS-rendered |
| **Competitive Answer Analysis** | `ai-surfaces-collector.ts`, `serpapi-collector.ts` | Need content depth scoring, claim extraction |
| **AI Playground** | `chatgpt-collector.ts`, `serpapi-collector.ts`, `copilot-collector.ts` | Need real-time mode (not batch) |
| **Visibility Scan** | `ai-surfaces-collector.ts` | Need lightweight study template |
| **Prompt Analysis (Geography)** | `serpapi-collector.ts` with location options | **Ready** - supports geo-specific queries |
| **Prompt Analysis (Platform)** | All surface collectors | **Ready** - already multi-surface |
| **Hallucination Detection** | Citation data from `citation-collector.ts` | Need fact-checking AI service |
| **Content Consistency** | `jsonld-collector.ts`, `metadata-collector.ts` | Need cross-product comparison logic |
| **Collection Page Optimization** | `site-crawler.ts` | Need collection-specific prompts |
| **New Product via Image** | None | Need GPT-4V/Claude Vision integration |
| **Review Integration** | `citation-collector.ts` (for AI-cited reviews) | Need Yotpo/Judge.me API integration |
| **llms.txt Generation** | `ai-files-collector.ts` (discovery), `site-crawler.ts` | Need generation service (Glu layer) |

## Bentham Roadmap Tasks Already Implemented

From the [Enhancement Roadmap](https://bentham-strategy-docs-archive.netlify.app/reports/bentham-enhancement-roadmap.html):

| Task | Status | Collector/Feature |
|------|--------|-------------------|
| Full Site Crawler | **Done** | `site-crawler.ts` |
| LLM Reachability Audit | **Done** | `reachability-collector.ts` |
| AI Files Discovery (llms.txt) | **Done** | `ai-files-collector.ts` |
| Citation Tracking | **Done** | `citation-collector.ts` |
| AI Referral Traffic | **Done** | `ai-referral-collector.ts` |
| Multi-Surface Queries | **Done** | `ai-surfaces-collector.ts` |
| SerpAPI Integration | **Done** | `serpapi-collector.ts` |
| ChatGPT Web | **Done** | `chatgpt-collector.ts` |
| Copilot | **Done** | `copilot-collector.ts` |
| Amazon/Walmart Scraping | **Done** | `oxylabs-collector.ts` |

## Features Requiring New Glu Services

| Feature | New Service Needed | Dependencies |
|---------|-------------------|--------------|
| Schedule Optimization | Scoring Service, Alert Service | Bentham scheduler (`apps/scheduler`) |
| PDP Diff Highlighting | Diff Service | Claude/GPT for reasoning |
| Version History | Version Store | Postgres or document DB |
| Natural Language Selection | NLP Parser | Claude/GPT + Shopify API |
| Bulk Actions | Job Queue Service | Bentham orchestrator pattern |
| Brand Tone Generation | Tone Analyzer | `site-crawler.ts` + Claude |
| Review Integration | Review Sync Service | External APIs (Yotpo, etc.) |
| Image-to-Content | Vision AI Service | GPT-4V or Claude Vision |
| Consistency Checker | Consistency Service | Multi-product comparison |
| Hallucination Detector | Fact-Check Service | Knowledge base + citations |

---

# IMPLEMENTATION PRIORITY

Based on existing infrastructure and roadmap alignment:

## Immediate (Infrastructure Ready) - Week 1-2

| # | Feature | Source | Collector Ready | Gap |
|---|---------|--------|-----------------|-----|
| 1 | **LLM Reachability Audit** | R-Roadmap | `reachability-collector.ts` | None - **ship now** |
| 2 | **Visibility Scan** | Backlog #12 | `ai-surfaces-collector.ts` | Lightweight template |
| 3 | **AI Playground** | Backlog #13 | All surface collectors | Real-time wrapper |
| 4 | **Trust/Citation Mapping** | Backlog #16 | `citation-collector.ts` | Domain analysis |
| 5 | **Review Citation Tracking** | R7 | `citation-collector.ts` | Sentiment tagging |

## Short-Term (Minor Development) - Week 3-4

| # | Feature | Source | Dependencies |
|---|---------|--------|--------------|
| 6 | **Discovery Scan** | R1 | Vertical templates, brand extraction |
| 7 | **Prompt Analysis** | Backlog #14 | Analysis layer on existing data |
| 8 | **Competitive Answer Analysis** | Backlog #15 | Content scoring, claim extraction |
| 9 | **Content Performance Metrics** | R13 | URL performance tracking |
| 10 | **Trend Analysis** | R12 | Trend detection algorithm |

## Medium-Term (New Services) - Week 5-8

| # | Feature | Source | New Service Needed |
|---|---------|--------|-------------------|
| 11 | **Staged Content Review** | R8 | Approval workflow service |
| 12 | **Schedule Optimization** | Backlog #1 | Scoring + alert service |
| 13 | **llms.txt Generation** | R5 | Generation prompts + Shopify upload |
| 14 | **Tag State Extraction** | R6 | Shopify API + snapshot storage |
| 15 | **Prioritization Framework** | R3 | Scoring algorithm |
| 16 | **Multi-Format Output** | R4 | Template engine |
| 17 | **Content Consistency** | Backlog #10 | Comparison logic |
| 18 | **Collection Optimization** | Backlog #8 | Collection-specific prompts |
| 19 | **Custom Prompts** | Backlog #11 | Prompt management |

## Medium-Term (External Integrations) - Week 6-10

| # | Feature | Source | Integration Needed |
|---|---------|--------|-------------------|
| 20 | **Dual-Path Ingestion** | R2 | Shopify/BigCommerce APIs |
| 21 | **Review Integration** | Backlog #7 | Yotpo, Judge.me, Trustpilot APIs |
| 22 | **AI Referral Correlation** | R11 | GA4 API |
| 23 | **New Product Workflow** | R9 | Webhook listener + platform APIs |
| 24 | **Citation A/B Testing** | R10 | Study comparison service |

## Longer-Term (Significant Development) - Week 10+

| # | Feature | Source | Major Work |
|---|---------|--------|------------|
| 25 | **PDP Diff/Versioning** | Backlog #2-3 | Version store, diff service |
| 26 | **Bulk Actions** | Backlog #5 | Job queue system |
| 27 | **Brand Tone Generation** | Backlog #6 | Tone analyzer AI |
| 28 | **Natural Language Selection** | Backlog #4 | NLP parser |
| 29 | **Walmart/Flipkart Adapters** | R14 | New surface adapters |
| 30 | **Near-Me Optimization** | R15 | Retailer data import, local queries |
| 31 | **Image-to-Content** | Backlog #9 | Vision AI (GPT-4V/Claude) |
| 32 | **Hallucination Detection** | Backlog #14.5 | Fact-checking infrastructure |

---

# FEATURE COUNT SUMMARY

| Category | Count |
|----------|-------|
| Roadmap Features (R1-R15) | 15 |
| Backlog Features (1-16) | 16 |
| **Total Features** | **31** |

| Readiness | Count |
|-----------|-------|
| Infrastructure Ready (ship now) | 5 |
| Short-Term (minor dev) | 5 |
| Medium-Term (new services) | 9 |
| Medium-Term (integrations) | 5 |
| Longer-Term (significant) | 8 |

---

# MVP vs FULL FEATURE BREAKDOWN

For each feature, this section defines the minimum viable product (MVP) that delivers core value vs the full-featured version.

## Roadmap Features

### R1. Discovery Scan

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Verticals** | 3 pre-built (pet, apparel, beauty) | 20+ verticals, custom vertical builder |
| **Queries** | 10-15 template queries per vertical | 50+ queries, AI-generated expansions |
| **Surfaces** | ChatGPT + Google AI Overview | All 8+ surfaces |
| **Output** | List of discovered brands with mention counts | Full competitive landscape with positioning map |
| **Effort** | **Config only** (manifest templates per vertical) | 1 week (vertical builder UI, AI query expansion) |

> **Note:** MVP is manifest templates - create `discovery-pet.manifest.json`, `discovery-apparel.manifest.json`, etc. Brand extraction from responses is already in study results.

### R2. Dual-Path Content Ingestion

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Scrape Path** | Basic site crawl (existing) | Deep crawl with JS rendering, pagination |
| **API Path** | Shopify only | Shopify, BigCommerce, WooCommerce, custom |
| **Hybrid** | Manual selection | Auto-detect best path per content type |
| **Sync** | Manual trigger | Webhook-driven real-time sync |
| **Effort** | 1 week (Shopify API) | 4 weeks (all platforms) |

### R3. Prioritization Framework

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Scoring** | Single score (visibility gap × revenue) | Multi-factor weighted scoring with custom weights |
| **Inputs** | Visibility data only | Visibility + sales + inventory + seasonality |
| **Output** | Ranked product list | Priority queue with effort estimates, ROI projections |
| **UI** | CLI/API only | Dashboard with drag-drop reprioritization |
| **Effort** | 3 days | 2 weeks |

### R4. Multi-Format Output

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Formats** | JSON + HTML | JSON, HTML, PDF, Excel, Markdown, plain text |
| **Theming** | Generic Glu branding | Client brand colors, fonts, logos |
| **Templates** | 1 report template | Multiple templates (CEO, technical, competitive) |
| **Customization** | None | Drag-drop report builder |
| **Effort** | 3 days | 3 weeks |

### R5. llms.txt Auto-Generation

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Content** | Brand name, description, top 20 products | Full catalog, collections, key pages, contact, restrictions |
| **Generation** | Template-based | AI-generated with brand tone |
| **Publishing** | Download file manually | Auto-publish to Shopify, create redirect |
| **Updates** | Manual regeneration | Auto-update on product changes |
| **Effort** | 2 days | 2 weeks |

### R6. Tag State Extraction

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Capture** | Tags only | Tags, collections, product types, metafields |
| **Comparison** | Side-by-side text diff | Visual diff with change highlighting |
| **History** | Last 2 snapshots | Full version history with restore |
| **Trigger** | Manual | Auto-capture before/after optimization |
| **Effort** | 2 days | 1 week |

### R7. Review Citation Tracking

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Detection** | Identify review URLs in citations | Sentiment analysis, reviewer credibility |
| **Platforms** | Trustpilot, Amazon reviews | All major review platforms + Reddit/Quora |
| **Analysis** | Count positive vs negative | Theme extraction, trend over time |
| **Recommendations** | Flag negative citations | Actionable response templates, priority queue |
| **Effort** | 3 days | 2 weeks |

### R8. Staged Content Review

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Queue** | Simple list of pending items | Filtered/sorted queue with search |
| **Review UI** | Side-by-side diff | Inline editing, partial approval |
| **Actions** | Approve / Reject | Approve, Reject, Edit, Schedule, Assign |
| **Notifications** | Email only | Email, Slack, in-app, mobile push |
| **Audit** | Basic log | Full audit trail with compliance export |
| **Effort** | 1 week | 4 weeks |

### R9. New Product AI-Readiness Workflow

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Trigger** | Manual (select product) | Webhook on product create/update |
| **Analysis** | Content completeness check | Full AI readiness score with benchmarks |
| **Generation** | Description + meta only | All fields including alt text, tags, JSON-LD |
| **Review** | Direct to staged queue | Preview with AI visibility prediction |
| **Effort** | 1 week | 3 weeks |

### R10. AI Citation A/B Testing

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Setup** | Manual before/after study trigger | Automated test scheduling |
| **Comparison** | Citation count change | Statistical significance, confidence intervals |
| **Visualization** | Table of changes | Charts showing citation trends |
| **Insights** | Raw data | AI-generated insights and recommendations |
| **Effort** | **Config only** (run same manifest twice) | 2 weeks (scheduling, statistics UI) |

> **Note:** MVP is running the same manifest before and after content changes. Comparison is manual or simple script.

### R11. AI Referral Traffic Correlation

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Data Source** | Manual CSV upload from GA4 | Direct GA4 API integration |
| **Correlation** | Simple visibility vs traffic chart | Multi-variate analysis with lag detection |
| **Attribution** | Platform-level (ChatGPT, Perplexity) | URL-level attribution |
| **Reporting** | Basic correlation coefficient | ROI calculator, revenue attribution |
| **Effort** | 3 days | 3 weeks |

### R12. Trend Analysis

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Data Points** | Weekly snapshots | Daily with configurable frequency |
| **Trends** | Up/down/stable indicator | Trend lines, seasonality detection, forecasting |
| **Alerts** | Email on threshold breach | Multi-channel alerts with escalation |
| **Comparison** | Self over time | vs competitors, vs industry benchmarks |
| **Effort** | **Config only** (cron + same manifest) | 3 weeks (trend detection, alerts UI) |

> **Note:** MVP is a cron job running the same manifest weekly. Trend detection is comparing JSON results over time - no Bentham changes.

### R13. Content Performance Metrics

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Tracking** | Citation count by URL | Citations + traffic + conversions |
| **Grouping** | By page | By content type, collection, author |
| **Insights** | Top/bottom performers list | Performance drivers analysis |
| **Actions** | Manual optimization trigger | Auto-queue underperformers for optimization |
| **Effort** | 3 days | 2 weeks |

### R14. Walmart & Flipkart AI Adapters

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Walmart** | Search results scraping | Walmart AI assistant queries |
| **Flipkart** | Search results scraping | Flipkart AI assistant queries |
| **Data** | Brand mentions in results | Full response capture, citations |
| **Regions** | US (Walmart), IN (Flipkart) | Multi-region |
| **Effort** | 1 week per adapter | 3 weeks per adapter |

### R15. Near-Me Query Optimization

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Data Import** | CSV upload of retailer locations | API sync with store locator providers |
| **Queries** | 5 "near me" template queries | Full local query coverage |
| **Analysis** | Visibility by city | Heat map, coverage gaps |
| **Recommendations** | List missing locations | Google Business optimization, local content suggestions |
| **Effort** | 1 week | 4 weeks |

---

## Backlog Features

### 1. Schedule Optimization (Auto-Scoring Alerts)

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Scheduling** | Weekly runs only | Daily/weekly/monthly, custom schedules |
| **Thresholds** | Single global threshold | Per-surface, per-query thresholds |
| **Alerts** | Email notification | Multi-channel with snooze, escalation |
| **Automation** | Alert only | Auto-trigger optimization on drop |
| **Effort** | 4 days | 3 weeks |

### 2. Highlight Change in PDP Optimization

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Diff Display** | Text diff with ins/del | Side-by-side with word-level highlighting |
| **Reasons** | Category only (e.g., "keyword optimization") | Full explanation with supporting data |
| **Impact** | None | Predicted visibility impact score |
| **Interactivity** | View only | Accept/reject per change |
| **Effort** | 3 days | 2 weeks |

### 3. Version History for PDP Optimization

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Storage** | Last 5 versions | Unlimited with configurable retention |
| **Comparison** | Current vs previous | Any version vs any version |
| **Restore** | Full restore only | Field-level selective restore |
| **Metadata** | Timestamp, source | User, scores at time, publish history |
| **Effort** | 4 days | 2 weeks |

### 4. Enhanced Product Selection (NLP)

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Parsing** | Predefined patterns ("top N by X") | Free-form natural language |
| **Metrics** | Sales revenue only | Revenue, units, views, conversion, margin |
| **Filters** | Collection, product type | All Shopify fields + custom metafields |
| **Clarification** | Error on ambiguity | Interactive clarification dialog |
| **Effort** | 1 week | 4 weeks |

### 5. Bulk Actions (Granular Optimization)

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Fields** | Alt text OR description (one at a time) | Any combination of fields |
| **Products** | Up to 50 products | Unlimited with batching |
| **Progress** | Completion percentage | Per-product status, pause/resume |
| **Review** | All-or-nothing approval | Per-product approval in batch |
| **Effort** | 1 week | 3 weeks |

### 6. Deeper Brand Tone Functionality

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Input** | Website URL only | Website + social + existing products |
| **Analysis** | Formality + personality detection | Full tone profile with examples |
| **Output** | JSON tone config | Editable tone document with guidelines |
| **Application** | Manual selection per optimization | Auto-apply with override option |
| **Effort** | 1 week | 4 weeks |

### 7. Integration with Review Apps

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Platforms** | Yotpo only | Yotpo, Judge.me, Stamped, Trustpilot, Bazaarvoice |
| **Data** | Rating + review count | Full review text, themes, sentiment |
| **Sync** | Daily batch | Real-time webhook |
| **Use in Optimization** | Show rating in UI | Incorporate review language into descriptions |
| **Effort** | 1 week | 4 weeks |

### 8. Collection Page Optimization

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Fields** | Title + description only | Title, description, meta, image alt, URL handle |
| **Analysis** | None | Product theme analysis, keyword extraction |
| **Competitor Intel** | None | Competitor collection comparison |
| **Preview** | Text only | Visual preview with products |
| **Effort** | 4 days | 2 weeks |

### 9. New Product Flow via Image Upload

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Images** | Single image | Multiple images with primary selection |
| **Analysis** | Object detection only | Objects, colors, materials, style, use case |
| **Content** | Title + short description | Full PDP content including tags, collections |
| **Refinement** | Regenerate all | Edit individual fields, regenerate specific |
| **Effort** | 1 week | 4 weeks |

### 10. Content Consistency & Inconsistency Flagging

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Checks** | Brand name spelling only | Claims, materials, sizing, certifications, tone |
| **Scope** | Products only | Products + collections + pages |
| **Severity** | Binary (consistent/inconsistent) | Critical/warning/info levels |
| **Fix** | Manual | Auto-fix suggestions, bulk apply |
| **Effort** | 4 days | 3 weeks |

### 11. Custom Prompt Addition

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Input** | Text field for prompt | Prompt builder with category/intent tagging |
| **Validation** | None | Duplicate detection, relevance scoring |
| **Suggestions** | None | AI-suggested prompts based on gaps |
| **Management** | Add/delete | Edit, bulk import/export, organize by category |
| **Effort** | 2 days | 2 weeks |

### 12. Visibility Scan (Quick Assessment)

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Queries** | 10 queries | 20 queries with category coverage |
| **Surfaces** | 3 surfaces | All 8+ surfaces |
| **Competitors** | 5 | 10+ with auto-detection |
| **Speed** | ~2 minutes | ~30 seconds (parallel execution) |
| **Insights** | Score + rank | Trends, quick wins, competitor gaps |
| **Effort** | **Config only** (manifest template) | 3 days (UI + auto-detection) |

> **Note:** MVP is purely a manifest template - no code changes. Just create `quick-scan.manifest.json`.

### 13. AI Playground

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Surfaces** | 3 (ChatGPT, Google, Perplexity) | All available surfaces |
| **Analysis** | Brand mentioned yes/no | Position, sentiment, competitor comparison |
| **History** | None | Query history with favorites |
| **Sharing** | None | Share results, export |
| **Effort** | 3 days | 2 weeks |

### 14. Prompt Analysis (Deep Dive)

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Coverage Gaps** | Missing prompt list | Volume estimates, competitor presence |
| **Intent Analysis** | Predefined intent types | Custom intent definitions |
| **Geography** | None | Multi-region comparison |
| **Platform** | Basic per-platform view | Cross-platform positioning analysis |
| **Hallucinations** | Flagged only | Correction suggestions, source mapping |
| **Effort** | 1 week | 4 weeks |

### 15. Competitive Answer Analysis

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Competitors** | User-defined only | Auto-detected + user-defined |
| **Analysis** | Mention frequency | Content depth, claims, citations, structure |
| **Comparison** | Table view | Visual competitive map |
| **Recommendations** | None | Specific content gaps to address |
| **Effort** | 4 days | 3 weeks |

### 16. Trust, Citations & Knowledge Source Mapping

| Aspect | MVP | Full Feature |
|--------|-----|--------------|
| **Citation Tracking** | URLs + domains | Domain authority, content assessment |
| **Third-Party Check** | Trustpilot only | All major platforms (Reddit, Quora, news) |
| **Recommendations** | List missing sources | Prioritized action plan with templates |
| **Monitoring** | Snapshot | Continuous with change alerts |
| **Effort** | 1 week | 4 weeks |

---

# MVP BUILD SEQUENCE

Recommended order to build MVPs for fastest time-to-value:

## Sprint 1 (Week 1-2): Quick Wins
Ship 5 features with infrastructure already ready:
1. **LLM Reachability Audit** - Just expose existing collector
2. **Visibility Scan MVP** - 10 queries, 3 surfaces
3. **AI Playground MVP** - 3 surfaces, basic analysis
4. **Review Citation Tracking MVP** - Flag review URLs in citations
5. **Custom Prompt Addition MVP** - Simple text input

## Sprint 2 (Week 3-4): Core Value
6. **Discovery Scan MVP** - 3 verticals, 10 queries each
7. **Highlight Change MVP** - Text diff with category reasons
8. **Content Performance MVP** - Citation count by URL
9. **Competitive Answer Analysis MVP** - Frequency table
10. **Trust/Citation Mapping MVP** - Domain breakdown

## Sprint 3 (Week 5-6): Workflow
11. **Staged Content Review MVP** - Simple approve/reject queue
12. **Schedule Optimization MVP** - Weekly runs, email alerts
13. **Version History MVP** - Last 5 versions, full restore
14. **Prioritization Framework MVP** - Single-score ranking
15. **llms.txt Generation MVP** - Template-based, manual download

## Sprint 4 (Week 7-8): Optimization Features
16. **Collection Optimization MVP** - Title + description
17. **Bulk Actions MVP** - One field at a time, 50 products
18. **Consistency Checking MVP** - Brand name only
19. **Trend Analysis MVP** - Weekly snapshots, up/down indicator
20. **Prompt Analysis MVP** - Coverage gaps, intent types

## Sprint 5+ (Week 9+): Platform Integrations & Advanced
21. **Dual-Path Ingestion** - Shopify API
22. **Review App Integration** - Yotpo
23. **GA4 Correlation** - CSV upload
24. **New Product Workflow** - Manual trigger
25. **Brand Tone Generation** - Website analysis only

---

# EFFORT SUMMARY

| Category | MVP Total | Full Feature Total |
|----------|-----------|-------------------|
| Roadmap Features (R1-R15) | ~8 weeks | ~35 weeks |
| Backlog Features (1-16) | ~7 weeks | ~40 weeks |
| **Combined** | **~15 weeks** | **~75 weeks** |

With 2 engineers working in parallel: **~8 weeks to ship all MVPs**

---

# FEATURE CATEGORIZATION BY WORK TYPE

## Category 1: Config Only (Manifest Templates)
**No code changes to Bentham. Just create manifest JSON files.**

| Feature | What to Create |
|---------|----------------|
| R1. Discovery Scan (MVP) | `discovery-{vertical}.manifest.json` templates |
| R10. Citation A/B Testing (MVP) | Run same manifest before/after changes |
| R12. Trend Analysis (MVP) | Cron job + same manifest weekly |
| #12. Visibility Scan (MVP) | `quick-scan.manifest.json` with 10 queries, 3 surfaces |
| #11. Custom Prompts (MVP) | Add prompts to existing manifest |

**Effort: ~2 days total for all manifest templates**

## Category 2: Analysis Layer (Glu Scripts on Bentham Output)
**No Bentham changes. Write scripts/services that analyze existing JSON output.**

| Feature | Analysis Needed |
|---------|-----------------|
| R3. Prioritization Framework | Score products from visibility data |
| R7. Review Citation Tracking | Filter citations for review platform URLs |
| R13. Content Performance | Aggregate citations by URL |
| #14. Prompt Analysis | Classify queries by intent, detect gaps |
| #15. Competitive Answer Analysis | Parse competitor mentions from responses |
| #16. Trust/Citation Mapping | Categorize citation domains |
| #2. Highlight Change | Diff algorithm on before/after content |
| #10. Consistency Checking | Compare text across products |

**Effort: ~3-5 days each, pure Glu layer**

## Category 3: Glu Services (New Backend Services)
**New services in Glu, but no Bentham changes.**

| Feature | Service Needed |
|---------|----------------|
| R4. Multi-Format Output | Template engine (Handlebars/EJS) |
| R5. llms.txt Generation | Generation prompts + file output |
| R8. Staged Content Review | Approval queue + workflow |
| R9. New Product Workflow | Webhook listener + content generation |
| #1. Schedule Optimization | Scoring service + alert dispatch |
| #3. Version History | Version storage + restore logic |
| #5. Bulk Actions | Job queue for batch processing |
| #6. Brand Tone | Tone analysis AI service |
| #8. Collection Optimization | Collection-specific prompts |
| #13. AI Playground | Real-time query wrapper + UI |

**Effort: ~1-2 weeks each**

## Category 4: External Integrations (APIs)
**Connect to external services. No Bentham changes.**

| Feature | Integration |
|---------|-------------|
| R2. Dual-Path Ingestion | Shopify Admin API |
| R6. Tag State Extraction | Shopify Admin API |
| R11. Traffic Correlation | GA4 API |
| R15. Near-Me Optimization | Retailer data import |
| #4. NLP Product Selection | Shopify API + Claude/GPT |
| #7. Review Integration | Yotpo, Judge.me, Trustpilot APIs |

**Effort: ~1-2 weeks each**

## Category 5: New Bentham Adapters (Actual Bentham Code)
**Only these require changes to Bentham core.**

| Feature | Bentham Change |
|---------|----------------|
| R14. Walmart AI Adapter | New surface adapter in `surface-adapters/` |
| R14. Flipkart AI Adapter | New surface adapter in `surface-adapters/` |
| #9. Image-to-Content | Vision API integration (could be Glu-only) |

**Effort: ~1-2 weeks each**

---

# REVISED EFFORT SUMMARY

| Work Type | Feature Count | Total Effort |
|-----------|---------------|--------------|
| Config Only (manifests) | 5 | **2 days** |
| Analysis Layer (scripts) | 8 | **4 weeks** |
| Glu Services | 10 | **15 weeks** |
| External Integrations | 6 | **9 weeks** |
| New Bentham Adapters | 2-3 | **3 weeks** |
| **Total** | **31** | **~31 weeks** |

**Key Insight:** Only 2-3 features require actual Bentham code changes. Everything else is:
- Manifest templates (config)
- Analysis scripts on existing output (Glu)
- New Glu services (Glu)
- External API integrations (Glu)

---

# FEATURE DEPENDENCY GRAPH

## Foundation Layer (Build First)
These features have no dependencies and enable other features.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FOUNDATION LAYER                              │
│                       (No Dependencies)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Manifests]           [Bentham Collectors]      [External APIs]    │
│  ─────────────         ──────────────────        ──────────────     │
│  • Quick Scan          • Already built:          • Shopify Admin    │
│  • Discovery Scan        - citation-collector      API connection   │
│  • Full Study            - reachability-collector                   │
│    templates             - ai-surfaces-collector                    │
│                          - site-crawler                             │
│                          - all others                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Dependency Matrix

### Tier 1: No Dependencies (Ship Immediately)

| Feature | Depends On | Enables |
|---------|------------|---------|
| Visibility Scan (MVP) | Nothing | Trend Analysis, Schedule Optimization |
| AI Playground (MVP) | Nothing | Prompt Analysis |
| Discovery Scan (MVP) | Nothing | Competitive Analysis |
| LLM Reachability | Nothing | Content recommendations |
| Custom Prompts (MVP) | Nothing | All studies |
| Review Citation Tracking | Nothing | Trust/Citation Mapping |
| Content Performance | Nothing | Prioritization |

### Tier 2: Depends on Tier 1

| Feature | Depends On | Enables |
|---------|------------|---------|
| Trend Analysis | Visibility Scan (multiple runs) | Schedule Optimization |
| Competitive Answer Analysis | Discovery Scan OR study results | Prioritization |
| Prompt Analysis | AI Playground OR study results | Coverage gap detection |
| Trust/Citation Mapping | Review Citation Tracking | Source recommendations |
| Prioritization Framework | Content Performance + Competitive Analysis | Bulk Actions |

### Tier 3: Depends on Tier 2

| Feature | Depends On | Enables |
|---------|------------|---------|
| Schedule Optimization | Trend Analysis + Scoring | Automated workflows |
| Highlight Change | Diff algorithm | Version History |
| Staged Content Review | None (but better with Prioritization) | All publishing workflows |

### Tier 4: Depends on Tier 3

| Feature | Depends On | Enables |
|---------|------------|---------|
| Version History | Highlight Change (for diff display) | Restore workflows |
| Bulk Actions | Prioritization + Staged Review | Scale operations |
| New Product Workflow | Staged Review + Content Generation | Day-zero optimization |

### Tier 5: Depends on External Integrations

| Feature | Depends On | Enables |
|---------|------------|---------|
| NLP Product Selection | Shopify API integration | Enhanced UX |
| Tag State Extraction | Shopify API integration | Before/after comparison |
| Traffic Correlation | GA4 API integration | ROI measurement |
| Review Integration | Yotpo/Judge.me APIs | Review-informed optimization |
| Near-Me Optimization | Retailer data import | Local visibility |

### Tier 6: Advanced (Depends on Multiple Features)

| Feature | Depends On |
|---------|------------|
| Brand Tone Generation | Site Crawler + Analysis AI |
| Collection Optimization | Shopify API + Prioritization |
| Consistency Checking | All product content ingested |
| Image-to-Content | Vision AI + Brand Tone |
| Citation A/B Testing | Staged Review + Trend Analysis |
| Hallucination Detection | Trust/Citation Mapping + Fact database |

---

## Visual Dependency Flow

```
                                    ┌──────────────────┐
                                    │  MANIFEST        │
                                    │  TEMPLATES       │
                                    │  (Day 1)         │
                                    └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
          ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
          │ Visibility Scan │    │ Discovery Scan  │    │  AI Playground  │
          │     (Tier 1)    │    │    (Tier 1)     │    │    (Tier 1)     │
          └────────┬────────┘    └────────┬────────┘    └────────┬────────┘
                   │                      │                      │
                   ▼                      ▼                      ▼
          ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
          │ Trend Analysis  │    │  Competitive    │    │ Prompt Analysis │
          │     (Tier 2)    │    │   Analysis      │    │    (Tier 2)     │
          └────────┬────────┘    │    (Tier 2)     │    └─────────────────┘
                   │             └────────┬────────┘
                   │                      │
                   ▼                      ▼
          ┌─────────────────┐    ┌─────────────────┐
          │    Schedule     │    │ Prioritization  │
          │  Optimization   │    │   Framework     │
          │     (Tier 3)    │    │    (Tier 2)     │
          └─────────────────┘    └────────┬────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
          ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
          │  Bulk Actions   │    │ Staged Content  │    │ New Product     │
          │    (Tier 4)     │    │    Review       │    │   Workflow      │
          └─────────────────┘    │    (Tier 3)     │    │    (Tier 4)     │
                                 └────────┬────────┘    └─────────────────┘
                                          │
                                          ▼
                                 ┌─────────────────┐
                                 │ Version History │
                                 │    (Tier 4)     │
                                 └─────────────────┘
```

---

## Integration Dependencies

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SHOPIFY API INTEGRATION                         │
│                      (Unlock Multiple Features)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Once connected, enables:                                            │
│  • Dual-Path Ingestion (R2)                                         │
│  • Tag State Extraction (R6)                                        │
│  • NLP Product Selection (#4)                                       │
│  • Collection Optimization (#8)                                     │
│  • llms.txt Upload (R5)                                             │
│  • New Product Webhook (R9)                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        GA4 API INTEGRATION                           │
│                      (Unlock ROI Measurement)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Once connected, enables:                                            │
│  • AI Referral Traffic Correlation (R11)                            │
│  • Revenue Attribution                                               │
│  • ROI Calculations                                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     REVIEW PLATFORM INTEGRATION                      │
│                      (Unlock Review Features)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Once connected (Yotpo, Judge.me, Trustpilot), enables:             │
│  • Review Integration (#7)                                          │
│  • Review-Informed Optimization                                      │
│  • aggregateRating in JSON-LD                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Recommended Build Order

Based on dependencies, here's the optimal build sequence:

### Phase 1: Foundation (Week 1)
```
1. Create manifest templates (Visibility Scan, Discovery Scan)
2. Ship AI Playground MVP
3. Ship LLM Reachability (already built)
4. Ship Custom Prompts MVP
```
**Unlocks:** All Tier 2 features

### Phase 2: Analysis (Week 2-3)
```
5. Review Citation Tracking
6. Content Performance Metrics
7. Competitive Answer Analysis
8. Prompt Analysis
```
**Unlocks:** Prioritization, Trust Mapping

### Phase 3: Core Workflow (Week 4-5)
```
9. Staged Content Review (critical path)
10. Prioritization Framework
11. Trend Analysis
12. Highlight Change (diff)
```
**Unlocks:** Version History, Bulk Actions, Scheduling

### Phase 4: Shopify Integration (Week 5-6)
```
13. Shopify API connection
14. Tag State Extraction
15. Dual-Path Ingestion
16. Collection Optimization
```
**Unlocks:** NLP Selection, Webhooks, llms.txt upload

### Phase 5: Advanced Features (Week 7-8)
```
17. Version History
18. Bulk Actions
19. Schedule Optimization
20. New Product Workflow
```

### Phase 6: External Integrations (Week 9-10)
```
21. GA4 Integration
22. Review Platform Integration
23. Brand Tone Generation
24. llms.txt Generation + Upload
```

### Phase 7: Polish & Advanced (Week 11+)
```
25. NLP Product Selection
26. Image-to-Content
27. Consistency Checking
28. Walmart/Flipkart Adapters
29. Near-Me Optimization
30. Citation A/B Testing
31. Hallucination Detection
```

---

## Critical Path

The **critical path** (longest dependency chain) is:

```
Manifest Templates
       │
       ▼
Visibility Scan ──► Trend Analysis ──► Schedule Optimization
       │
       ▼
Discovery Scan ──► Competitive Analysis ──► Prioritization
                                                   │
                                                   ▼
                            Staged Review ──► Bulk Actions ──► New Product Workflow
                                   │
                                   ▼
                            Version History
```

**Critical path duration:** ~6 weeks

**Parallel tracks:**
- Shopify Integration (independent, Week 5-6)
- GA4 Integration (independent, Week 9-10)
- Review Integration (independent, Week 9-10)
