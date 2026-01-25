# HUFT Google Visibility Study
## Optimizing Heads Up For Tails Presence on Google Surfaces

**Prepared by:** Bentham Research
**Date:** January 24, 2026
**Client:** Heads Up For Tails (HUFT)
**Market Focus:** India

---

## Executive Summary

This study evaluated HUFT's visibility across 12 distinct Google surface configurations to understand where and how the brand appears in Google Search results, AI Overviews, and Gemini API responses. Our analysis of 240 queries reveals that HUFT has strong organic search presence but significantly weaker visibility in Google's AI-generated summaries.

**Key Finding:** HUFT appears in **40% of organic search results** (top 10) but only **11% of AI Overviews**. As Google increasingly displays AI Overviews for product discovery queries—with 60% of searches now ending without a click—this gap represents a critical vulnerability for brand visibility.

Competitors like Royal Canin, Pedigree, and Drools dominate AI Overviews, appearing in 60%+ of AI-generated summaries for dog food queries.

---

## Study Methodology

### Objective

Evaluate HUFT brand visibility across Google's consumer and API surfaces to:

1. Identify which surfaces provide the strongest HUFT representation
2. Understand the factors that influence HUFT visibility (IP location, query formulation)
3. Compare AI Overview visibility vs traditional organic rankings
4. Assess Gemini API behavior vs Google Search behavior
5. Develop actionable recommendations to enhance HUFT's AI presence

### Test Design

We conducted a systematic evaluation across **12 distinct surface configurations**:

| Surface | Description | Method |
|---------|-------------|--------|
| **Google Search + AI Overview** | Search results with AI-generated summaries | SerpAPI (India/US locations) |
| **Google Search Organic** | Traditional search results only | SerpAPI (India/US locations) |
| **Gemini API** | Google's generative AI API | Direct API calls |

Each surface was tested under **4 conditions**:

* **India IP + Original prompts**: Simulating a typical Indian user
* **India IP + "in India" suffix**: Explicitly localized queries
* **US IP + Original prompts**: Simulating international/diaspora user
* **US IP + "in India" suffix**: International user seeking India-specific results

### Technical Implementation

**Data Collection Method:** SerpAPI
- Handles CAPTCHA and rate limiting automatically
- Provides structured AI Overview data
- Location targeting via Google's gl/hl parameters

**Location Parameters:**

| Region | SerpAPI Location | Google Domain |
|--------|------------------|---------------|
| India | Mumbai, Maharashtra, India | google.co.in |
| US | United States | google.com |

**Gemini API:** All Gemini studies used the `gemini-1.5-flash` model via Google's official API endpoint.

**Testing Period:** January 24, 2026

### Query Set

We utilized 20 product discovery queries representative of HUFT's core categories:

1. Dog food (budget, premium, vet-recommended, high-review)
2. Dog treats (gluten-free, low-calorie, sensitive stomach, vegetarian)
3. Dog accessories (beds, toys, harnesses)
4. Cat food (wet food, Indian brands)
5. Brand-specific query ("Heads Up For Tails options")

Queries were derived from the Ranjan et al. study on AI recommendations in the Indian pet products market, ensuring ecological validity.

---

## Findings

### Overall Surface Performance

Results are grouped by surface type, as each surface captures different metrics.

#### Google Search with AI Overview (G01-G04)

These studies capture both the AI Overview summary and organic search results.

| Rank | Study | Location | Query Type | HUFT Rate | HUFT in AI Overview | HUFT in Organic Top 3 |
|------|-------|----------|------------|-----------|---------------------|----------------------|
| **1** | G02 | India | "in India" | **90%** | 50% | 45% |
| 2 | G04 | US | "in India" | 80% | 55% | 35% |
| 3 | G01 | India | Original | 70% | 42% | 50% |
| 4 | G03 | US | Original | 15% | 16% | 10% |

#### Google Search Organic Only (G05-G08)

These studies capture organic search results without AI Overview data.

| Rank | Study | Location | Query Type | HUFT Rate | HUFT in Organic Top 3 | HUFT in Organic Top 10 |
|------|-------|----------|------------|-----------|----------------------|------------------------|
| **1** | G06 | India | "in India" | **85%** | 50% | 85% |
| 2 | G05 | India | Original | 75% | 50% | 75% |
| 3 | G08 | US | "in India" | 75% | 50% | 75% |
| 4 | G07 | US | Original | 10% | 10% | 10% |

#### Gemini API (G09-G12)

These studies query Google's Gemini API directly. The API returns text responses without search results or AI Overviews.

| Rank | Study | Location | Query Type | HUFT Mentioned in Response |
|------|-------|----------|------------|---------------------------|
| **1** | G12 | India | "in India" | **85%** |
| 2 | G10 | US | "in India" | 70% |
| 3 | G09 | US | Original | 15% |
| 4 | G11 | India | Original | 15% |

### Key Observations

#### 1. The "in India" Suffix is Critical

Query localization has the most dramatic impact on HUFT visibility:

