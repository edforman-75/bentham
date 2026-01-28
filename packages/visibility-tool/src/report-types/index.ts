/**
 * Report Types - Sophisticated prompt templates for Claude-generated reports
 *
 * Each report type defines:
 * - The structure and sections of the report
 * - The analytical framework to apply
 * - The tone and audience level
 * - The prompt template that Claude uses to generate the narrative
 */

export interface ReportType {
  id: string;
  name: string;
  description: string;
  audience: 'vp' | 'director' | 'manager' | 'technical';
  estimatedPages: string;
  sections: string[];
  generatePrompt: (context: ReportContext) => string;
}

export interface ReportContext {
  // Study metadata
  studyName: string;
  clientName: string;
  studyDate: string;

  // Brands
  primaryBrands: string[];
  competitorBrands: string[];
  segments: string[];

  // Data locations
  outputDir: string;

  // Test results summary (for context)
  testsRun: Array<{
    surface: string;
    country?: string;
    completionPct: number;
    passed: boolean;
  }>;

  // Key metrics (pre-computed for the prompt)
  metrics?: {
    avgJsonLdScore?: number;
    topPerformingBrand?: string;
    biggestGap?: string;
    surfacesWithMentions?: string[];
  };
}

/**
 * CEO/VP Strategic Report - Deckers Style
 *
 * This is the flagship report type, designed for executive audiences.
 * It provides strategic analysis of AI visibility with actionable recommendations.
 */
