/**
 * Response Scorer Module
 *
 * Scores AI responses across multiple quality dimensions.
 */

import type {
  ScoringContext,
  ScoringResult,
  DimensionScore,
  ScoringDimension,
  ScoringMetadata,
} from '../types.js';

/**
 * Response scorer configuration
 */
export interface ResponseScorerConfig {
  /** Default dimensions to score if not specified */
  defaultDimensions?: ScoringDimension[];
  /** Weights for each dimension in overall score */
  dimensionWeights?: Partial<Record<ScoringDimension, number>>;
  /** Whether to generate explanations */
  generateExplanations?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<ResponseScorerConfig> = {
  defaultDimensions: ['relevance', 'completeness', 'clarity', 'coherence'],
  dimensionWeights: {
    relevance: 0.3,
    accuracy: 0.2,
    completeness: 0.2,
    clarity: 0.15,
    coherence: 0.1,
    helpfulness: 0.05,
    safety: 0,
    consistency: 0,
  },
  generateExplanations: true,
};

/**
 * Response Scorer
 *
 * Scores AI responses across multiple quality dimensions.
 */
export class ResponseScorer {
  private config: Required<ResponseScorerConfig>;

  constructor(config: ResponseScorerConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      dimensionWeights: {
        ...DEFAULT_CONFIG.dimensionWeights,
        ...config.dimensionWeights,
      },
    };
  }

  /**
   * Score a response
   */
  score(context: ScoringContext): ScoringResult {
    const startTime = Date.now();
    const dimensions = context.dimensions.length > 0
      ? context.dimensions
      : this.config.defaultDimensions;

    // Score each dimension
    const dimensionScores: DimensionScore[] = [];
    for (const dimension of dimensions) {
      const score = this.scoreDimension(context, dimension);
      dimensionScores.push(score);
    }

    // Calculate overall score
    const overallScore = this.calculateOverallScore(dimensionScores);

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(dimensionScores);

    // Generate overall explanation if enabled
    const explanation = this.config.generateExplanations
      ? this.generateOverallExplanation(dimensionScores, overallScore)
      : undefined;

    return {
      overallScore,
      dimensionScores,
      confidence,
      explanation,
      metadata: this.createMetadata(startTime),
    };
  }

  /**
   * Quick score (single dimension)
   */
  quickScore(response: string, query: string, dimension: ScoringDimension = 'relevance'): number {
    const context: ScoringContext = {
      query,
      response,
      dimensions: [dimension],
    };

    const result = this.score(context);
    return result.dimensionScores[0]?.score ?? 0;
  }

  /**
   * Compare two responses
   */
  compare(
    response1: string,
    response2: string,
    query: string,
    dimensions?: ScoringDimension[]
  ): {
    winner: 'response1' | 'response2' | 'tie';
    score1: ScoringResult;
    score2: ScoringResult;
    comparison: string;
  } {
    const dims = dimensions ?? this.config.defaultDimensions;

    const score1 = this.score({ query, response: response1, dimensions: dims });
    const score2 = this.score({ query, response: response2, dimensions: dims });

    let winner: 'response1' | 'response2' | 'tie';
    if (Math.abs(score1.overallScore - score2.overallScore) < 0.05) {
      winner = 'tie';
    } else if (score1.overallScore > score2.overallScore) {
      winner = 'response1';
    } else {
      winner = 'response2';
    }

    const comparison = this.generateComparison(score1, score2, winner);

    return { winner, score1, score2, comparison };
  }

  /**
   * Score a specific dimension
   */
  private scoreDimension(context: ScoringContext, dimension: ScoringDimension): DimensionScore {
    switch (dimension) {
      case 'relevance':
        return this.scoreRelevance(context);
      case 'accuracy':
        return this.scoreAccuracy(context);
      case 'completeness':
        return this.scoreCompleteness(context);
      case 'clarity':
        return this.scoreClarity(context);
      case 'coherence':
        return this.scoreCoherence(context);
      case 'helpfulness':
        return this.scoreHelpfulness(context);
      case 'safety':
        return this.scoreSafety(context);
      case 'consistency':
        return this.scoreConsistency(context);
      default:
        return { dimension, score: 0.5, confidence: 0.5 };
    }
  }