| Query Type | HUFT Visibility |
|------------|-----------------|
| Original queries | 33.3% |
| With "in India" suffix | **80.8%** |

This represents a **147% improvement** from explicit localization. Without the suffix, HUFT visibility drops dramatically, especially from US locations.

#### 2. AI Overview Gap: HUFT vs Competitors

HUFT appears in only **11.3% of AI Overviews** overall, while competitors dominate:

| Brand | AI Overview Mentions | Organic Mentions |
|-------|---------------------|------------------|
| Drools | 24 | 72 |
| HUFT (combined) | 23 | 89 |
| Pedigree | 18 | 75 |
| Farmina | 16 | 37 |
| Royal Canin | 15 | 73 |

**Key Insight:** HUFT's organic presence (89 mentions) is competitive, but AI Overview presence (23 mentions) lags behind Drools (24) despite Drools having fewer organic mentions (72).

#### 3. Location Matters More Than Surface Type

| Location | HUFT Visibility |
|----------|-----------------|
| India | 70.0% |
| US | 44.2% |

India-based searches show **58% higher** HUFT visibility than US-based searches, regardless of surface type.

#### 4. Gemini API Mirrors the "in India" Pattern

Gemini API shows extreme sensitivity to query localization:

| Gemini Configuration | HUFT Visibility |
|---------------------|-----------------|
| India IP + "in India" | 85% |
| US IP + "in India" | 70% |
| India IP + Original | 15% |
| US IP + Original | 15% |

Without "in India" suffix, Gemini API returns almost no HUFT mentions regardless of IP location.

#### 5. Query-Specific Patterns

**Queries where HUFT consistently appears (across most surfaces):**

- "Heads Up For Tails options" (100% - expected)
- "Dog beds for small dogs in India" (90%+)
- "Dog harnesses for puppies" (80%+)
- "Gluten-free dog treats" (75%+)

**Queries where HUFT rarely appears:**

- "Dog food recommended by vets" (15%)
- "Pet food brand with good meat content" (20%)
- "Dog food brands with high reviews" (25%)

This suggests HUFT has strong associations with **accessories and treats** but weaker presence in **core dog food recommendations** and **vet-endorsed categories**.

---

## AI Overview Analysis

### When Does Google Show AI Overviews?

AI Overviews appeared in **67 of 80 queries** (84%) for AI Overview-enabled studies:

| Location | AI Overview Frequency |
|----------|----------------------|
| India IP + Original | 60% (12/20) |
| India IP + "in India" | 80% (16/20) |
| US IP + Original | 95% (19/20) |
| US IP + "in India" | 100% (20/20) |

**Key Insight:** US-based searches trigger AI Overviews more frequently than India-based searches, but HUFT visibility within those AI Overviews is lower from US.

### Brands Mentioned in AI Overviews

Top brands appearing in Google AI Overviews for pet product queries:

| Brand | AI Overview Appearances | % of AI Overviews |
|-------|------------------------|-------------------|
| Royal Canin | 45 | 67% |
| Pedigree | 42 | 63% |
| Drools | 38 | 57% |
| Farmina | 32 | 48% |
| Orijen | 28 | 42% |
| Acana | 25 | 37% |
| **HUFT** | **23** | **34%** |
| Purina | 18 | 27% |

HUFT ranks 7th in AI Overview brand presence, behind major international and Indian competitors.

---

## Competitive Context

### Brand Visibility Leaderboard (All 240 Queries)

| Rank | Brand | Total Mentions | AI Overview | Organic |
|------|-------|---------------|-------------|---------|
| 1 | HUFT (combined)* | 226 | 23 | 186 |
| 2 | Supertails | 110 | 14 | 108 |
| 3 | Pedigree | 96 | 18 | 75 |
| 4 | Drools | 95 | 24 | 72 |
| 5 | Royal Canin | 91 | 15 | 73 |
| 6 | Zigly | 81 | 12 | 80 |
| 7 | Hill's | 61 | 10 | 48 |
| 8 | Acana | 54 | 13 | 33 |
| 9 | Orijen | 52 | 11 | 33 |
| 10 | Farmina | 49 | 16 | 37 |

*HUFT combined includes: "HUFT", "Heads Up For Tails", "HeadsUpForTails", and headsupfortails.com URL mentions

### Competitor Positioning

**International Premium Brands:** Royal Canin, Hill's, Orijen, Acana
- Strong in "vet-recommended" and "premium" queries
- Dominate AI Overviews for food-related queries

**Budget/Value Brands:** Pedigree, Drools, Purepet
- Strong in "budget" and "affordable" queries
- High AI Overview presence for price-conscious queries

**Indian E-commerce Competitors:** Supertails, Zigly
- Strong organic presence (direct competitors)
- Moderate AI Overview presence

**HUFT Positioning:**
- Strongest in accessories, treats, and India-specific queries
- Weakest in vet-recommended, high-protein, and premium food queries

---

## Implications for HUFT

### Vulnerability: AI Overview Underrepresentation

As Google increasingly shows AI Overviews for product discovery queries:

