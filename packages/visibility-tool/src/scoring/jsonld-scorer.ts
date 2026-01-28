/**
 * JSON-LD Quality Scorer
 * Evaluates Product schema markup quality for AI visibility
 */

export interface ScoringResult {
  score: number;
  grade: string;
  maxScore: number;
  breakdown: ScoreBreakdown;
  issues: string[];
  strengths: string[];
  recommendations: string[];
}

export interface ScoreBreakdown {
  identity: number;      // name, sku, mpn, gtin, brand
  content: number;       // description, images
  commerce: number;      // price, availability, offers
  social: number;        // ratings, reviews
  enrichment: number;    // category, color, material, etc.
}

export function scoreJsonLd(jsonLd: any[]): ScoringResult {
  const issues: string[] = [];
  const strengths: string[] = [];
  const recommendations: string[] = [];

  const breakdown: ScoreBreakdown = {
    identity: 0,
    content: 0,
    commerce: 0,
    social: 0,
    enrichment: 0,
  };

  if (!jsonLd || jsonLd.length === 0) {
    return {
      score: 0,
      grade: 'F',
      maxScore: 100,
      breakdown,
      issues: ['No JSON-LD structured data found'],
      strengths: [],
      recommendations: ['Add Product schema markup to all product pages'],
    };
  }

  const productSchema = jsonLd.find((item: any) =>
    item['@type'] === 'Product' ||
    (Array.isArray(item['@type']) && item['@type'].includes('Product'))
  );

  if (!productSchema) {
    return {
      score: 5,
      grade: 'F',
      maxScore: 100,
      breakdown,
      issues: ['JSON-LD present but no Product schema'],
      strengths: ['Has some structured data'],
      recommendations: ['Add @type: "Product" schema for product pages'],
    };
  }

  // === IDENTITY (25 points max) ===
  if (productSchema.name) {
    breakdown.identity += 8;
    strengths.push('Product name');
  } else {
    issues.push('Missing product name');
    recommendations.push('Add "name" property to Product schema');
  }

  if (productSchema.sku) {
    breakdown.identity += 5;
    strengths.push('SKU');
  }

  if (productSchema.mpn) {
    breakdown.identity += 4;
    strengths.push('MPN');
  }

  if (productSchema.gtin || productSchema.gtin13 || productSchema.gtin12) {
    breakdown.identity += 3;
    strengths.push('GTIN');
  }

  if (productSchema.brand?.['@type'] === 'Brand' && productSchema.brand?.name) {
    breakdown.identity += 5;
    strengths.push('Properly structured Brand');
  } else if (productSchema.brand) {
    breakdown.identity += 2;
    issues.push('Brand not properly structured');
    recommendations.push('Use @type: "Brand" with "name" property');
  } else {
    issues.push('Missing brand');
    recommendations.push('Add brand information to Product schema');
  }

  // === CONTENT (20 points max) ===
  if (productSchema.description) {
    const descLength = productSchema.description.length;
    if (descLength >= 150) {
      breakdown.content += 12;
      strengths.push(`Rich description (${descLength} chars)`);
    } else if (descLength >= 50) {
      breakdown.content += 8;
      strengths.push(`Description (${descLength} chars)`);
      recommendations.push('Expand description to 150+ characters for better AI context');
    } else {
      breakdown.content += 4;
      issues.push('Short description');
      recommendations.push('Description should be at least 150 characters');
    }
  } else {
    issues.push('Missing description');
    recommendations.push('Add detailed product description');
  }

  if (productSchema.image) {
    const imageCount = Array.isArray(productSchema.image) ? productSchema.image.length : 1;
    if (imageCount >= 3) {
      breakdown.content += 8;
      strengths.push(`Multiple images (${imageCount})`);
    } else {
      breakdown.content += 5;
      strengths.push('Has image');
      recommendations.push('Add multiple product images (3+ recommended)');
    }
  } else {
    issues.push('Missing images');
    recommendations.push('Add product images to schema');
  }

  // === COMMERCE (25 points max) ===
  const offer = Array.isArray(productSchema.offers)
    ? productSchema.offers[0]
    : productSchema.offers;

  if (offer) {
    if (offer['@type'] === 'Offer' || offer['@type'] === 'AggregateOffer') {
      breakdown.commerce += 5;
      strengths.push('Proper Offer structure');
    }

    if (offer.price && offer.priceCurrency) {
      breakdown.commerce += 10;
      strengths.push(`Price ($${offer.price} ${offer.priceCurrency})`);
    } else if (offer.price) {
      breakdown.commerce += 5;
      issues.push('Missing currency');
      recommendations.push('Add priceCurrency to Offer');
    } else {
      issues.push('Missing price');
      recommendations.push('Add price and priceCurrency to Offer - critical for shopping AI');
    }

    if (offer.availability) {
      breakdown.commerce += 5;
      strengths.push('Availability status');
    } else {
      recommendations.push('Add availability (InStock/OutOfStock) to Offer');
    }

    if (offer.url) {
      breakdown.commerce += 3;
    }

    if (offer.priceValidUntil) {
      breakdown.commerce += 2;
      strengths.push('Price validity date');
    }
  } else {
    issues.push('Missing offers/pricing');
    recommendations.push('Add Offer schema with price, currency, and availability');
  }

  // === SOCIAL PROOF (20 points max) ===
  if (productSchema.aggregateRating) {
    const rating = productSchema.aggregateRating;
    if (rating.ratingValue && rating.reviewCount) {
      breakdown.social += 15;
      strengths.push(`Rating ${rating.ratingValue}★ (${rating.reviewCount} reviews)`);
    } else if (rating.ratingValue) {
      breakdown.social += 8;
      strengths.push(`Rating ${rating.ratingValue}★`);
      recommendations.push('Add reviewCount to AggregateRating');
    }
  } else {
    issues.push('Missing AggregateRating');
    recommendations.push('Add AggregateRating - critical for AI recommendations');
  }

  if (productSchema.review) {
    const reviewCount = Array.isArray(productSchema.review) ? productSchema.review.length : 1;
    breakdown.social += Math.min(reviewCount, 5); // Max 5 points for reviews
    strengths.push(`${reviewCount} embedded review(s)`);
  }

  // === ENRICHMENT (10 points max) ===
  if (productSchema.category) {
    breakdown.enrichment += 3;
    strengths.push('Category');
  }

  if (productSchema.color) {
    breakdown.enrichment += 2;
    strengths.push('Color');
  }

  if (productSchema.material) {
    breakdown.enrichment += 2;
    strengths.push('Material');
  }

  if (productSchema.size || productSchema.width) {
    breakdown.enrichment += 2;
    strengths.push('Size info');
  }

  if (productSchema.additionalProperty) {
    breakdown.enrichment += 1;
    strengths.push('Additional properties');
  }

  // Calculate total score
  const score = breakdown.identity + breakdown.content + breakdown.commerce +
                breakdown.social + breakdown.enrichment;

  // Determine grade
  let grade: string;
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B+';
  else if (score >= 60) grade = 'B';
  else if (score >= 50) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  return {
    score,
    grade,
    maxScore: 100,
    breakdown,
    issues,
    strengths,
    recommendations: recommendations.slice(0, 5), // Top 5 recommendations
  };
}

export function getGradeColor(grade: string): string {
  const colors: Record<string, string> = {
    'A+': '#059669', // emerald
    'A': '#10b981',
    'B+': '#3b82f6', // blue
    'B': '#60a5fa',
    'C': '#f59e0b',  // amber
    'D': '#ef4444',  // red
    'F': '#dc2626',
  };
  return colors[grade] || '#6b7280';
}
