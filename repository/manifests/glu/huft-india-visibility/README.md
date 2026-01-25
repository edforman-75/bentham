# HUFT India Visibility Study

**Client:** Heads Up For Tails (HUFT)
**Tenant:** GLU Brand Analysis
**Status:** Active

## Overview

This study measures brand visibility for Heads Up For Tails across AI-powered surfaces, comparing India IP vs US IP results and original vs India-suffixed queries.

## Study Matrix

| Variant | Location | Surfaces | Queries |
|---------|----------|----------|---------|
| Original | in-mum | 6 | 20 |
| Original | us-national | 6 | 20 |
| India Suffix | in-mum | 6 | 20 |
| India Suffix | us-national | 6 | 20 |

**Total Cells:** 480 (20 queries × 6 surfaces × 2 locations × 2 variants)

## Surfaces

1. **chatgpt-web** - ChatGPT via browser (captures web layer modifications)
2. **openai-api** - OpenAI API direct (baseline)
3. **google-search** - Google Search with AI Overview (via SerpAPI)
4. **gemini-api** - Google Gemini API
5. **meta-ai-web** - Meta AI via browser
6. **perplexity-api** - Perplexity API with citations

## Running the Study

### Full Study (All Variants)

```bash
npx tsx scripts/run-huft-100-india-study.ts
```

### Single Variant

```bash
# Original queries, India IP
npx tsx scripts/run-huft-100-india-study.ts --variant=original --location=in-mum

# India suffix, US IP
npx tsx scripts/run-huft-100-india-study.ts --variant=india-suffix --location=us-national
```

### Resume from Checkpoint

```bash
npx tsx scripts/run-huft-100-india-study.ts --resume
```

## IP Requirements

| Location | IP Country | Proxy Required | Provider |
|----------|------------|----------------|----------|
| in-mum | IN (India) | Yes | Cherry Proxy |
| us-national | US | No | Direct |

### Verifying IP

Before running India studies:

```bash
# Via browser with proxy
curl --proxy http://cherry-proxy:port https://ipinfo.io/json

# Expected response for in-mum:
# { "ip": "x.x.x.x", "country": "IN", "city": "Mumbai", ... }
```

## Output Structure

```
repository/results/glu/huft-india-visibility/
├── run_abc123/
│   ├── metadata.json         # Execution metadata with IP verification
│   ├── chatgpt-web-in-mum-original.json
│   ├── chatgpt-web-in-mum-india-suffix.json
│   ├── chatgpt-web-us-national-original.json
│   ├── openai-api-in-mum-original.json
│   └── ...
└── checkpoints/
    └── run_abc123-checkpoint.json
```

## Completion Criteria

- **Minimum Success Rate:** 80%
- **Maximum Failure Streak:** 3 consecutive failures triggers session recovery
- **Required Surfaces:** chatgpt-web, openai-api must complete

## Cost Estimate

| Surface | Cost/Query | Total (480 cells) |
|---------|------------|-------------------|
| openai-api | $0.005 | $2.40 |
| gemini-api | $0.001 | $0.48 |
| perplexity-api | $0.005 | $2.40 |
| google-search | $0.005 (SerpAPI) | $2.40 |
| chatgpt-web | $0.00 (browser) | $0.00 |
| meta-ai-web | $0.00 (browser) | $0.00 |

**Estimated Total:** ~$8-10 per full run

## Results Analysis

Analysis scripts are maintained in the GLU tenant repository:

```bash
# In glu-tenant-repo/
npx tsx scripts/analyze-huft-visibility.ts --run=run_abc123
```

## Contact

- **Study Owner:** GLU Research Team
- **Client Contact:** Ranjan (HUFT)