export const ceoStrategicReport: ReportType = {
  id: 'ceo-strategic',
  name: 'CEO Strategic Report',
  description: 'VP/CEO-level strategic analysis with competitive benchmarking, gap analysis, and prioritized recommendations. Similar to the Deckers, Natural Balance, and HUFT executive briefings.',
  audience: 'vp',
  estimatedPages: '15-25',
  sections: [
    'Executive Summary',
    'The AI Discovery Landscape',
    'Brand-by-Brand Analysis',
    'Competitive Positioning',
    'Product Page SSOT Assessment',
    'Amazon & E-Commerce Analysis',
    'Entity Coherence Assessment',
    'Strategic Recommendations',
    'Implementation Roadmap',
    'Appendix'
  ],
  generatePrompt: (ctx: ReportContext) => `You are a senior digital strategy consultant at a top-tier consulting firm (McKinsey, BCG, Bain caliber). You are preparing a VP/CEO-level strategic report on AI Visibility for ${ctx.clientName || 'the client'}.

═══════════════════════════════════════════════════════════════════════════════
STUDY CONTEXT
═══════════════════════════════════════════════════════════════════════════════

Study: ${ctx.studyName}
Date: ${ctx.studyDate}
Client: ${ctx.clientName || 'Confidential'}

PRIMARY BRANDS UNDER ANALYSIS:
${ctx.primaryBrands.map(b => `  • ${b}`).join('\n')}

COMPETITOR BRANDS FOR BENCHMARKING:
${ctx.competitorBrands.map(b => `  • ${b}`).join('\n')}

MARKET SEGMENTS: ${ctx.segments.join(', ') || 'General'}

TESTS EXECUTED:
${ctx.testsRun.map(t => `  • ${t.surface}${t.country ? ` (${t.country})` : ''}: ${t.completionPct}% complete ${t.passed ? '✓' : '✗'}`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
DATA FILES TO ANALYZE
═══════════════════════════════════════════════════════════════════════════════

All data is located in: ${ctx.outputDir}

Read and analyze these files:
1. manifest.json - Study configuration and brand details
2. job-state.json - Test execution results and completion metrics
3. jsonld-results.json - Product page structured data analysis (if exists)
4. Any *-results.json files for AI surface testing results

═══════════════════════════════════════════════════════════════════════════════
YOUR TASK: WRITE THE STRATEGIC REPORT
═══════════════════════════════════════════════════════════════════════════════

Create a comprehensive VP/CEO briefing document. This should be a polished,
professional report that could be presented to a Fortune 500 executive team.

CRITICAL REQUIREMENTS:
- Write in a confident, authoritative consulting voice
- Lead with insights, not data dumps
- Every section should answer "so what?" and "what do we do about it?"
- Use specific numbers and evidence from the data
- Compare primary brands against competitors throughout
- Prioritize recommendations by impact and effort

═══════════════════════════════════════════════════════════════════════════════
REQUIRED REPORT SECTIONS
═══════════════════════════════════════════════════════════════════════════════

1. EXECUTIVE SUMMARY (1-2 pages)

   Start with the headline: What is the overall AI visibility health of
   ${ctx.primaryBrands.join(', ')}?

   Include:
   - Overall AI visibility score/assessment (Strong/Moderate/Weak/Critical)
   - The #1 competitive threat in AI discovery
   - Top 3 priority actions with expected impact
   - Key metric: "X% of AI responses mention [primary brand] vs Y% for [top competitor]"

2. THE AI DISCOVERY LANDSCAPE (2-3 pages)

   Explain to executives why AI visibility matters NOW:
   - How consumers are shifting from Google to AI for product discovery
   - Which AI surfaces matter most for ${ctx.segments.join('/')} categories
   - The "zero-click" future: AI answers vs. website visits
   - What happens to brands that AI doesn't know about

   Include a simple framework showing the AI discovery funnel:
   Query → AI Processing → Brand Mention → Recommendation → Conversion

3. BRAND-BY-BRAND ANALYSIS (3-5 pages)

   For each primary brand (${ctx.primaryBrands.join(', ')}):

   a) AI Presence Score Card
      - Foundation Models (GPT-4, Gemini): Is the brand in the training data?
      - Search-Augmented AI (Perplexity, ChatGPT Browse): Does it appear in results?
      - Google AI Overviews: Featured or buried?
      - Amazon Rufus: Recommended or ignored?

   b) Competitive Position
      - Where does this brand rank vs competitors for key queries?
      - Which competitors are winning share of AI recommendations?

   c) Critical Gaps
      - Queries where competitors appear but this brand doesn't
      - Surfaces where the brand underperforms

4. COMPETITIVE POSITIONING MATRIX (2-3 pages)

   Create a clear competitive analysis:

   a) Share of AI Mentions by Brand
      Show a ranking of all brands by % of AI responses that mention them

   b) Head-to-Head Comparisons
      For key competitor pairs, who wins in AI recommendations?

   c) Competitive Threats
      Which competitors are over-indexing in AI visibility?
      What are they doing differently?

5. PRODUCT PAGE SSOT ASSESSMENT (2-3 pages)

   The Single Source of Truth analysis:

   a) Schema Quality Scores
      - Average JSON-LD score by brand
      - Grade distribution (A/B/C/D/F)
      - Comparison: primary brands vs competitors

   b) Critical Gaps
      - Missing required fields (name, price, availability, ratings)
      - Fields that competitors have but primary brands lack

   c) Impact Analysis
      - Correlation between schema quality and AI visibility
      - Revenue at risk from poor product page markup

6. AMAZON & E-COMMERCE ANALYSIS (2-3 pages)

   a) Amazon Brand Store Presence
      - Which brands have Amazon stores? Quality assessment.

   b) Amazon Product Content Quality
      - Bullet points, A+ content, brand messaging
      - How does Amazon content compare to DTC site?

   c) Rufus Readiness
      - Are products optimized for Amazon's AI shopping assistant?
      - What content is Rufus pulling from listings?

7. ENTITY COHERENCE ASSESSMENT (1-2 pages)

   Cross-channel brand consistency:

   a) Name/Identity Consistency
      - Is the brand name consistent across all surfaces?
      - Are product names matching across channels?

   b) Information Consistency
      - Do prices match? Availability? Descriptions?
      - Are there conflicting signals confusing AI?

   c) Authority Signals
      - Is the brand website the authoritative source?
      - Are third-party sites outranking for brand queries?

8. STRATEGIC RECOMMENDATIONS (3-4 pages)

   Prioritized action plan with three tiers:

   IMMEDIATE (0-30 days) - Quick wins
   - Specific actions that can be done this month
   - Expected impact on AI visibility
   - Owner/resource requirements

   SHORT-TERM (30-90 days) - Foundation building
   - Schema improvements
   - Content optimization
   - Amazon content updates

   LONG-TERM (90-180 days) - Competitive advantage
   - Strategic content initiatives
   - Brand authority building
   - AI-first content strategy

9. IMPLEMENTATION ROADMAP (1-2 pages)

   Visual timeline showing:
   - Phase 1: Foundation (Weeks 1-4)
   - Phase 2: Optimization (Weeks 5-12)
   - Phase 3: Expansion (Weeks 13-26)

   Include success metrics for each phase.

10. APPENDIX

    - Detailed scoring methodology
    - Full query list and results
    - Technical recommendations for development teams
    - Glossary of AI visibility terms

═══════════════════════════════════════════════════════════════════════════════
FORMATTING GUIDELINES
═══════════════════════════════════════════════════════════════════════════════

- Use clear section headers and subheaders
- Include "Key Insight" callout boxes for critical findings
- Use bullet points for lists, but write analysis in prose
- Include specific numbers: "Brand X appears in 67% of responses vs 23% for Brand Y"
- Add "Recommendation" boxes after each analytical section
- Use comparison language: "outperforms," "underperforms," "at parity with"

═══════════════════════════════════════════════════════════════════════════════
TONE AND STYLE
═══════════════════════════════════════════════════════════════════════════════

- Executive-level: Assume reader has 2 minutes per page
- Insight-led: Start sections with the "so what" not the methodology
- Action-oriented: Every insight should lead to a recommendation
- Confident but evidence-based: Make bold statements backed by data
- Avoid jargon: Explain technical concepts in business terms

Begin the report now. Read the data files first, then write the complete report.
`
};

