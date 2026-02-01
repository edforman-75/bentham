# Brand Voice Analysis & Product Listing Optimization System

**Bentham / Glu Hub**

A systematic approach to extracting authentic brand voice from existing content and generating optimized product descriptions at scale.

---

## Overview

This system solves a common e-commerce problem:

- **Shopify listings are thin** — Single paragraphs, no FAQs, no structured data
- **Amazon listings are rich but trapped** — Can't easily syndicate to other channels
- **AI-generated content sounds generic** — Loses brand authenticity
- **Manual rewriting doesn't scale** — 5,000 product listings can't be done by hand

Our solution: **Extract the brand's authentic voice → Generate content that sounds like the brand, not AI**

---

## Directory Structure

```
brand-voice-analysis/
├── README.md                           # This file
├── BENTHAM-BRAND-VOICE-MANIFESTO.md    # Service positioning document
├── PRODUCT-LISTING-OPTIMIZATION-WORKFLOW.md  # Complete workflow documentation
├── huft/                               # HUFT case study
│   ├── HUFT-BRAND-VOICE-GUIDE.md       # Extracted voice guide
│   ├── HUFT-SUB-BRAND-PROMPTS.md       # Production-ready prompts
│   └── HUFT-LISTING-OPTIMIZATION-STUDY.html  # Full comparison report
└── templates/                          # Reusable templates
    ├── brand-voice-analysis.manifest.json    # System manifest/config
    ├── brand-voice-guide.template.md         # Voice guide template
    ├── analysis-report.template.html         # HTML report template
    ├── run-brand-voice-analysis.ts           # Execution script
    └── sample-brand.manifest.json            # Example brand manifest
```

---

## Quick Start

### 1. Create Brand Manifest

Copy `templates/sample-brand.manifest.json` and customize:

```json
{
  "id": "your-brand",
  "name": "Your Brand Name",
  "market": "India",
  "categories": ["treats", "toys", "beds"],
  "sub_brands": []
}
```

### 2. Prepare Product Data

Export products as JSON:

```json
[
  {
    "handle": "product-handle",
    "current_title": "Current Product Title",
    "current_description": "Current description HTML...",
    "category": "treats/biscuits",
    "attributes": {
      "ingredients": ["chicken", "rice"],
      "dietary": ["grain-free"]
    }
  }
]
```

### 3. Run Analysis

```bash
# Extract voice guide only
npx tsx templates/run-brand-voice-analysis.ts \
  --config your-brand.manifest.json \
  --products products.json \
  --extract-only

# Full pipeline: extract + generate + export
npx tsx templates/run-brand-voice-analysis.ts \
  --config your-brand.manifest.json \
  --products products.json \
  --output ./output
```

### 4. Review Outputs

```
output/
├── your-brand-voice-guide.json      # Extracted voice characteristics
├── your-brand-listings-output.json  # Generated content
├── your-brand-analysis-report.json  # QA metrics
├── your-brand-analysis-report.html  # Visual report
└── your-brand-shopify-import.csv    # Ready for Shopify import
```

---

## Workflow Phases

### Phase 1: Data Collection
- Export Shopify catalog (CSV or API)
- Scrape/export Amazon content (if available)
- Merge into unified product database

### Phase 2: Voice Extraction
- Analyze 100-300 product descriptions
- Extract vocabulary patterns
- Identify sentence structures
- Detect sub-brand voices
- Document AI tells to avoid

### Phase 3: Prompt Engineering
- Create master prompt with voice rules
- Build category-specific variants
- Build sub-brand variants
- Test on 20-50 products, iterate

### Phase 4: Listing Generation
- Route products to correct prompts
- Generate enhanced content
- Validate outputs
- Flag exceptions for review

### Phase 5: Quality Assurance
- Automated AI-tell detection
- Length and structure validation
- 5-10% human spot-check
- Brand approval on samples

### Phase 6: Deployment
- Export Shopify-ready CSV
- Update metafields (FAQs, JSON-LD)
- Modify theme for structured data
- Verify live pages

---

## Case Study: HUFT

**Brand:** Heads Up For Tails (India's largest pet care brand)
**Product Assortment:** 5,000+ SKUs
**Challenge:** Thin Shopify descriptions vs. rich Amazon content

**What We Extracted:**
- 6 distinct sub-brand voices
- Indian-specific vocabulary (maida, jaggery, superherbs)
- Category-specific patterns
- AI tells specific to pet industry

**Key Insight:** The brand has different "voices" for different product lines—a single prompt would fail. Sub-brand detection is critical.

See `huft/` directory for complete documentation.

---

## Key Concepts

### Brand Voice vs. Generic AI

| Generic AI | Brand Voice |
|------------|-------------|
| "Elevate your dog's experience" | "Give your dog something special" |
| "Premium quality ensures satisfaction" | "Made with 100% human-grade ingredients" |
| "Designed to provide optimal nutrition" | "Gently oven-baked to keep the goodness in" |

### AI Tells to Avoid

```
- "elevate your"
- "experience the"
- "premium quality"
- "ensures"
- "providing"
- "designed to" (if overused)
- "boasts"
- "whether you're looking for X or Y"
```

### Sub-Brand Detection

Many brands have distinct product lines with different voices:

| HUFT Sub-Brand | Voice | Example |
|----------------|-------|---------|
| Sara's Wholesome | Artisanal, warm | "Slow-cooked in small batches" |
| Hearty | Innovative, confident | "60% more meat than any other kibble" |
| Yummy In My Tummy | Playful, reassuring | "Looking for treats that are as yummy as they are nutritious?" |

---

## Configuration Reference

### Brand Manifest Schema

```json
{
  "id": "string (kebab-case)",
  "name": "string (display name)",
  "market": "string (country/region)",
  "shopify_domain": "string (optional)",
  "amazon_store_id": "string (optional)",
  "categories": ["array of category paths"],
  "sub_brands": [
    {
      "id": "string",
      "name": "string",
      "categories": ["array"],
      "indicators": ["words that identify this sub-brand"]
    }
  ],
  "content_requirements": {
    "title_length": {"min": 40, "max": 100},
    "description_length": {"min": 100, "max": 300},
    "faq_count": {"min": 3, "max": 7}
  }
}
```

### Product Input Schema

```json
{
  "handle": "string (Shopify handle)",
  "current_title": "string",
  "current_description": "string (HTML)",
  "category": "string (from manifest categories)",
  "sub_brand": "string (optional, auto-detected if not provided)",
  "attributes": {
    "ingredients": ["array"],
    "dietary": ["array"],
    "life_stage": "string",
    "materials": ["array"]
  },
  "amazon": {
    "asin": "string",
    "bullets": ["array of 5 bullets"],
    "backend_keywords": "string"
  },
  "images": [
    {"filename": "string", "current_alt": "string"}
  ]
}
```

---

## Cost & Time Estimates

### API Costs (Claude Sonnet)

| Products | Est. Cost |
|----------|-----------|
| 1,000 | $6-12 |
| 5,000 | $30-60 |
| 10,000 | $60-120 |

### Timeline

| Products | Total Time |
|----------|------------|
| 1,000 | ~10 days |
| 5,000 | ~15 days |
| 10,000 | ~21 days |

---

## Next Steps

1. **New Brand Analysis**: Copy sample manifest, customize, run extraction
2. **Existing Voice Guide**: Use `--generate-only` with existing guide
3. **Template Customization**: Modify HTML/MD templates for client branding
4. **Integration**: Connect to Shopify API for direct updates

---

## Support

For questions or custom implementations, contact the Bentham team.

---

*Last updated: January 30, 2026*