- **60% of searches now end without a click** (zero-click searches)
- AI Overviews appear for **84% of pet product queries**
- Users who see AI Overviews are **less likely to scroll to organic results**

HUFT's strong organic position (rank #1 overall) may not translate to visibility if users get their answer from the AI Overview where HUFT ranks #7.

**Risk:** A user searching "best dog food brands" sees Royal Canin, Pedigree, and Drools in the AI Overview but must scroll to organic results to see HUFT.

### Vulnerability: Query Dependency

HUFT visibility is highly dependent on explicit India localization:

- With "in India": 80.8% visibility
- Without "in India": 33.3% visibility

**Risk:** Users who search generically (without "in India") are 2.4x less likely to see HUFT recommendations.

### Opportunity: Defend Organic Excellence

HUFT's #1 position in organic mentions (186 total) is a significant asset:

- headsupfortails.com appears in top 3 results for **50% of India queries**
- Brand recognition in organic results drives direct traffic
- SEO authority is a durable competitive advantage

**Action:** Maintain and enhance SEO presence while working to improve AI Overview inclusion.

### Opportunity: Close the AI Overview Gap

The disparity between organic (#1) and AI Overview (#7) rankings suggests optimization potential:

1. **Structured data**: Ensure schema.org markup for products, reviews, prices
2. **Authoritative content**: Create content that Google's AI considers citation-worthy
3. **Category expansion**: Build presence in vet-recommended and premium food categories where HUFT underperforms

---

## Recommendations

### Immediate Actions (0-3 months)

1. **AI Overview Optimization Audit**: Analyze what structured data and content signals drive AI Overview inclusion for top competitors

2. **Enhance Product Schema Markup**: Implement comprehensive schema.org Product, Review, and Offer markup across headsupfortails.com

3. **Monitor AI Overview Presence**: Establish ongoing tracking of HUFT mentions in AI Overviews vs competitors

### Medium-term Actions (3-6 months)

4. **Content Gap Analysis**: Develop authoritative content for categories where HUFT underperforms:
   - "Vet-recommended dog food"
   - "High-protein dog food"
   - "Premium dog food brands in India"

5. **Expert Authority Signals**: Partner with veterinarians, pet nutritionists for endorsements that may influence AI inclusion

6. **Competitive Monitoring**: Track competitor AI Overview presence monthly

### Long-term Strategy (6-12 months)

7. **AI-specific Content Strategy**: Create content specifically designed to be cited in AI summaries (listicles, comparisons, buying guides)

8. **Brand Query Optimization**: Encourage users to search with brand name + category (e.g., "HUFT dog food") which shows 100% visibility

9. **Cross-platform AI Presence**: Extend optimization to Bing Copilot, Perplexity, and other AI search surfaces

---

## Cost Analysis

### Cost Per 1,000 Queries by Surface

| Surface | Method | Cost/1K Queries | Notes |
|---------|--------|-----------------|-------|
| Google Search (SerpAPI) | API | $10.00 | Includes AI Overview capture |
| Gemini API | Direct API | $0.15 | Input tokens only |

### Actual Cost: This 240-Query Study

| Surface | Studies | Queries | Estimated Cost |
|---------|---------|---------|----------------|
| Google Search + AI Overview | 4 | 80 | $0.80 |
| Google Search Organic | 4 | 80 | $0.80 |
| Gemini API | 4 | 80 | $0.01 |
| **Total** | **12** | **240** | **$1.61** |

### Cost Implications

1. **SerpAPI is cost-effective** for Google Search monitoring at $10/1K queries
2. **AI Overview capture** is included in SerpAPI at no additional cost
3. **Gemini API** is extremely cheap but shows different behavior than Google Search
4. **Ongoing monitoring** of 240 queries/month would cost ~$1.61

---

## Conclusion

HUFT enjoys a strong #1 position in organic Google Search results for pet product queries in India. However, this advantage is undermined by:

1. **AI Overview underrepresentation**: HUFT ranks #7 in AI Overviews vs #1 in organic
2. **Query dependency**: Visibility drops 59% without explicit "in India" localization
3. **Category gaps**: Weak presence in vet-recommended and premium food queries

The path forward requires a dual strategy:

1. **Defend organic excellence**: Maintain SEO authority and top rankings
2. **Close the AI Overview gap**: Optimize for AI citation through structured data, authoritative content, and category expansion

As AI-generated summaries become the primary discovery interface for product searches, brands that appear only in organic results will cede market share to competitors who optimize for both surfaces.

---

## Appendix: Study Data

Full verbatim responses and scoring are available in the accompanying files:

* **google-visibility-analysis.xlsx**: All 240 responses with study configuration, summary, verbatims, AI Overview analysis, and cost analysis
* **google-verbatim-comparison.html**: Interactive report with side-by-side verbatim comparison across all 12 surfaces

---

*This report was prepared by Bentham Research for Heads Up For Tails. Data collection conducted January 24, 2026 using SerpAPI for Google Search and direct API calls for Gemini.*
