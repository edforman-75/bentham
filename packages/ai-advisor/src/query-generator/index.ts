/**
 * Query Generator Module
 *
 * Generates optimized queries for AI surfaces based on manifest context,
 * surface capabilities, and retry requirements.
 */

import type {
  QueryGenerationContext,
  GeneratedQuery,
  QueryStrategy,
  QueryMetadata,
} from '../types.js';

/**
 * Query generator configuration
 */
export interface QueryGeneratorConfig {
  /** Maximum query length (tokens) */
  maxQueryTokens?: number;
  /** Whether to enable query variation on retries */
  enableVariation?: boolean;
  /** Persona adaptation settings */
  personaSettings?: {
    formal?: boolean;
    techLevel?: 'beginner' | 'intermediate' | 'expert';
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: QueryGeneratorConfig = {
  maxQueryTokens: 4000,
  enableVariation: true,
  personaSettings: {
    formal: true,
    techLevel: 'intermediate',
  },
};

/**
 * Query Generator
 *
 * Generates optimized queries for different AI surfaces.
 */
export class QueryGenerator {
  private config: Required<QueryGeneratorConfig>;

  constructor(config: QueryGeneratorConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      personaSettings: {
        ...DEFAULT_CONFIG.personaSettings,
        ...config.personaSettings,
      },
    } as Required<QueryGeneratorConfig>;
  }

  /**
   * Generate a query for a given context
   */
  generate(context: QueryGenerationContext): GeneratedQuery {
    // Determine the best strategy
    const strategy = this.selectStrategy(context);

    // Generate query based on strategy
    let query: string;
    let systemPrompt: string | undefined;

    switch (strategy) {
      case 'direct':
        query = this.generateDirectQuery(context);
        break;
      case 'reformulated':
        query = this.generateReformulatedQuery(context);
        break;
      case 'expanded':
        query = this.generateExpandedQuery(context);
        break;
      case 'simplified':
        query = this.generateSimplifiedQuery(context);
        break;
      case 'persona_adapted':
        query = this.generatePersonaAdaptedQuery(context);
        break;
      default:
        query = this.generateDirectQuery(context);
    }

    // Generate system prompt if surface supports it
    if (context.surfaceContext?.capabilities?.supportsSystemPrompt) {
      systemPrompt = this.generateSystemPrompt(context);
    }

    // Build conversation history if needed
    const conversationHistory = this.buildConversationHistory(context);

    return {
      query,
      systemPrompt,
      conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
      metadata: this.createMetadata(strategy, query),
    };
  }

  /**
   * Generate multiple query variations
   */
  generateVariations(context: QueryGenerationContext, count: number = 3): GeneratedQuery[] {
    const variations: GeneratedQuery[] = [];
    const strategies: QueryStrategy[] = ['direct', 'reformulated', 'expanded', 'simplified'];

    // Use different strategies for each variation
    for (let i = 0; i < count && i < strategies.length; i++) {
      const variedContext = {
        ...context,
        previousQueries: [
          ...(context.previousQueries ?? []),
          ...variations.map(v => v.query),
        ],
      };

      const strategy = strategies[i];
      const query = this.generateByStrategy(variedContext, strategy);

      // Only add if it's different from existing variations
      if (!variations.some(v => this.isSimilar(v.query, query.query))) {
        variations.push(query);
      }
    }

    return variations;
  }

  /**
   * Select the best query strategy based on context
   */
  private selectStrategy(context: QueryGenerationContext): QueryStrategy {
    const { cellQuery, surfaceContext, isRetry, previousQueries } = context;

    // If this is a retry and we have previous queries, try a different approach
    if (isRetry && previousQueries && previousQueries.length > 0) {
      // Alternate between strategies
      const strategyIndex = previousQueries.length % 3;
      const retryStrategies: QueryStrategy[] = ['reformulated', 'simplified', 'expanded'];
      return retryStrategies[strategyIndex];
    }

    // Check surface capabilities
    const maxTokens = surfaceContext?.capabilities?.maxInputTokens ?? 4000;
    const estimatedTokens = this.estimateTokens(cellQuery.text);

    // If query is too long, simplify
    if (estimatedTokens > maxTokens * 0.8) {
      return 'simplified';
    }

    // If query is short and could benefit from context, expand
    if (estimatedTokens < maxTokens * 0.1) {
      return 'expanded';
    }

    // Default to direct for most cases
    return 'direct';
  }

  /**
   * Generate a direct query (minimal modification)
   */
  private generateDirectQuery(context: QueryGenerationContext): string {
    return context.cellQuery.text;
  }

  /**
   * Generate a reformulated query (improved clarity)
   */
  private generateReformulatedQuery(context: QueryGenerationContext): string {
    const original = context.cellQuery.text;

    // Basic reformulation: ensure question format, add please if needed
    let reformulated = original.trim();

    // Add question mark if it's missing for questions
    if (this.looksLikeQuestion(reformulated) && !reformulated.endsWith('?')) {
      reformulated += '?';
    }

    // Ensure polite phrasing
    if (!this.hasPolitePhrase(reformulated)) {
      reformulated = `Please ${reformulated.charAt(0).toLowerCase()}${reformulated.slice(1)}`;
    }

    return reformulated;
  }

  /**
   * Generate an expanded query (with additional context)
   */
  private generateExpandedQuery(context: QueryGenerationContext): string {
    const original = context.cellQuery.text;
    const { manifest } = context;

    // Build context prefix
    const contextParts: string[] = [];

    // Add study context if available
    if (manifest.description) {
      contextParts.push(`Context: ${manifest.description}`);
    }

    // Add study name as topic context
    if (manifest.name) {
      contextParts.push(`Topic: ${manifest.name}`);
    }

    // Build expanded query
    if (contextParts.length > 0) {
      return `${contextParts.join('. ')}.\n\n${original}`;
    }

    return original;
  }

  /**
   * Generate a simplified query (for token limits)
   */
  private generateSimplifiedQuery(context: QueryGenerationContext): string {
    const original = context.cellQuery.text;
    const maxTokens = context.surfaceContext?.capabilities?.maxInputTokens ?? 4000;

    // Estimate how much we need to trim
    const estimatedTokens = this.estimateTokens(original);

    if (estimatedTokens <= maxTokens * 0.8) {
      return original;
    }

    // Simplification strategies
    let simplified = original;

    // 1. Remove redundant phrases
    simplified = this.removeRedundantPhrases(simplified);

    // 2. Truncate to fit if still too long
    const maxChars = Math.floor(maxTokens * 3); // Rough token-to-char ratio
    if (simplified.length > maxChars) {
      simplified = simplified.slice(0, maxChars - 3) + '...';
    }

    return simplified;
  }

  /**
   * Generate a persona-adapted query
   */
  private generatePersonaAdaptedQuery(context: QueryGenerationContext): string {
    const original = context.cellQuery.text;
    const { formal, techLevel } = this.config.personaSettings;

    let adapted = original;

    // Adapt formality
    if (formal) {
      adapted = this.makeFormal(adapted);
    }

    // Adapt technical level
    if (techLevel === 'beginner') {
      adapted = this.simplifyTechnicalTerms(adapted);
    }

    return adapted;
  }

  /**
   * Generate query by specific strategy
   */
  private generateByStrategy(context: QueryGenerationContext, strategy: QueryStrategy): GeneratedQuery {
    let query: string;

    switch (strategy) {
      case 'direct':
        query = this.generateDirectQuery(context);
        break;
      case 'reformulated':
        query = this.generateReformulatedQuery(context);
        break;
      case 'expanded':
        query = this.generateExpandedQuery(context);
        break;
      case 'simplified':
        query = this.generateSimplifiedQuery(context);
        break;
      case 'persona_adapted':
        query = this.generatePersonaAdaptedQuery(context);
        break;
      default:
        query = this.generateDirectQuery(context);
    }

    return {
      query,
      metadata: this.createMetadata(strategy, query),
    };
  }

  /**
   * Generate system prompt for surfaces that support it
   */
  private generateSystemPrompt(context: QueryGenerationContext): string {
    const parts: string[] = [
      'You are a helpful assistant providing accurate and informative responses.',
    ];

    // Add study-specific instructions
    if (context.manifest.description) {
      parts.push(`Context: ${context.manifest.description}`);
    }

    // Add formatting instructions
    parts.push('Please provide clear, concise, and well-structured responses.');

    return parts.join(' ');
  }

  /**
   * Build conversation history if needed
   */
  private buildConversationHistory(
    _context: QueryGenerationContext
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    // For now, return empty array
    // Future: Could build from previous cell results in same study
    return [];
  }

  /**
   * Create query metadata
   */
  private createMetadata(strategy: QueryStrategy, query: string): QueryMetadata {
    return {
      strategy,
      estimatedTokens: this.estimateTokens(query),
      variationsAvailable: 3,
      generatedAt: new Date(),
    };
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if queries are similar
   */
  private isSimilar(query1: string, query2: string): boolean {
    // Simple similarity check - could be improved with embeddings
    const normalized1 = query1.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalized2 = query2.toLowerCase().replace(/\s+/g, ' ').trim();
    return normalized1 === normalized2;
  }

  /**
   * Check if text looks like a question
   */
  private looksLikeQuestion(text: string): boolean {
    const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does'];
    const firstWord = text.split(' ')[0].toLowerCase();
    return questionWords.includes(firstWord);
  }

  /**
   * Check if text has polite phrase
   */
  private hasPolitePhrase(text: string): boolean {
    const politeWords = ['please', 'kindly', 'could you', 'would you'];
    const lowerText = text.toLowerCase();
    return politeWords.some(word => lowerText.includes(word));
  }

  /**
   * Remove redundant phrases
   */
  private removeRedundantPhrases(text: string): string {
    const redundantPhrases = [
      'I would like you to',
      'Can you please',
      'I was wondering if you could',
      'I need you to',
      'Please help me',
      'I want to know',
    ];

    let cleaned = text;
    for (const phrase of redundantPhrases) {
      cleaned = cleaned.replace(new RegExp(phrase, 'gi'), '');
    }

    return cleaned.trim();
  }

  /**
   * Make text more formal
   */
  private makeFormal(text: string): string {
    // Simple formalization rules
    let formal = text;
    formal = formal.replace(/\bwanna\b/gi, 'want to');
    formal = formal.replace(/\bgonna\b/gi, 'going to');
    formal = formal.replace(/\bgotta\b/gi, 'have to');
    formal = formal.replace(/\bain't\b/gi, 'is not');
    return formal;
  }

  /**
   * Simplify technical terms (placeholder for more sophisticated implementation)
   */
  private simplifyTechnicalTerms(text: string): string {
    // This would ideally use a technical terms dictionary
    // For now, return as-is
    return text;
  }
}

/**
 * Create a query generator instance
 */
export function createQueryGenerator(config?: QueryGeneratorConfig): QueryGenerator {
  return new QueryGenerator(config);
}
