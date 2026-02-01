# Bentham Brand Voice Analysis Manifesto

**Service:** Automated Brand Voice Extraction & Content Generation
**Version:** 1.0
**Date:** January 30, 2026

---

## The Problem We Solve

Brands with 1,000-50,000 SKUs face a content crisis:

1. **Shopify listings are thin** — Single paragraph descriptions, tag-dump alt text, no FAQs, no structured data
2. **Amazon listings are rich but trapped** — 5 bullet points, A+ content, backend keywords exist but can't be easily syndicated
3. **AI-generated content sounds generic** — "Elevate your experience" and "premium quality" everywhere
4. **Brand voice gets lost at scale** — What works for 10 products breaks at 5,000

**Our solution:** Extract the authentic brand voice from existing content, codify it into generation prompts, and produce content that sounds like the brand—not like AI.

---

## The Bentham Approach

### Phase 1: Brand Voice Extraction

**Input:** 100-300 product descriptions from the brand's existing catalog (Shopify, Amazon, or website)

**Process:**
1. Crawl/scrape product descriptions across categories
2. Identify vocabulary patterns (words used repeatedly)
3. Map sentence structures (openers, middle, closers)
4. Detect emotional register (warm vs. clinical, playful vs. serious)
5. Find differentiators (what they say they're NOT)
6. Identify sub-brand voices if applicable
7. Catalog "AI tells" to avoid

**Output:** Brand Voice Guide document with:
- Core voice characteristics
- Signature vocabulary list
- Sentence pattern templates
- Category-specific notes
- Anti-patterns (what to avoid)
- Quality checklist

### Phase 2: Prompt Engineering

**Input:** Brand Voice Guide + product taxonomy

**Process:**
1. Create master prompt template with brand voice rules
2. Build category-specific prompt variants
3. Build sub-brand prompt variants (if applicable)
4. Define output structure (title, description, FAQs, JSON-LD, alt text)
5. Test on 20-50 products, iterate
6. Human review and refinement

**Output:** Production-ready prompt library

### Phase 3: Catalog Processing

**Input:** Product data export (CSV/JSON) with:
- Current title
- Current description
- Product category
- Attributes (ingredients, materials, sizes, etc.)
- Image filenames
- Amazon content (if available)

**Process:**
1. Route each product to correct prompt (category + sub-brand)
2. Generate optimized content
3. Validate output (length, required elements, no AI tells)
4. Flag exceptions for human review
5. Export in Shopify-ready format

**Output:**
- Enhanced titles
- Restructured descriptions
- Generated FAQs (as metafields)
- JSON-LD blocks
- Alt text for images

### Phase 4: Quality Assurance

**Process:**
1. Automated checks (length, keyword presence, structure)
2. AI-tell detection scan
3. 5-10% human spot-check
4. Brand approval on sample set
5. Iteration if needed

**Output:** Approved content ready for upload

---

## What Makes This Different

| Traditional Approach | Bentham Approach |
|---------------------|------------------|
| Generic AI prompts | Brand-specific voice prompts |
| One-size-fits-all | Category and sub-brand variants |
| "Premium quality" everywhere | Authentic brand vocabulary |
| Ignore existing content | Build FROM existing content |
| Hope it sounds right | Systematic voice extraction |
| Manual QA on everything | Automated + sampled human QA |

---

## Deliverables Per Engagement

1. **Brand Voice Guide** (Markdown document)
   - Core characteristics
   - Vocabulary lists
   - Sentence patterns
   - Anti-patterns
   - Checklist

2. **Prompt Library** (Production-ready prompts)
   - Master template
   - Category variants
   - Sub-brand variants (if applicable)
   - Selection logic

3. **Sample Outputs** (20-50 products)
   - Before/after comparisons
   - Voice consistency validation

4. **Processing Pipeline** (Scripts/workflow)
   - Input format specification
   - Batch processing script
   - Output format for Shopify import

5. **QA Report**
   - Automated check results
   - Human review notes
   - Iteration log

---

## Pricing Model Options

### Option A: Per-SKU Processing
- Brand voice extraction: Fixed fee
- Content generation: $X per SKU
- Best for: One-time catalog optimization

### Option B: Monthly Retainer
- Ongoing voice maintenance
- New product content generation
- Seasonal updates
- Best for: Brands with regular catalog changes

### Option C: Platform License
- Self-service brand voice extraction
- Prompt library builder
- Batch processing tools
- Best for: Agencies managing multiple brands

---

## Success Metrics

1. **Voice Consistency Score**
   - Human reviewers rate "Does this sound like [brand]?" on 1-5 scale
   - Target: 4.0+ average

2. **AI-Tell Detection Rate**
   - Automated scan for generic AI phrases
   - Target: <5% flagged content

3. **Content Completeness**
   - % of products with: enhanced title, description, FAQs, JSON-LD
   - Target: 100% for core fields

4. **Time to Market**
   - Days from data export to approved content
   - Target: <10 business days for 5,000 SKUs

5. **Client Satisfaction**
   - Brand team approval rate on sample sets
   - Target: >90% first-pass approval

---

## Competitive Positioning

**What we are:**
- Brand voice specialists
- Content quality engineers
- Shopify/Amazon content bridge builders

**What we are NOT:**
- Generic AI content mill
- SEO keyword stuffers
- One-prompt-fits-all service

**Our moat:**
- Systematic voice extraction methodology
- Sub-brand detection and handling
- AI-tell elimination focus
- Indian market expertise (regional vocabulary, ingredients)

---

## Case Study: HUFT

**Brand:** Heads Up For Tails (India's largest pet care brand)
**Catalog:** 5,000+ SKUs
**Challenge:** Thin Shopify descriptions vs. rich Amazon content

**What we extracted:**
- 6 distinct sub-brand voices (Sara's Wholesome, Hearty, YIMT, Sara's Doggie Treats, Dash Dog, TLC)
- Indian-specific vocabulary (maida, jaggery, superherbs)
- Category-specific patterns (treats vs. toys vs. grooming)
- AI tells specific to pet industry

**Deliverables:**
- 50-page brand voice guide
- 6 sub-brand prompt templates
- Sample outputs for 11 products
- Automation feasibility assessment

**Key insight:** The brand has different "voices" for different product lines—a single prompt would fail. Sub-brand detection is critical for authenticity.

---

## Getting Started

### Minimum Requirements from Client

1. **Product data export** (CSV or JSON)
   - Product ID, title, description, category
   - Attributes (varies by category)
   - Image URLs or filenames

2. **Amazon content** (if available)
   - Bullet points, A+ content, backend keywords
   - Can be scraped with permission

3. **Brand guidelines** (if available)
   - Tone of voice documents
   - Style guides
   - Dos and don'ts

4. **Sample approval**
   - 10-20 products for initial voice validation
   - Feedback loop for iteration

### Timeline (Typical 5,000 SKU Project)

| Phase | Duration |
|-------|----------|
| Data collection | 2-3 days |
| Voice extraction | 3-5 days |
| Prompt engineering | 3-5 days |
| Sample generation & review | 2-3 days |
| Full catalog processing | 2-3 days |
| QA & iteration | 2-3 days |
| **Total** | **14-22 business days** |

---

## Contact

For brand voice analysis inquiries:
[Contact information]

---

*"The best AI content is content that doesn't sound like AI."*
