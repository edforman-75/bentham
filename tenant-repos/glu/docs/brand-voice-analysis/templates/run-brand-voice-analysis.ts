#!/usr/bin/env npx tsx
/**
 * Brand Voice Analysis & Catalog Rewriting Tool
 *
 * Extracts authentic brand voice from existing content and generates
 * optimized product descriptions that sound like the brand, not AI.
 *
 * Usage:
 *   npx tsx run-brand-voice-analysis.ts --config brand.manifest.json
 *   npx tsx run-brand-voice-analysis.ts --brand "HUFT" --shopify-export products.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// TYPES
// ============================================================================

interface BrandManifest {
  id: string;
  name: string;
  market: string;
  shopify_domain?: string;
  amazon_store_id?: string;
  categories: string[];
  sub_brands?: SubBrand[];
}

interface SubBrand {
  id: string;
  name: string;
  categories: string[];
  indicators: string[];
}

interface ProductInput {
  handle: string;
  current_title: string;
  current_description: string;
  category: string;
  sub_brand?: string;
  attributes: Record<string, any>;
  amazon?: {
    asin?: string;
    bullets?: string[];
    backend_keywords?: string;
  };
  images?: Array<{ filename: string; current_alt: string }>;
}

interface VoiceCharacteristic {
  attribute: string;
  style: string;
  evidence: string;
}

interface BrandVoiceGuide {
  brand_name: string;
  market: string;
  analysis_date: string;
  sample_size: number;
  core_characteristics: VoiceCharacteristic[];
  vocabulary: {
    quality: string[];
    process: string[];
    negative: string[];
    comfort: string[];
    brand_specific: string[];
  };
  sentence_patterns: {
    openers: string[];
    middle: string[];
    closers: string[];
  };
  sub_brands: SubBrandVoice[];
  ai_tells_to_avoid: string[];
  quality_checklist: string[];
}

interface SubBrandVoice {
  id: string;
  name: string;
  categories: string[];
  voice_character: string;
  target_emotion: string;
  vocabulary_emphasis: string[];
  tone_markers: string[];
}

interface ContentOutput {
  handle: string;
  enhanced_title: string;
  enhanced_description: string;
  faqs: Array<{ question: string; answer: string }>;
  json_ld: object;
  alt_texts: string[];
  validation: {
    passed: boolean;
    issues: string[];
    score: number;
  };
}

interface AnalysisReport {
  brand_name: string;
  analysis_date: string;
  sample_size: number;
  category_count: number;
  subbrand_count: number;
  vocab_pattern_count: number;
  ai_tell_count: number;
  automation_score: number;
  voice_guide: BrandVoiceGuide;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_AI_TELLS = [
  "elevate your",
  "experience the",
  "premium quality",
  "ensures",
  "providing",
  "designed to",
  "boasts",
  "features",
  "crafted with care",
  "whether you're looking for",
  "not only X but also Y",
  "take your X to the next level",
  "unlock the",
  "discover the",
];

const VOICE_EXTRACTION_PROMPT = `
You are a brand voice analyst. Analyze the following product descriptions from {{BRAND_NAME}} and extract their authentic brand voice.

PRODUCT DESCRIPTIONS TO ANALYZE:
{{DESCRIPTIONS}}

Extract and return a JSON object with:

1. core_characteristics: Array of {attribute, style, evidence}
   - Analyze: warmth, confidence, tone, perspective (brand vs product vs customer)

2. vocabulary: Object with arrays for:
   - quality: Words describing quality/value
   - process: Words describing how products are made
   - negative: "No X" or "without X" phrases
   - comfort: Words for comfort/feeling
   - brand_specific: Terms unique to this brand

3. sentence_patterns: Object with arrays for:
   - openers: How descriptions typically start
   - middle: Common middle-section patterns
   - closers: How descriptions typically end

4. sub_brands: Array of detected sub-brands with distinct voices (if any)
   Each: {id, name, categories, voice_character, target_emotion, vocabulary_emphasis, tone_markers}

5. ai_tells_to_avoid: Phrases that would sound generic/AI if used

6. quality_checklist: 8-10 items to verify before publishing

Return ONLY valid JSON, no markdown or explanation.
`;

const CONTENT_GENERATION_PROMPT = `
You are writing product content for {{BRAND_NAME}}.

BRAND VOICE RULES:
{{VOICE_GUIDE}}

PRODUCT TO OPTIMIZE:
- Handle: {{HANDLE}}
- Current Title: {{CURRENT_TITLE}}
- Current Description: {{CURRENT_DESCRIPTION}}
- Category: {{CATEGORY}}
- Attributes: {{ATTRIBUTES}}
{{#AMAZON}}
- Amazon Bullets: {{AMAZON_BULLETS}}
{{/AMAZON}}

Generate optimized content following the brand voice exactly. Return JSON:

{
  "enhanced_title": "60-90 chars, include key benefits",
  "enhanced_description": "150-250 words, HTML-ready with <p> and <ul>",
  "faqs": [{"question": "...", "answer": "..."}],  // 5-7 FAQs
  "json_ld": {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "...",
    "description": "...",
    "brand": {"@type": "Brand", "name": "{{BRAND_NAME}}"},
    "additionalProperty": [
      {"@type": "PropertyValue", "name": "...", "value": "..."}
    ]
  },
  "alt_texts": ["alt text for each image"]
}

Return ONLY valid JSON.
`;

// ============================================================================
// MAIN CLASS
// ============================================================================

class BrandVoiceAnalyzer {
  private client: Anthropic;
  private manifest: BrandManifest;
  private voiceGuide: BrandVoiceGuide | null = null;
  private outputDir: string;

  constructor(manifest: BrandManifest, outputDir: string) {
    this.client = new Anthropic();
    this.manifest = manifest;
    this.outputDir = outputDir;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  // --------------------------------------------------------------------------
  // Phase 1: Voice Extraction
  // --------------------------------------------------------------------------

  async extractVoice(products: ProductInput[]): Promise<BrandVoiceGuide> {
    console.log(`\n📊 Analyzing ${products.length} products for brand voice...\n`);

    // Sample descriptions for analysis
    const descriptions = products
      .slice(0, 100)
      .map(p => `[${p.category}] ${p.current_title}\n${p.current_description}`)
      .join('\n\n---\n\n');

    const prompt = VOICE_EXTRACTION_PROMPT
      .replace('{{BRAND_NAME}}', this.manifest.name)
      .replace('{{DESCRIPTIONS}}', descriptions);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const extracted = JSON.parse(content.text);

    this.voiceGuide = {
      brand_name: this.manifest.name,
      market: this.manifest.market,
      analysis_date: new Date().toISOString().split('T')[0],
      sample_size: products.length,
      ...extracted
    };

    // Save voice guide
    const guidePath = path.join(this.outputDir, `${this.manifest.id}-voice-guide.json`);
    fs.writeFileSync(guidePath, JSON.stringify(this.voiceGuide, null, 2));
    console.log(`✓ Voice guide saved to ${guidePath}`);

    return this.voiceGuide;
  }

  // --------------------------------------------------------------------------
  // Phase 2: Content Generation
  // --------------------------------------------------------------------------

  async generateContent(product: ProductInput): Promise<ContentOutput> {
    if (!this.voiceGuide) {
      throw new Error('Voice guide not loaded. Run extractVoice first.');
    }

    const prompt = CONTENT_GENERATION_PROMPT
      .replace('{{BRAND_NAME}}', this.manifest.name)
      .replace('{{VOICE_GUIDE}}', JSON.stringify(this.voiceGuide, null, 2))
      .replace('{{HANDLE}}', product.handle)
      .replace('{{CURRENT_TITLE}}', product.current_title)
      .replace('{{CURRENT_DESCRIPTION}}', product.current_description)
      .replace('{{CATEGORY}}', product.category)
      .replace('{{ATTRIBUTES}}', JSON.stringify(product.attributes))
      .replace('{{#AMAZON}}', product.amazon ? '' : '<!--')
      .replace('{{/AMAZON}}', product.amazon ? '' : '-->')
      .replace('{{AMAZON_BULLETS}}', product.amazon?.bullets?.join('\n') || '');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const generated = JSON.parse(content.text);
    const validation = this.validateOutput(generated);

    return {
      handle: product.handle,
      ...generated,
      validation
    };
  }

  // --------------------------------------------------------------------------
  // Phase 3: Batch Processing
  // --------------------------------------------------------------------------

  async processCatalog(products: ProductInput[]): Promise<ContentOutput[]> {
    console.log(`\n🔄 Processing ${products.length} products...\n`);

    const results: ContentOutput[] = [];
    const outputPath = path.join(this.outputDir, `${this.manifest.id}-catalog-output.json`);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        process.stdout.write(`  [${i + 1}/${products.length}] ${product.handle.slice(0, 40)}... `);

        const output = await this.generateContent(product);
        results.push(output);

        if (output.validation.passed) {
          console.log('✓');
        } else {
          console.log(`⚠ (${output.validation.issues.join(', ')})`);
        }

        // Save progress every 10 products
        if ((i + 1) % 10 === 0) {
          fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        }

        // Rate limiting
        await this.delay(500);

      } catch (error) {
        console.log(`✗ Error: ${error}`);
        results.push({
          handle: product.handle,
          enhanced_title: product.current_title,
          enhanced_description: product.current_description,
          faqs: [],
          json_ld: {},
          alt_texts: [],
          validation: { passed: false, issues: [`error: ${error}`], score: 0 }
        });
      }
    }

    // Final save
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n✓ Results saved to ${outputPath}`);

    return results;
  }

  // --------------------------------------------------------------------------
  // Phase 4: Validation
  // --------------------------------------------------------------------------

  validateOutput(content: any): { passed: boolean; issues: string[]; score: number } {
    const issues: string[] = [];

    // Title validation
    if (!content.enhanced_title || content.enhanced_title.length < 40) {
      issues.push('title_too_short');
    }
    if (content.enhanced_title && content.enhanced_title.length > 100) {
      issues.push('title_too_long');
    }

    // Description validation
    if (!content.enhanced_description || content.enhanced_description.length < 100) {
      issues.push('description_too_short');
    }

    // FAQ validation
    if (!content.faqs || content.faqs.length < 3) {
      issues.push('insufficient_faqs');
    }

    // AI tell detection
    const textToCheck = `${content.enhanced_title} ${content.enhanced_description}`.toLowerCase();
    for (const tell of DEFAULT_AI_TELLS) {
      if (textToCheck.includes(tell.toLowerCase())) {
        issues.push(`ai_tell:${tell}`);
      }
    }

    // JSON-LD validation
    if (!content.json_ld || !content.json_ld['@type']) {
      issues.push('invalid_json_ld');
    }

    const score = Math.max(0, 100 - (issues.length * 15));

    return {
      passed: issues.length === 0,
      issues,
      score
    };
  }

  // --------------------------------------------------------------------------
  // Phase 5: Report Generation
  // --------------------------------------------------------------------------

  generateReport(results: ContentOutput[]): AnalysisReport {
    if (!this.voiceGuide) {
      throw new Error('Voice guide not loaded');
    }

    const passed = results.filter(r => r.validation.passed).length;
    const failed = results.length - passed;

    const allIssues = results.flatMap(r => r.validation.issues);
    const aiTellCount = allIssues.filter(i => i.startsWith('ai_tell:')).length;

    const report: AnalysisReport = {
      brand_name: this.manifest.name,
      analysis_date: new Date().toISOString().split('T')[0],
      sample_size: results.length,
      category_count: new Set(results.map(r => r.handle.split('-')[0])).size,
      subbrand_count: this.voiceGuide.sub_brands?.length || 0,
      vocab_pattern_count:
        (this.voiceGuide.vocabulary.quality?.length || 0) +
        (this.voiceGuide.vocabulary.process?.length || 0) +
        (this.voiceGuide.vocabulary.brand_specific?.length || 0),
      ai_tell_count: aiTellCount,
      automation_score: Math.round((passed / results.length) * 100),
      voice_guide: this.voiceGuide
    };

    // Save report
    const reportPath = path.join(this.outputDir, `${this.manifest.id}-analysis-report.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`✓ Report saved to ${reportPath}`);

    // Generate HTML report
    this.generateHtmlReport(report, results);

    return report;
  }

  generateHtmlReport(report: AnalysisReport, results: ContentOutput[]): void {
    const templatePath = path.join(__dirname, 'analysis-report.template.html');

    if (!fs.existsSync(templatePath)) {
      console.log('⚠ HTML template not found, skipping HTML report');
      return;
    }

    let template = fs.readFileSync(templatePath, 'utf-8');

    // Simple template replacement
    template = template
      .replace(/\{\{BRAND_NAME\}\}/g, report.brand_name)
      .replace(/\{\{MARKET\}\}/g, report.voice_guide.market)
      .replace(/\{\{ANALYSIS_DATE\}\}/g, report.analysis_date)
      .replace(/\{\{SAMPLE_SIZE\}\}/g, String(report.sample_size))
      .replace(/\{\{CATEGORY_COUNT\}\}/g, String(report.category_count))
      .replace(/\{\{SUBBRAND_COUNT\}\}/g, String(report.subbrand_count))
      .replace(/\{\{VOCAB_PATTERN_COUNT\}\}/g, String(report.vocab_pattern_count))
      .replace(/\{\{AI_TELL_COUNT\}\}/g, String(report.ai_tell_count))
      .replace(/\{\{AUTOMATION_SCORE\}\}/g, String(report.automation_score));

    const htmlPath = path.join(this.outputDir, `${this.manifest.id}-analysis-report.html`);
    fs.writeFileSync(htmlPath, template);
    console.log(`✓ HTML report saved to ${htmlPath}`);
  }

  // --------------------------------------------------------------------------
  // Phase 6: Export for Shopify
  // --------------------------------------------------------------------------

  exportShopifyCSV(results: ContentOutput[]): void {
    const headers = [
      'Handle',
      'Title',
      'Body (HTML)',
      'Metafield: custom.faqs [json]',
      'Metafield: custom.json_ld [json]',
      'Image Alt Text'
    ];

    const rows = results.map(r => [
      r.handle,
      `"${r.enhanced_title.replace(/"/g, '""')}"`,
      `"${r.enhanced_description.replace(/"/g, '""')}"`,
      `"${JSON.stringify(r.faqs).replace(/"/g, '""')}"`,
      `"${JSON.stringify(r.json_ld).replace(/"/g, '""')}"`,
      `"${(r.alt_texts || []).join('|').replace(/"/g, '""')}"`
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const csvPath = path.join(this.outputDir, `${this.manifest.id}-shopify-import.csv`);
    fs.writeFileSync(csvPath, csv);
    console.log(`✓ Shopify CSV saved to ${csvPath}`);
  }

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  loadVoiceGuide(guidePath: string): void {
    if (!fs.existsSync(guidePath)) {
      throw new Error(`Voice guide not found: ${guidePath}`);
    }
    this.voiceGuide = JSON.parse(fs.readFileSync(guidePath, 'utf-8'));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Brand Voice Analysis & Catalog Rewriting Tool

Usage:
  npx tsx run-brand-voice-analysis.ts --config <manifest.json> --products <products.json>
  npx tsx run-brand-voice-analysis.ts --extract-only --config <manifest.json> --products <products.json>
  npx tsx run-brand-voice-analysis.ts --generate-only --config <manifest.json> --voice-guide <guide.json> --products <products.json>

Options:
  --config        Path to brand manifest JSON
  --products      Path to products JSON file
  --voice-guide   Path to existing voice guide (skip extraction)
  --output        Output directory (default: ./output)
  --extract-only  Only extract voice guide, don't generate content
  --generate-only Only generate content using existing voice guide
  --help          Show this help
`);
    process.exit(0);
  }

  // Parse arguments
  const configPath = args[args.indexOf('--config') + 1];
  const productsPath = args[args.indexOf('--products') + 1];
  const outputDir = args.includes('--output')
    ? args[args.indexOf('--output') + 1]
    : './output';
  const extractOnly = args.includes('--extract-only');
  const generateOnly = args.includes('--generate-only');
  const voiceGuidePath = args.includes('--voice-guide')
    ? args[args.indexOf('--voice-guide') + 1]
    : null;

  // Load manifest
  if (!configPath || !fs.existsSync(configPath)) {
    console.error('Error: --config required and must exist');
    process.exit(1);
  }
  const manifest: BrandManifest = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Load products
  if (!productsPath || !fs.existsSync(productsPath)) {
    console.error('Error: --products required and must exist');
    process.exit(1);
  }
  const products: ProductInput[] = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  BRAND VOICE ANALYSIS & CATALOG REWRITING                      ║
╠════════════════════════════════════════════════════════════════╣
║  Brand: ${manifest.name.padEnd(53)}║
║  Products: ${String(products.length).padEnd(50)}║
║  Output: ${outputDir.padEnd(52)}║
╚════════════════════════════════════════════════════════════════╝
`);

  const analyzer = new BrandVoiceAnalyzer(manifest, outputDir);

  // Phase 1: Extract voice (unless generate-only)
  if (!generateOnly) {
    await analyzer.extractVoice(products);
  } else if (voiceGuidePath) {
    analyzer.loadVoiceGuide(voiceGuidePath);
  }

  if (extractOnly) {
    console.log('\n✓ Voice extraction complete. Exiting (--extract-only mode).\n');
    process.exit(0);
  }

  // Phase 2-4: Generate and validate content
  const results = await analyzer.processCatalog(products);

  // Phase 5: Generate reports
  analyzer.generateReport(results);

  // Phase 6: Export for Shopify
  analyzer.exportShopifyCSV(results);

  // Summary
  const passed = results.filter(r => r.validation.passed).length;
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  COMPLETE                                                      ║
╠════════════════════════════════════════════════════════════════╣
║  Products processed: ${String(results.length).padEnd(40)}║
║  Passed validation: ${String(passed).padEnd(41)}║
║  Failed validation: ${String(results.length - passed).padEnd(41)}║
║  Success rate: ${(Math.round((passed / results.length) * 100) + '%').padEnd(46)}║
╚════════════════════════════════════════════════════════════════╝
`);
}

main().catch(console.error);
