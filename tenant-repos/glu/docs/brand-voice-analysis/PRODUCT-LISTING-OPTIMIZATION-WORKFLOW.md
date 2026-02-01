# Product Listing Optimization Workflow

**Purpose:** Complete workflow for rewriting product listings using AI, optimized for brands with presence on both Amazon and Shopify.

**Version:** 1.0
**Date:** January 30, 2026

---

## Overview

This workflow transforms thin Shopify listings into rich, brand-voice-consistent content by:

1. Extracting the brand's authentic voice from existing content
2. Leveraging rich Amazon content where available
3. Generating enhanced Shopify content (titles, descriptions, FAQs, JSON-LD, alt text)
4. Eliminating AI tells and maintaining brand authenticity

---

## Prerequisites

### Required Data Sources

| Source | What to Extract | How to Get It |
|--------|-----------------|---------------|
| **Shopify** | Product titles, descriptions, tags, metafields, images | Shopify Admin API or CSV export |
| **Amazon** | Bullet points, A+ content, backend keywords, reviews | Scrape with permission or Seller Central export |
| **Brand assets** | Style guides, tone documents, approved copy | Client provides |

### Tools Needed

- Shopify API access or CSV export capability
- Amazon scraping tool (or manual export)
- LLM API (Claude, GPT-4, etc.)
- Spreadsheet or database for tracking
- Shopify CSV import tool or API

---

## Phase 1: Data Collection

### Step 1.1: Export Shopify Product Data

```bash
# Using Shopify CLI or API
shopify products export --format=csv --output=shopify_products.csv
```

Required fields:
- Handle (product ID)
- Title
- Body (HTML description)
- Vendor
- Product Category
- Tags
- Variant SKU
- Image Src
- Image Alt Text

### Step 1.2: Scrape/Export Amazon Content

For each product with Amazon presence:

```json
{
  "asin": "B07YZJQX1P",
  "shopify_handle": "huft-yimt-apple-cinnamon-biscuits",
  "amazon_title": "Heads Up For Tails Yummy in My Tummy Apple & Cinnamon...",
  "amazon_bullets": [
    "100% VEGETARIAN: Made with real apples and cinnamon...",
    "GLUTEN-FREE: Safe for dogs with wheat allergies...",
    "HUMAN-GRADE INGREDIENTS: No artificial colors...",
    "OVEN-BAKED: Gently baked to retain nutrients...",
    "TRAINING TREATS: Low-calorie, bite-sized..."
  ],
  "amazon_description": "Looking for healthy treats...",
  "amazon_backend_keywords": "dog biscuits gluten free vegetarian...",
  "a_plus_content": "..."
}
```

### Step 1.3: Create Unified Product Database

Merge Shopify + Amazon data into single source:

```json
{
  "handle": "huft-yimt-apple-cinnamon-biscuits",
  "shopify": {
    "title": "HUFT YIMT Apple & Cinnamon Biscuits",
    "description": "<p>Looking for dog biscuits...</p>",
    "tags": ["treats", "vegetarian", "gluten-free"],
    "images": ["image1.jpg", "image2.jpg"]
  },
  "amazon": {
    "asin": "B07YZJQX1P",
    "bullets": ["...", "...", "..."],
    "backend_keywords": "..."
  },
  "category": "treats/biscuits",
  "sub_brand": "yimt"
}
```

---

## Phase 2: Brand Voice Extraction

### Step 2.1: Sample Selection

Select 100-300 products for voice analysis:
- Spread across all categories
- Include best-performing products
- Include products with rich descriptions
- Include sub-brands if applicable

### Step 2.2: Voice Analysis Process

For each sample, extract:

**A. Vocabulary Patterns**
```
QUALITY_WORDS: ["human-grade", "100% real", "farm fresh", ...]
PROCESS_WORDS: ["gently oven-baked", "slow-cooked", ...]
NEGATIVE_WORDS: ["no artificial", "no maida", "no preservatives", ...]
COMFORT_WORDS: ["cozy", "snuggle", "cuddle", ...]
```

**B. Sentence Patterns**
```
OPENING_PATTERNS: [
  "Looking for [product type] that [benefit]?",
  "Health meets taste in...",
  "At [brand], we believe..."
]
MIDDLE_PATTERNS: [
  "Unlike other [products], these contain no...",
  "[Ingredient] provides [benefit]...",
]
CLOSING_PATTERNS: [
  "Suitable for dogs above [age].",
  "Perfect for [use case]."
]
```