/**
 * Competitive Intelligence Brief - Shorter, focused report
 */
export const competitiveIntelReport: ReportType = {
  id: 'competitive-intel',
  name: 'Competitive Intelligence Brief',
  description: 'Focused competitive analysis showing where you win and lose against specific competitors in AI visibility.',
  audience: 'director',
  estimatedPages: '8-12',
  sections: [
    'Executive Summary',
    'Competitive Landscape Overview',
    'Head-to-Head Analysis',
    'Gap Analysis',
    'Quick Wins',
    'Appendix'
  ],
  generatePrompt: (ctx: ReportContext) => `You are a competitive intelligence analyst preparing a focused brief on AI visibility competition.

STUDY: ${ctx.studyName}
CLIENT: ${ctx.clientName}
DATE: ${ctx.studyDate}

PRIMARY BRANDS: ${ctx.primaryBrands.join(', ')}
COMPETITORS: ${ctx.competitorBrands.join(', ')}

DATA LOCATION: ${ctx.outputDir}

Write a focused competitive intelligence brief (8-12 pages) that answers:
1. Who is winning in AI-powered product discovery?
2. Where are we losing to competitors?
3. What can we do about it in the next 30 days?

Focus on actionable competitive insights, not methodology. Use specific numbers and rankings throughout.

Sections:
1. Executive Summary (1 page) - Who's winning, who's losing, what to do
2. Competitive Landscape (2 pages) - Market map of AI visibility by brand
3. Head-to-Head Analysis (3 pages) - Direct comparisons for each competitor
4. Gap Analysis (2 pages) - Specific queries/surfaces where we lose
5. Quick Wins (2 pages) - Immediate actions to close gaps
6. Appendix - Supporting data

Read the data files and write the complete brief.
`
};

/**
 * Technical SEO Audit - For implementation teams
 */