  /**
   * Score relevance
   */
  private scoreRelevance(context: ScoringContext): DimensionScore {
    const { query, response } = context;

    // Extract keywords from query
    const queryKeywords = this.extractKeywords(query);
    const responseText = response.toLowerCase();

    // Count keyword matches
    let matches = 0;
    for (const keyword of queryKeywords) {
      if (responseText.includes(keyword.toLowerCase())) {
        matches++;
      }
    }

    const score = queryKeywords.length > 0
      ? Math.min(1, matches / queryKeywords.length + 0.2) // Baseline of 0.2
      : 0.5;

    const explanation = this.config.generateExplanations
      ? `${matches}/${queryKeywords.length} query keywords found in response`
      : undefined;

    return {
      dimension: 'relevance',
      score: Math.min(1, Math.max(0, score)),
      confidence: queryKeywords.length > 3 ? 0.8 : 0.6,
      explanation,
    };
  }

  /**
   * Score accuracy (requires reference answer)
   */
  private scoreAccuracy(context: ScoringContext): DimensionScore {
    const { response, referenceAnswer } = context;

    if (!referenceAnswer) {
      return {
        dimension: 'accuracy',
        score: 0.5, // Neutral score when no reference
        confidence: 0.3,
        explanation: 'No reference answer available for accuracy scoring',
      };
    }

    // Compare with reference answer
    const similarity = this.calculateTextSimilarity(response, referenceAnswer);

    const explanation = this.config.generateExplanations
      ? `${Math.round(similarity * 100)}% similarity to reference answer`
      : undefined;

    return {
      dimension: 'accuracy',
      score: similarity,
      confidence: 0.7,
      explanation,
    };
  }

  /**
   * Score completeness
   */
  private scoreCompleteness(context: ScoringContext): DimensionScore {
    const { query, response } = context;

    // Factors for completeness:
    // 1. Response length relative to query complexity
    // 2. Coverage of query aspects
    // 3. Presence of examples/details

    const queryComplexity = this.estimateQueryComplexity(query);
    const responseLength = response.length;
    const expectedMinLength = queryComplexity * 100; // Rough estimate

    // Length-based score
    const lengthScore = Math.min(1, responseLength / expectedMinLength);

    // Aspect coverage
    const queryAspects = this.extractQueryAspects(query);
    let coveredAspects = 0;
    for (const aspect of queryAspects) {
      if (response.toLowerCase().includes(aspect.toLowerCase())) {
        coveredAspects++;
      }
    }
    const coverageScore = queryAspects.length > 0 ? coveredAspects / queryAspects.length : 1;

    // Has examples/details
    const hasExamples = /example|for instance|such as|e\.g\./i.test(response);
    const exampleBonus = hasExamples ? 0.1 : 0;

    const score = (lengthScore * 0.4 + coverageScore * 0.5 + exampleBonus);

    const explanation = this.config.generateExplanations
      ? `Covered ${coveredAspects}/${queryAspects.length} query aspects${hasExamples ? ' with examples' : ''}`
      : undefined;

    return {
      dimension: 'completeness',
      score: Math.min(1, score),
      confidence: 0.7,
      explanation,
    };
  }

  /**
   * Score clarity
   */
  private scoreClarity(context: ScoringContext): DimensionScore {
    const { response } = context;

    // Factors for clarity:
    // 1. Sentence length (shorter = clearer)
    // 2. Readability (simple words)
    // 3. Structure (paragraphs, lists)

    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / (sentences.length || 1);

    // Ideal sentence length: 15-20 words
    const sentenceLengthScore = avgSentenceLength <= 20 ? 1 : Math.max(0, 1 - (avgSentenceLength - 20) / 20);

    // Check for structure
    const hasStructure = /\n\n|\n-|\n\*|\n\d\./i.test(response);
    const structureBonus = hasStructure ? 0.15 : 0;

    // Check for overly complex words (approximation)
    const words = response.split(/\s+/);
    const longWords = words.filter(w => w.length > 12);
    const complexWordRatio = longWords.length / (words.length || 1);
    const complexityPenalty = Math.min(0.3, complexWordRatio);

    const score = sentenceLengthScore + structureBonus - complexityPenalty;

    const explanation = this.config.generateExplanations
      ? `Avg sentence: ${Math.round(avgSentenceLength)} words${hasStructure ? ', well-structured' : ''}`
      : undefined;

    return {
      dimension: 'clarity',
      score: Math.min(1, Math.max(0, score)),
      confidence: 0.7,
      explanation,
    };
  }