**C. Sub-Brand Detection**
```
SUB_BRANDS: {
  "sara_wholesome": {
    "indicators": ["farm-fresh", "slow-cooked", "small batches"],
    "tone": "artisanal, warm"
  },
  "hearty": {
    "indicators": ["60% meat", "oven-baked", "superherbs"],
    "tone": "innovative, confident"
  },
  ...
}
```

### Step 2.3: Create Brand Voice Guide

Output: `BRAND-VOICE-GUIDE.md` containing:
- Core characteristics
- Vocabulary lists
- Sentence patterns
- Sub-brand profiles
- AI tells to avoid
- Quality checklist

---

## Phase 3: Prompt Engineering

### Step 3.1: Master Prompt Template

```
You are writing product content for [BRAND].

BRAND VOICE RULES:
[Insert extracted voice characteristics]

VOCABULARY TO USE:
[Insert vocabulary lists]

VOCABULARY TO AVOID:
[Insert AI tells and anti-patterns]

SENTENCE PATTERNS:
[Insert extracted patterns]

---

PRODUCT INPUT:
- Current Title: {title}
- Current Description: {description}
- Amazon Bullets: {amazon_bullets}
- Category: {category}
- Attributes: {attributes}

REQUIRED OUTPUT:
1. ENHANCED_TITLE (60-90 chars)
2. ENHANCED_DESCRIPTION (150-250 words, HTML-ready)
3. FAQS (5-7 questions with answers)
4. JSON_LD (Schema.org Product with additionalProperty)
5. ALT_TEXT (for each image)
```

### Step 3.2: Category-Specific Prompts

Create variants for each product category:
- Treats/Food: Emphasize ingredients, dietary info
- Toys: Emphasize play modes, durability, safety
- Beds: Emphasize comfort, sleep styles, materials
- Grooming: Emphasize problems solved, gentleness
- Walk Gear: Emphasize safety, fit, functionality
- Apparel: Emphasize comfort, style, seasons

### Step 3.3: Sub-Brand Prompts

If brand has sub-brands, create specific prompts for each with distinct:
- Tone adjustments
- Vocabulary emphasis
- Structure variations

### Step 3.4: Test & Iterate

1. Generate content for 20 products
2. Human review for voice consistency
3. Adjust prompts based on feedback
4. Repeat until 90%+ approval rate

---

## Phase 4: Batch Processing

### Step 4.1: Processing Script

```python
import json
import csv
from anthropic import Anthropic

def process_listings(products_file, prompts_dir, output_file):
    """
    Process all product listings through brand voice prompts.
    """
    client = Anthropic()
    products = load_products(products_file)
    prompts = load_prompts(prompts_dir)
    results = []

    for product in products:
        # Select appropriate prompt
        prompt = select_prompt(product, prompts)

        # Generate content
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": prompt.format(**product)
            }]
        )

        # Parse and validate output
        content = parse_response(response)
        validation = validate_output(content, product)

        results.append({
            "handle": product["handle"],
            "content": content,
            "validation": validation
        })

        # Save progress incrementally
        save_progress(results, output_file)

    return results

def select_prompt(product, prompts):
    """
    Route product to correct prompt based on category and sub-brand.
    """
    category = product.get("category", "general")
    sub_brand = product.get("sub_brand", "default")

    # Try sub-brand specific first
    if f"{sub_brand}_{category}" in prompts:
        return prompts[f"{sub_brand}_{category}"]

    # Fall back to category
    if category in prompts:
        return prompts[category]

    # Fall back to sub-brand
    if sub_brand in prompts:
        return prompts[sub_brand]

    return prompts["default"]

def validate_output(content, product):
    """
    Validate generated content against quality rules.
    """
    issues = []

    # Check title length
    if len(content["title"]) > 100:
        issues.append("title_too_long")

    # Check description length
    if len(content["description"]) < 100:
        issues.append("description_too_short")

    # Check for AI tells
    ai_tells = ["elevate", "premium quality", "experience the", "ensures"]
    for tell in ai_tells:
        if tell.lower() in content["description"].lower():
            issues.append(f"ai_tell:{tell}")

    # Check required elements
    if not content.get("faqs"):
        issues.append("missing_faqs")

    if not content.get("json_ld"):
        issues.append("missing_json_ld")

    return {
        "passed": len(issues) == 0,
        "issues": issues
    }
```