export const technicalAuditReport: ReportType = {
  id: 'technical-audit',
  name: 'Technical SEO Audit',
  description: 'Detailed technical analysis of structured data and schema markup with specific implementation recommendations.',
  audience: 'technical',
  estimatedPages: '10-15',
  sections: [
    'Summary of Findings',
    'Schema Quality Assessment',
    'Field-by-Field Analysis',
    'Implementation Priorities',
    'Code Examples',
    'Testing Checklist'
  ],
  generatePrompt: (ctx: ReportContext) => `You are a technical SEO specialist preparing an implementation-focused audit report.

STUDY: ${ctx.studyName}
DATE: ${ctx.studyDate}

BRANDS AUDITED: ${ctx.primaryBrands.join(', ')}
DATA LOCATION: ${ctx.outputDir}

Write a technical audit report for the development/SEO team that includes:

1. Summary of Findings
   - Overall schema health score
   - Critical issues count
   - Priority fixes

2. Schema Quality Assessment
   - Score breakdown by category (identity, content, commerce, social, enrichment)
   - Comparison to schema.org best practices
   - Google Rich Results compatibility

3. Field-by-Field Analysis
   For each schema field, document:
   - Current implementation status
   - Issues found
   - Recommended fix
   - Priority (P0/P1/P2)

4. Implementation Priorities
   - P0: Breaking issues (fix immediately)
   - P1: Major gaps (fix this sprint)
   - P2: Enhancements (backlog)

5. Code Examples
   - Provide corrected JSON-LD snippets
   - Show before/after examples
   - Include validation notes

6. Testing Checklist
   - Steps to validate fixes
   - Tools to use (Google Rich Results Test, Schema Validator)
   - Success criteria

Be specific and technical. Include actual field names, values, and code.

Read the jsonld-results.json file and write the complete technical audit.
`
};

// Registry of all available report types
export const reportTypes: Record<string, ReportType> = {
  'ceo-strategic': ceoStrategicReport,
  'competitive-intel': competitiveIntelReport,
  'technical-audit': technicalAuditReport,
};

// Get report type by ID
export function getReportType(id: string): ReportType | undefined {
  return reportTypes[id];
}

// List all available report types
export function listReportTypes(): Array<{ id: string; name: string; description: string; audience: string }> {
  return Object.values(reportTypes).map(rt => ({
    id: rt.id,
    name: rt.name,
    description: rt.description,
    audience: rt.audience,
  }));
}

// Generate the prompt for a specific report type and context
export function generateReportPrompt(reportTypeId: string, context: ReportContext): string {
  const reportType = getReportType(reportTypeId);
  if (!reportType) {
    throw new Error(`Unknown report type: ${reportTypeId}`);
  }
  return reportType.generatePrompt(context);
}

// Build context from job results
export function buildReportContext(
  manifest: {
    name: string;
    brands: Array<{ name: string; category: string; segment?: string }>;
    outputDir: string;
    report?: { clientName?: string };
  },
  job?: {
    tests: Array<{
      test: { surface: string; country?: string; completionTarget: number };
      completionPercentage: number;
      meetsTarget: boolean;
    }>;
  }
): ReportContext {
  const primaryBrands = manifest.brands
    .filter(b => b.category === 'primary')
    .map(b => b.name);

  const competitorBrands = manifest.brands
    .filter(b => b.category === 'competitor')
    .map(b => b.name);

  const segments = [...new Set(manifest.brands.map(b => b.segment).filter(Boolean))] as string[];

  const testsRun = job?.tests.map(t => ({
    surface: t.test.surface,
    country: t.test.country,
    completionPct: t.completionPercentage,
    passed: t.meetsTarget,
  })) || [];

  return {
    studyName: manifest.name,
    clientName: manifest.report?.clientName || '',
    studyDate: new Date().toLocaleDateString(),
    primaryBrands,
    competitorBrands,
    segments,
    outputDir: manifest.outputDir,
    testsRun,
  };
}