  /**
   * Score coherence
   */
  private scoreCoherence(context: ScoringContext): DimensionScore {
    const { response } = context;

    // Factors for coherence:
    // 1. Logical flow (transition words)
    // 2. No contradictions (hard to detect)
    // 3. Topic consistency

    // Check for transition words
    const transitionWords = ['however', 'therefore', 'furthermore', 'additionally', 'moreover', 'consequently', 'thus', 'hence', 'also', 'first', 'second', 'finally'];
    const hasTransitions = transitionWords.some(word =>
      response.toLowerCase().includes(word)
    );

    // Check for repeated ideas (might indicate poor organization)
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));
    const repetitionRatio = uniqueSentences.size / (sentences.length || 1);

    // Score based on factors
    const transitionScore = hasTransitions ? 0.9 : 0.7;
    const repetitionScore = repetitionRatio;

    const score = (transitionScore + repetitionScore) / 2;

    const explanation = this.config.generateExplanations
      ? `${hasTransitions ? 'Good transitions' : 'Limited transitions'}, ${Math.round(repetitionRatio * 100)}% unique content`
      : undefined;

    return {
      dimension: 'coherence',
      score,
      confidence: 0.6,
      explanation,
    };
  }

  /**
   * Score helpfulness
   */
  private scoreHelpfulness(context: ScoringContext): DimensionScore {
    const { query, response } = context;

    // Factors for helpfulness:
    // 1. Answers the question
    // 2. Actionable information
    // 3. Not evasive

    // Check if it's a direct answer (not evasive)
    const evasivePhrases = ['i cannot', "i'm not sure", 'it depends', 'i don\'t know'];
    const isEvasive = evasivePhrases.some(phrase =>
      response.toLowerCase().includes(phrase)
    );

    // Check for actionable content
    const actionableIndicators = ['you can', 'you should', 'try', 'here\'s how', 'steps', 'follow'];
    const hasActionable = actionableIndicators.some(indicator =>
      response.toLowerCase().includes(indicator)
    );

    // Check if question is answered (very simplified)
    const isQuestion = /\?|^(what|how|why|when|where|who|which|can|could|would|should)/i.test(query);
    const hasAnswer = !isQuestion || response.length > 50;

    let score = 0.5; // Baseline
    if (!isEvasive) score += 0.2;
    if (hasActionable) score += 0.2;
    if (hasAnswer) score += 0.1;

    const explanation = this.config.generateExplanations
      ? `${isEvasive ? 'Evasive' : 'Direct'}${hasActionable ? ', actionable' : ''}`
      : undefined;

    return {
      dimension: 'helpfulness',
      score: Math.min(1, score),
      confidence: 0.6,
      explanation,
    };
  }

  /**
   * Score safety
   */
  private scoreSafety(context: ScoringContext): DimensionScore {
    const { response } = context;

    // Check for unsafe patterns
    const unsafePatterns = [
      /\b(kill|murder|harm|attack)\b/i,
      /\b(hack|exploit|steal)\b/i,
      /\b(illegal|illicit)\b/i,
    ];

    let safetyScore = 1;
    for (const pattern of unsafePatterns) {
      if (pattern.test(response)) {
        safetyScore -= 0.2;
      }
    }

    return {
      dimension: 'safety',
      score: Math.max(0, safetyScore),
      confidence: 0.8,
      explanation: safetyScore < 1 ? 'Some potentially unsafe content detected' : 'Content appears safe',
    };
  }

  /**
   * Score consistency
   */
  private scoreConsistency(_context: ScoringContext): DimensionScore {
    // Consistency requires comparing to previous responses
    // Without prior context, return neutral score
    return {
      dimension: 'consistency',
      score: 0.5,
      confidence: 0.3,
      explanation: 'No prior context for consistency scoring',
    };
  }

  /**
   * Calculate overall score from dimension scores
   */
  private calculateOverallScore(dimensionScores: DimensionScore[]): number {
    if (dimensionScores.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const ds of dimensionScores) {
      const weight = this.config.dimensionWeights[ds.dimension] ?? 0.1;
      weightedSum += ds.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(dimensionScores: DimensionScore[]): number {
    if (dimensionScores.length === 0) return 0;

    const avgConfidence = dimensionScores.reduce((sum, ds) => sum + ds.confidence, 0) / dimensionScores.length;
    return avgConfidence;
  }

  /**
   * Generate overall explanation
   */
  private generateOverallExplanation(dimensionScores: DimensionScore[], overallScore: number): string {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    for (const ds of dimensionScores) {
      if (ds.score >= 0.7) {
        strengths.push(ds.dimension);
      } else if (ds.score < 0.5) {
        weaknesses.push(ds.dimension);
      }
    }

    const parts: string[] = [];
    parts.push(`Overall score: ${Math.round(overallScore * 100)}%`);

    if (strengths.length > 0) {
      parts.push(`Strengths: ${strengths.join(', ')}`);
    }

    if (weaknesses.length > 0) {
      parts.push(`Areas for improvement: ${weaknesses.join(', ')}`);
    }

    return parts.join('. ');
  }

  /**
   * Generate comparison text
   */
  private generateComparison(
    score1: ScoringResult,
    score2: ScoringResult,
    winner: 'response1' | 'response2' | 'tie'
  ): string {
    if (winner === 'tie') {
      return 'Both responses are approximately equal in quality.';
    }

    const winnerScore = winner === 'response1' ? score1 : score2;
    const loserScore = winner === 'response1' ? score2 : score1;

    const advantages: string[] = [];
    for (const ds of winnerScore.dimensionScores) {
      const otherDs = loserScore.dimensionScores.find(d => d.dimension === ds.dimension);
      if (otherDs && ds.score > otherDs.score + 0.1) {
        advantages.push(ds.dimension);
      }
    }

    return `${winner === 'response1' ? 'Response 1' : 'Response 2'} is better overall (${Math.round(winnerScore.overallScore * 100)}% vs ${Math.round(loserScore.overallScore * 100)}%), particularly in: ${advantages.join(', ') || 'overall quality'}.`;
  }

  /**
   * Create scoring metadata
   */
  private createMetadata(startTime: number): ScoringMetadata {
    return {
      durationMs: Date.now() - startTime,
      scoredAt: new Date(),
      scorerModel: 'rule-based',
      scorerVersion: '1.0.0',
    };
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by', 'for', 'with', 'about', 'to', 'from', 'in', 'out', 'on', 'off', 'up', 'down', 'what', 'how', 'why', 'where', 'who', 'which']);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Calculate text similarity (simple Jaccard-like measure)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.extractKeywords(text1));
    const words2 = new Set(this.extractKeywords(text2));

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        intersection++;
      }
    }

    const union = words1.size + words2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Estimate query complexity
   */
  private estimateQueryComplexity(query: string): number {
    // Simple heuristics for complexity
    const factors = [
      query.split(/\?/).length, // Number of questions
      query.split(/\band\b/i).length, // Compound requirements
      query.length / 50, // Length factor
    ];

    return Math.max(1, factors.reduce((a, b) => a + b, 0));
  }

  /**
   * Extract query aspects (key topics/requirements)
   */
  private extractQueryAspects(query: string): string[] {
    // Split by common delimiters
    const parts = query.split(/[,;]|\band\b|\balso\b/i);
    return parts
      .map(p => p.trim())
      .filter(p => p.length > 3)
      .slice(0, 5); // Limit to 5 aspects
  }
}

/**
 * Create a response scorer instance
 */
export function createResponseScorer(config?: ResponseScorerConfig): ResponseScorer {
  return new ResponseScorer(config);
}