### Step 4.2: Output Format

Generate Shopify-ready CSV:

```csv
Handle,Title,Body (HTML),Metafield: faqs [json],Metafield: json_ld [json],Image Alt Text
huft-yimt-apple-cinnamon,"HUFT Yummy In My Tummy Apple & Cinnamon...","<p>Looking for treats...</p>","[{""q"":""..."",""a"":""...""}]","{""@context"":""...""}","HUFT Apple Cinnamon Dog Biscuits 320g Pack"
```

---

## Phase 5: Quality Assurance

### Step 5.1: Automated Checks

Run validation on all outputs:

| Check | Rule | Action if Failed |
|-------|------|------------------|
| Title length | 40-100 chars | Flag for review |
| Description length | 100-300 words | Flag for review |
| AI tell detection | No banned phrases | Auto-fix or flag |
| FAQ count | 3-7 FAQs | Flag for review |
| JSON-LD validity | Valid JSON + schema | Auto-fix or flag |
| Alt text presence | All images covered | Flag for review |

### Step 5.2: AI-Tell Detection

Scan all content for:

```python
AI_TELLS = [
    "elevate your",
    "experience the",
    "premium quality",
    "ensures",
    "providing",
    "designed to",  # if used more than once
    "boasts",
    "features",  # if used as verb
    "crafted with care",  # without specifics
    "whether you're looking for",
    "not only X but also Y",
]

OVERUSED_PATTERNS = [
    r"^This ",  # Starting too many sentences with "This"
    r"—",  # Em-dash overuse (more than 2 per description)
]
```

### Step 5.3: Human Spot-Check

Sample 5-10% of outputs for human review:

**Review criteria:**
1. Does this sound like [brand]? (1-5 scale)
2. Would a customer recognize this as authentic?
3. Are there any jarring phrases?
4. Is the information accurate?
5. Would this perform better than the original?

### Step 5.4: Brand Approval

Send sample set (20-50 products) to client for approval:
- Include before/after comparisons
- Highlight key changes
- Note any edge cases or questions
- Get sign-off before full processing

---

## Phase 6: Deployment

### Step 6.1: Shopify Import

**Option A: CSV Import**
1. Format output as Shopify product CSV
2. Import via Shopify Admin > Products > Import
3. Map metafields for FAQs and JSON-LD

**Option B: API Update**
```python
import shopify

def update_product(handle, content):
    product = shopify.Product.find(handle=handle)

    product.title = content["title"]
    product.body_html = content["description"]

    # Update metafields
    product.metafields = [
        {"key": "faqs", "value": json.dumps(content["faqs"]), "type": "json"},
        {"key": "json_ld", "value": json.dumps(content["json_ld"]), "type": "json"}
    ]

    # Update image alt text
    for i, image in enumerate(product.images):
        if i < len(content["alt_texts"]):
            image.alt = content["alt_texts"][i]

    product.save()
```

### Step 6.2: Theme Updates (One-Time)

Add JSON-LD output to product template:

```liquid
{% comment %} In product.liquid or main-product.liquid {% endcomment %}

{% if product.metafields.custom.json_ld %}
  <script type="application/ld+json">
    {{ product.metafields.custom.json_ld }}
  </script>
{% endif %}

{% comment %} FAQ display {% endcomment %}
{% if product.metafields.custom.faqs %}
  <div class="product-faqs">
    <h2>Frequently Asked Questions</h2>
    {% assign faqs = product.metafields.custom.faqs | parse_json %}
    {% for faq in faqs %}
      <details>
        <summary>{{ faq.q }}</summary>
        <p>{{ faq.a }}</p>
      </details>
    {% endfor %}
  </div>
{% endif %}
```

### Step 6.3: Verification

After deployment:
1. Spot-check 20 live product pages
2. Validate JSON-LD with Google's Rich Results Test
3. Check FAQ rendering
4. Verify image alt text in source

---

## Phase 7: Ongoing Maintenance

### New Product Workflow

When new products are added:

1. Categorize product (category + sub-brand)
2. Run through appropriate prompt
3. Automated validation
4. Quick human review (if flagged)
5. Deploy to Shopify

### Periodic Refresh

