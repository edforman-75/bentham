# City of Boise AI Visibility Study - Status Report

**Generated:** January 25, 2026
**Study ID:** city-of-boise-visibility

## Data Collection Status

### Overview
- **Total Queries:** 118 (84 original + 34 new)
- **Surfaces:** 5 (ChatGPT, Meta AI, Google AI Overview, Google Search, Bing Search)
- **Expected Data Points:** 590 (118 × 5)
- **Actual Data Points:** ~250 with response data
- **Completion:** ~42%

### By Surface

| Surface | Weight | Queries 1-33 | Queries 34-84 | Queries 85-118 | Total with Data |
|---------|--------|--------------|---------------|----------------|-----------------|
| ChatGPT Web | 35% | ❌ No data | ✓ 47 responses | ❌ Not run | 47/118 (40%) |
| Meta AI | 10% | ❌ No data | ✓ 60 responses | ❌ Not run | 60/118 (51%) |
| Google AI Overview | 25% | ✓ 18 real AIO | ✓ (merged) | ✓ SerpAPI | 118/118 (100%) |
| Google Search | 20% | ❌ No data | ✓ 37 responses | ❌ Not run | 37/118 (31%) |
| Bing Search | 10% | ❌ No data | ✓ 28 responses | ❌ Not run | 30/118 (25%) |

### Data Quality Issues

1. **Google AI Overview Correction Applied**
   - SerpAPI captured 36 "AI Overviews"
   - Only 18 were actual AI Overviews (15.3%)
   - Other 18 were "People also ask" incorrectly captured
   - Corrected results saved to `city-of-boise-google-ai-overview-corrected.json`

2. **Missing Response Data for Queries 1-33**
   - Original run marked these as "complete" but didn't save response text
   - Need to re-run queries 1-33 on all surfaces except Google AI Overview

3. **New Queries (85-118) Not Run**
   - Business Relocation (12 queries)
   - Family Relocation (10 queries)
   - Vacation Planning (12 queries)
   - Only Google AI Overview was tested (via SerpAPI)

## What We Can Report

### Surfaces with Reliable Data

| Surface | Sample Size | Boise Mention Rate | Confidence |
|---------|-------------|-------------------|------------|
| ChatGPT Web | 47 queries | 100% | Medium (40% coverage) |
| Meta AI | 60 queries | 91.7% | Medium (51% coverage) |
| Google AI Overview | 118 queries | 15.3% real AIO | High (100% coverage) |
| Google Search | 37 queries | 78.4% | Low (31% coverage) |
| Bing Search | 28 queries | 96.4% | Low (24% coverage) |

### Key Findings (Based on Available Data)

1. **ChatGPT Web (100% Boise mention rate)**
   - Every tested query returned a response mentioning Boise
   - Strong signal that LLM training data includes Boise information

2. **Meta AI (91.7% Boise mention rate)**
   - Very high relevance for Boise queries
   - 8.3% of responses didn't explicitly mention Boise

3. **Google AI Overview (15.3% actual AI Overviews)**
   - AI Overviews appear primarily for informational queries
   - Zero AI Overviews for: City Services, Government, Business Relocation
   - Best coverage: Quality of Life (40%), Vacation Planning (33%)

4. **Search Engines (78-96% Boise mention rate)**
   - Traditional SEO appears effective
   - Boise results appear in organic search consistently

## To Complete This Study

### Required Actions

1. **Re-run queries 1-33** on all surfaces (except Google AI Overview)
   - ChatGPT Web: 33 queries
   - Meta AI: 33 queries
   - Google Search: 33 queries
   - Bing Search: 33 queries

2. **Run new queries 85-118** on all surfaces (except Google AI Overview)
   - ChatGPT Web: 34 queries
   - Meta AI: 34 queries
   - Google Search: 34 queries
   - Bing Search: 34 queries

3. **Total additional queries needed:** 268 (67 queries × 4 surfaces)

### Script to Complete

```bash
npx tsx scripts/complete-boise-study.ts
```

This script will:
- Connect to Chrome on port 9222
- Process missing queries for each surface
- Save progress incrementally
- Resume from where it left off

## Files

- `city-of-boise-visibility.json` - Study manifest (118 queries)
- `city-of-boise-visibility-retry-results.json` - Partial results (queries 34-84)
- `city-of-boise-google-ai-overview-corrected.json` - AI Overview results (corrected)
- `city-of-boise-consolidated-results.json` - All available data merged
- `city-of-boise-complete-results.json` - Will contain final complete results
