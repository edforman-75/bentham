/**
 * AI Playground
 *
 * Real-time query execution across multiple AI surfaces.
 * Configuration driven by ai-playground.manifest.json.
 * Uses critical priority for immediate execution.
 *
 * Usage:
 *   npx ts-node ai-playground.ts "best running shoes for flat feet"
 *   npx ts-node ai-playground.ts --brand "Nike" "best running shoes"
 *   npx ts-node ai-playground.ts --use-orchestrator "query" # Use Bentham orchestrator
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
config();

// Load manifest configuration
const MANIFEST_PATH = path.join(__dirname, '../manifests/ai-playground.manifest.json');

interface PlaygroundManifest {
  execution: {
    priority: string;
    queryDelayMs: [number, number];
    timeouts: {
      queryTimeoutMs: number;
      studyTimeoutMs: number;
    };
  };
  surfaces: Array<{
    id: string;
    name: string;
    adapter: string;
    required: boolean;
  }>;
  completionCriteria: {
    requiredSurfaces: string[];
  };
}

// Types
interface PlaygroundResult {
  query: string;
  timestamp: string;
  brand?: string;
  config: {
    manifestPath: string;
    priority: string;
    surfaces: string[];
  };
  responses: SurfaceResponse[];
  comparison: ComparisonAnalysis;
}

interface SurfaceResponse {
  surface: string;
  surfaceId: string;
  response: string;
  durationMs: number;
  success: boolean;
  error?: string;
  brandMentioned: boolean;
  brandPosition?: number;
  brandSentiment?: 'positive' | 'neutral' | 'negative';
  competitorsMentioned: string[];
  citations?: { url: string; title?: string }[];
}

interface ComparisonAnalysis {
  brandMentionedIn: string[];
  brandNotMentionedIn: string[];
  consistentAcrossPlatforms: boolean;
  positioningDifferences: { surface: string; description: string }[];
  recommendations: string[];
}

// Load manifest
function loadManifest(): PlaygroundManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.warn(`Manifest not found at ${MANIFEST_PATH}, using defaults`);
    return {
      execution: {
        priority: 'critical',
        queryDelayMs: [0, 100],
        timeouts: { queryTimeoutMs: 15000, studyTimeoutMs: 60000 },
      },
      surfaces: [
        { id: 'chatgpt', name: 'ChatGPT', adapter: 'openai-responses-api', required: true },
        { id: 'perplexity', name: 'Perplexity', adapter: 'perplexity-api', required: true },
        { id: 'gemini', name: 'Gemini', adapter: 'gemini-api', required: true },
      ],
      completionCriteria: { requiredSurfaces: ['chatgpt', 'perplexity', 'gemini'] },
    };
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
}

// Surface adapters - matching Bentham adapter IDs
type SurfaceAdapter = (prompt: string, timeout: number) => Promise<{
  response: string;
  durationMs: number;
  citations?: Array<{ url: string; title?: string }>;
}>;

const ADAPTERS: Record<string, SurfaceAdapter> = {
  'openai-responses-api': async (prompt, timeout) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          tools: [{ type: 'web_search_preview' }],
          input: prompt,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const outputText = data.output?.find((o: any) => o.type === 'message')?.content?.[0]?.text || '';

      // Extract citations from annotations if present
      const citations: Array<{ url: string; title?: string }> = [];
      const annotations = data.output?.find((o: any) => o.type === 'message')?.content?.[0]?.annotations || [];
      for (const ann of annotations) {
        if (ann.type === 'url_citation' && ann.url) {
          citations.push({ url: ann.url, title: ann.title });
        }
      }

      return { response: outputText, durationMs: Date.now() - start, citations };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  'perplexity-api': async (prompt, timeout) => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw new Error('PERPLEXITY_API_KEY not set');

    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-large-128k-online',
          messages: [{ role: 'user', content: prompt }],
          return_citations: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Perplexity API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content || '';
      const citations = (data.citations || []).map((url: string) => ({ url }));

      return { response: responseText, durationMs: Date.now() - start, citations };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  'gemini-api': async (prompt, timeout) => {
    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY or GEMINI_API_KEY not set');

    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return { response: responseText, durationMs: Date.now() - start };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  'anthropic-api': async (prompt, timeout) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${error}`);
      }

      const data = await response.json();
      const responseText = data.content?.[0]?.text || '';

      return { response: responseText, durationMs: Date.now() - start };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  // SerpAPI adapter for Google AI Overview
  'serpapi': async (prompt, timeout) => {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) throw new Error('SERPAPI_KEY not set');

    const start = Date.now();
    const params = new URLSearchParams({
      q: prompt,
      api_key: apiKey,
      engine: 'google',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`https://serpapi.com/search?${params}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`SerpAPI error: ${response.status} ${error}`);
      }

      const data = await response.json();

      // Extract AI Overview if present
      const aiOverview = data.ai_overview?.text || data.answer_box?.snippet || '';
      const citations: Array<{ url: string; title?: string }> = [];

      // Extract organic results as citations
      for (const result of (data.organic_results || []).slice(0, 5)) {
        citations.push({ url: result.link, title: result.title });
      }

      return { response: aiOverview, durationMs: Date.now() - start, citations };
    } finally {
      clearTimeout(timeoutId);
    }
  },
};

// Analysis functions
function extractBrandMentions(text: string, brand: string): { mentioned: boolean; position: number | undefined } {
  const lowerText = text.toLowerCase();
  const lowerBrand = brand.toLowerCase();

  const mentioned = lowerText.includes(lowerBrand);
  if (!mentioned) return { mentioned: false, position: undefined };

  const segments = text.split(/[,\n•\-\d\.]+/).filter(s => s.trim());
  let position = 1;
  for (const segment of segments) {
    if (segment.toLowerCase().includes(lowerBrand)) {
      return { mentioned: true, position };
    }
    if (segment.match(/[A-Z][a-z]+/) && segment.trim().length > 2) {
      position++;
    }
  }

  return { mentioned: true, position: undefined };
}

function extractCompetitors(text: string, knownCompetitors: string[]): string[] {
  const lowerText = text.toLowerCase();
  return knownCompetitors.filter(comp => lowerText.includes(comp.toLowerCase()));
}

function analyzeSentiment(text: string, brand: string): 'positive' | 'neutral' | 'negative' {
  const lowerText = text.toLowerCase();
  const brandIndex = lowerText.indexOf(brand.toLowerCase());
  if (brandIndex === -1) return 'neutral';

  const start = Math.max(0, brandIndex - 100);
  const end = Math.min(text.length, brandIndex + brand.length + 100);
  const context = lowerText.slice(start, end);

  const positiveWords = ['best', 'top', 'excellent', 'great', 'premium', 'high-quality', 'recommended', 'popular', 'leading', 'favorite'];
  const negativeWords = ['worst', 'avoid', 'poor', 'bad', 'cheap', 'low-quality', 'complaints', 'issues', 'problems'];

  const positiveCount = positiveWords.filter(w => context.includes(w)).length;
  const negativeCount = negativeWords.filter(w => context.includes(w)).length;

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function generateRecommendations(responses: SurfaceResponse[], brand?: string): string[] {
  const recommendations: string[] = [];

  if (brand) {
    const mentionedIn = responses.filter(r => r.brandMentioned).map(r => r.surface);
    const notMentionedIn = responses.filter(r => !r.brandMentioned).map(r => r.surface);

    if (notMentionedIn.length > 0) {
      recommendations.push(`Brand not appearing in: ${notMentionedIn.join(', ')}. Consider improving content for these platforms.`);
    }

    const lowPositions = responses.filter(r => r.brandPosition && r.brandPosition > 3);
    if (lowPositions.length > 0) {
      recommendations.push(`Brand appears late in responses on: ${lowPositions.map(r => r.surface).join(', ')}. Work on authority signals.`);
    }

    const negativeSentiment = responses.filter(r => r.brandSentiment === 'negative');
    if (negativeSentiment.length > 0) {
      recommendations.push(`Negative sentiment detected on: ${negativeSentiment.map(r => r.surface).join(', ')}. Review cited sources.`);
    }
  }

  const allCompetitors = responses.flatMap(r => r.competitorsMentioned);
  const competitorCounts = allCompetitors.reduce((acc, c) => {
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const dominantCompetitors = Object.entries(competitorCounts)
    .filter(([_, count]) => count >= 2)
    .map(([name]) => name);

  if (dominantCompetitors.length > 0 && brand) {
    recommendations.push(`Competitors appearing across platforms: ${dominantCompetitors.join(', ')}. Analyze their content strategy.`);
  }

  return recommendations;
}

// Main execution - manifest-driven
async function runPlayground(
  query: string,
  options: { brand?: string; competitors?: string[]; surfaceIds?: string[] } = {}
): Promise<PlaygroundResult> {
  const manifest = loadManifest();
  const timestamp = new Date().toISOString();
  const responses: SurfaceResponse[] = [];

  const defaultCompetitors = [
    'Nike', 'Adidas', 'Lululemon', 'Under Armour', 'Patagonia',
    'Amazon', 'Walmart', 'Target', 'REI', "Dick's"
  ];
  const competitors = options.competitors || defaultCompetitors;

  // Filter surfaces based on options
  const surfacesToQuery = options.surfaceIds
    ? manifest.surfaces.filter(s => options.surfaceIds!.includes(s.id))
    : manifest.surfaces.filter(s => s.required);

  const timeout = manifest.execution.timeouts.queryTimeoutMs;

  console.log(`\n AI Playground [${manifest.execution.priority} priority]`);
  console.log(`Query: "${query}"`);
  if (options.brand) console.log(`Tracking brand: ${options.brand}`);
  console.log(`Surfaces: ${surfacesToQuery.map(s => s.name).join(', ')}`);
  console.log(`\n${'─'.repeat(60)}\n`);

  // Execute queries in parallel for speed (critical priority = no delays)
  const queryPromises = surfacesToQuery.map(async (surface) => {
    const adapter = ADAPTERS[surface.adapter];
    if (!adapter) {
      return {
        surface: surface.name,
        surfaceId: surface.id,
        response: '',
        durationMs: 0,
        success: false,
        error: `No adapter found for: ${surface.adapter}`,
        brandMentioned: false,
        competitorsMentioned: [],
      } as SurfaceResponse;
    }

    console.log(`Querying ${surface.name}...`);

    try {
      const result = await adapter(query, timeout);
      const brandAnalysis = options.brand
        ? extractBrandMentions(result.response, options.brand)
        : { mentioned: false, position: undefined };

      const surfaceResponse: SurfaceResponse = {
        surface: surface.name,
        surfaceId: surface.id,
        response: result.response,
        durationMs: result.durationMs,
        success: true,
        brandMentioned: brandAnalysis.mentioned,
        brandPosition: brandAnalysis.position,
        brandSentiment: options.brand ? analyzeSentiment(result.response, options.brand) : undefined,
        competitorsMentioned: extractCompetitors(result.response, competitors),
        citations: result.citations,
      };

      console.log(`${surface.name} (${result.durationMs}ms)`);
      return surfaceResponse;
    } catch (error) {
      console.log(`${surface.name}: ${error instanceof Error ? error.message : error}`);
      return {
        surface: surface.name,
        surfaceId: surface.id,
        response: '',
        durationMs: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        brandMentioned: false,
        competitorsMentioned: [],
      } as SurfaceResponse;
    }
  });

  // Wait for all queries to complete
  const results = await Promise.all(queryPromises);
  responses.push(...results);

  // Build comparison analysis
  const successfulResponses = responses.filter(r => r.success);
  const brandMentionedIn = successfulResponses.filter(r => r.brandMentioned).map(r => r.surface);
  const brandNotMentionedIn = successfulResponses.filter(r => !r.brandMentioned).map(r => r.surface);

  const positioningDifferences: { surface: string; description: string }[] = [];
  if (options.brand) {
    for (const r of successfulResponses) {
      if (r.brandMentioned && r.brandPosition) {
        positioningDifferences.push({
          surface: r.surface,
          description: `Position ${r.brandPosition}, Sentiment: ${r.brandSentiment || 'unknown'}`,
        });
      }
    }
  }

  const comparison: ComparisonAnalysis = {
    brandMentionedIn,
    brandNotMentionedIn,
    consistentAcrossPlatforms: brandMentionedIn.length === successfulResponses.length || brandNotMentionedIn.length === successfulResponses.length,
    positioningDifferences,
    recommendations: generateRecommendations(responses, options.brand),
  };

  // Print results
  console.log(`\n${'─'.repeat(60)}`);
  console.log('\n RESULTS\n');

  for (const r of responses) {
    const status = r.success ? '[OK]' : '[FAIL]';
    console.log(`\n### ${r.surface} ${status}`);
    if (r.success) {
      console.log(`Duration: ${r.durationMs}ms`);
      if (options.brand) {
        console.log(`Brand mentioned: ${r.brandMentioned ? `Yes (position ${r.brandPosition || '?'}, ${r.brandSentiment})` : 'No'}`);
      }
      if (r.competitorsMentioned.length > 0) {
        console.log(`Competitors: ${r.competitorsMentioned.join(', ')}`);
      }
      if (r.citations && r.citations.length > 0) {
        console.log(`Citations: ${r.citations.length}`);
      }
      console.log(`\nResponse preview:\n${r.response.slice(0, 500)}${r.response.length > 500 ? '...' : ''}`);
    } else {
      console.log(`Error: ${r.error}`);
    }
  }

  if (options.brand) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('\n COMPARISON ANALYSIS\n');
    console.log(`Brand mentioned in: ${comparison.brandMentionedIn.join(', ') || 'None'}`);
    console.log(`Brand NOT mentioned in: ${comparison.brandNotMentionedIn.join(', ') || 'None'}`);
    console.log(`Consistent across platforms: ${comparison.consistentAcrossPlatforms ? 'Yes' : 'No'}`);

    if (comparison.recommendations.length > 0) {
      console.log('\nRECOMMENDATIONS:');
      comparison.recommendations.forEach((rec, i) => console.log(`${i + 1}. ${rec}`));
    }
  }

  return {
    query,
    timestamp,
    brand: options.brand,
    config: {
      manifestPath: MANIFEST_PATH,
      priority: manifest.execution.priority,
      surfaces: surfacesToQuery.map(s => s.id),
    },
    responses,
    comparison,
  };
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('AI Playground - Manifest-driven real-time AI query testing');
    console.log('\nUsage: npx ts-node ai-playground.ts [options] "your query"');
    console.log('\nOptions:');
    console.log('  --brand BRAND      Track specific brand mentions');
    console.log('  --surfaces IDS     Comma-separated surface IDs (default: required surfaces from manifest)');
    console.log('\nExamples:');
    console.log('  npx ts-node ai-playground.ts "best running shoes"');
    console.log('  npx ts-node ai-playground.ts --brand Nike "best running shoes"');
    console.log('  npx ts-node ai-playground.ts --brand "TASC Performance" "best bamboo athletic wear"');
    console.log('  npx ts-node ai-playground.ts --surfaces chatgpt,perplexity "best shoes"');
    console.log(`\nManifest: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  let brand: string | undefined;
  let surfaceIds: string[] | undefined;

  // Parse --brand
  const brandIndex = args.indexOf('--brand');
  if (brandIndex !== -1 && args[brandIndex + 1]) {
    brand = args[brandIndex + 1];
    args.splice(brandIndex, 2);
  }

  // Parse --surfaces
  const surfacesIndex = args.indexOf('--surfaces');
  if (surfacesIndex !== -1 && args[surfacesIndex + 1]) {
    surfaceIds = args[surfacesIndex + 1].split(',').map(s => s.trim());
    args.splice(surfacesIndex, 2);
  }

  const query = args.join(' ');

  const result = await runPlayground(query, { brand, surfaceIds });

  // Save result
  const resultsDir = path.join(__dirname, '../results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const outputPath = path.join(resultsDir, `playground-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);

export { runPlayground, PlaygroundResult, SurfaceResponse, ComparisonAnalysis };