Quarterly:
- Review brand voice guide for updates
- Check for new AI tells to block
- Analyze performance data (CTR, conversion)
- Iterate prompts based on learnings

### Voice Evolution

If brand voice evolves:
1. Re-sample recent content
2. Update voice guide
3. Regenerate prompts
4. Optionally re-process existing listings

---

## Appendix A: File Templates

### Product Input Template (JSON)

```json
{
  "handle": "product-handle",
  "current_title": "Current Product Title",
  "current_description": "Current HTML description...",
  "category": "treats/biscuits",
  "sub_brand": "yimt",
  "attributes": {
    "ingredients": ["apple", "cinnamon", "oat flour"],
    "dietary": ["vegetarian", "gluten-free"],
    "life_stage": "all",
    "weight": "320g"
  },
  "amazon": {
    "bullets": ["Bullet 1...", "Bullet 2..."],
    "backend_keywords": "dog treats biscuits..."
  },
  "images": [
    {"filename": "product-main.jpg", "current_alt": ""},
    {"filename": "product-pack.jpg", "current_alt": ""}
  ]
}
```

### Content Output Template (JSON)

```json
{
  "handle": "product-handle",
  "enhanced_title": "Enhanced Product Title – Key Benefit, Key Feature",
  "enhanced_description": "<p>Opening paragraph...</p><ul><li>Bullet 1</li></ul>",
  "faqs": [
    {"q": "Question 1?", "a": "Answer 1."},
    {"q": "Question 2?", "a": "Answer 2."}
  ],
  "json_ld": {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "...",
    "additionalProperty": [...]
  },
  "alt_texts": [
    "Descriptive alt text for image 1",
    "Descriptive alt text for image 2"
  ],
  "validation": {
    "passed": true,
    "issues": []
  }
}
```

---

## Appendix B: Shopify Metafield Setup

### Create Metafield Definitions

In Shopify Admin > Settings > Metafields > Products:

1. **FAQs**
   - Namespace: custom
   - Key: faqs
   - Type: JSON
   - Description: Product FAQs for display and FAQ schema

2. **JSON-LD**
   - Namespace: custom
   - Key: json_ld
   - Type: JSON
   - Description: Enhanced structured data for SEO

3. **Amazon Sync**
   - Namespace: custom
   - Key: amazon_asin
   - Type: Single line text
   - Description: Amazon ASIN for cross-reference

---

## Appendix C: Cost Estimates

### API Costs (Claude/GPT-4)

| Products | Tokens/Product | Total Tokens | Est. Cost |
|----------|---------------|--------------|-----------|
| 1,000 | ~2,000 | 2M | $6-12 |
| 5,000 | ~2,000 | 10M | $30-60 |
| 10,000 | ~2,000 | 20M | $60-120 |
| 50,000 | ~2,000 | 100M | $300-600 |

### Time Estimates

| Phase | 1K Products | 5K Products | 10K Products |
|-------|------------|-------------|--------------|
| Data collection | 1 day | 2 days | 3 days |
| Voice extraction | 2 days | 3 days | 4 days |
| Prompt engineering | 3 days | 4 days | 5 days |
| Batch processing | 1 day | 2 days | 3 days |
| QA & iteration | 2 days | 3 days | 4 days |
| Deployment | 1 day | 1 day | 2 days |
| **Total** | **10 days** | **15 days** | **21 days** |

---

## Appendix D: FAQ Generation from Search Data

### Sources for Real Questions

1. **Google "People Also Ask"**
   - Search "[product type] + [concern]"
   - Extract PAA questions

2. **Amazon Q&A**
   - Scrape customer questions from Amazon listings
   - Identify patterns

3. **Reddit/Quora**
   - Search for product category discussions
   - Extract common questions

4. **Google Search Console**
   - Analyze queries driving traffic
   - Identify question-format queries

### Question Categories by Product Type

**Food/Treats:**
- Ingredients and sourcing
- Allergens and dietary restrictions
- Feeding guidelines
- Storage and shelf life
- Age/breed suitability

**Toys:**
- Durability and safety
- Size selection
- Cleaning and maintenance
- Appropriate chewer level

**Grooming:**
- Skin/coat compatibility
- Ingredient concerns
- Usage frequency
- Breed-specific needs

**Walk Gear:**
- Sizing and fit
- Safety features
- Material durability
- Training suitability
