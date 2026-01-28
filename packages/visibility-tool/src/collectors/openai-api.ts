/**
 * OpenAI API Collector
 * Queries OpenAI models for brand mentions
 */

import OpenAI from 'openai';

export interface OpenAIResult {
  query: string;
  response: string;
  brandMentions: Record<string, number>;
  timestamp: string;
  model: string;
  tokensUsed: number;
}

export interface OpenAICollectorOptions {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

const DEFAULT_OPTIONS: OpenAICollectorOptions = {
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 1500,
  systemPrompt: 'You are a helpful shopping assistant. Provide detailed, informative responses about products and brands.',
};

export function countBrandMentions(text: string, brands: string[]): Record<string, number> {
  const mentions: Record<string, number> = {};
  const lowerText = text.toLowerCase();

  for (const brand of brands) {
    const regex = new RegExp(`\\b${brand.toLowerCase()}\\b`, 'gi');
    const matches = text.match(regex);
    mentions[brand] = matches ? matches.length : 0;
  }

  return mentions;
}

export async function queryOpenAI(
  query: string,
  brands: string[],
  options: Partial<OpenAICollectorOptions> = {}
): Promise<OpenAIResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const client = new OpenAI();

  const completion = await client.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    messages: [
      { role: 'system', content: opts.systemPrompt! },
      { role: 'user', content: query },
    ],
  });

  const response = completion.choices[0]?.message?.content || '';
  const brandMentions = countBrandMentions(response, brands);

  return {
    query,
    response,
    brandMentions,
    timestamp: new Date().toISOString(),
    model: opts.model,
    tokensUsed: completion.usage?.total_tokens || 0,
  };
}

export async function runQueries(
  queries: string[],
  brands: string[],
  options: Partial<OpenAICollectorOptions> = {},
  onProgress?: (completed: number, total: number, result: OpenAIResult) => void
): Promise<OpenAIResult[]> {
  const results: OpenAIResult[] = [];

  for (let i = 0; i < queries.length; i++) {
    const result = await queryOpenAI(queries[i], brands, options);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, queries.length, result);
    }

    // Small delay between requests to avoid rate limiting
    if (i < queries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

export function summarizeOpenAIResults(results: OpenAIResult[], brands: string[]): {
  totalQueries: number;
  totalMentions: Record<string, number>;
  mentionRate: Record<string, number>;
  topBrands: Array<{ brand: string; mentions: number; rate: number }>;
} {
  const totalMentions: Record<string, number> = {};

  for (const brand of brands) {
    totalMentions[brand] = 0;
  }

  for (const result of results) {
    for (const [brand, count] of Object.entries(result.brandMentions)) {
      totalMentions[brand] = (totalMentions[brand] || 0) + count;
    }
  }

  const mentionRate: Record<string, number> = {};
  for (const brand of brands) {
    const queriesWithMention = results.filter(r => r.brandMentions[brand] > 0).length;
    mentionRate[brand] = Math.round((queriesWithMention / results.length) * 100);
  }

  const topBrands = brands
    .map(brand => ({
      brand,
      mentions: totalMentions[brand],
      rate: mentionRate[brand],
    }))
    .sort((a, b) => b.mentions - a.mentions);

  return {
    totalQueries: results.length,
    totalMentions,
    mentionRate,
    topBrands,
  };
}
