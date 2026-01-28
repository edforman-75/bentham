# Google Visibility Study

HUFT brand visibility analysis across Google surfaces.

## Study Matrix

| Study | Surface | AI Overview | IP | Prompt | Queries |
|-------|---------|-------------|-----|--------|---------|
| G1 | Google Search | ON | India | Original | 20 |
| G2 | Google Search | ON | India | "in India" | 20 |
| G3 | Google Search | ON | US | Original | 20 |
| G4 | Google Search | ON | US | "in India" | 20 |
| G5 | Google Search | OFF | India | Original | 20 |
| G6 | Google Search | OFF | India | "in India" | 20 |
| G7 | Google Search | OFF | US | Original | 20 |
| G8 | Google Search | OFF | US | "in India" | 20 |
| G9 | Gemini API | — | US | Original | 20 |
| G10 | Gemini API | — | US | "in India" | 20 |
| G11 | Gemini API | — | India | Original | 20 |
| G12 | Gemini API | — | India | "in India" | 20 |

**Total: 240 queries** (same as OpenAI study)

## Prerequisites

### For Gemini API studies (G9-G12)

```bash
# Already configured in .env as GEMINI_API_KEY
# Or set manually:
export GEMINI_API_KEY="your-api-key"
```

### For Google Search studies (G1-G8)

1. Start Chrome with remote debugging:
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

2. For India IP studies (G1, G2, G5, G6, G11, G12):
   - Configure SOCKS5 proxy in Chrome (ZeroOmega or similar)
   - Connect to India proxy (Cherry Proxy or equivalent)
   - Verify IP at https://ipinfo.io

## Running Studies

### Run all studies
```bash
npx tsx scripts/run-google-visibility-study.ts
```

### Run specific studies
```bash
# Single study
npx tsx scripts/run-google-visibility-study.ts g01

# Range of studies
npx tsx scripts/run-google-visibility-study.ts g01-g04

# By surface type
npx tsx scripts/run-google-visibility-study.ts --gemini      # G9-G12
npx tsx scripts/run-google-visibility-study.ts --search      # G1-G8
npx tsx scripts/run-google-visibility-study.ts --ai-overview # G1-G4
npx tsx scripts/run-google-visibility-study.ts --organic     # G5-G8
```

### Recommended execution order

1. **US IP studies first** (no proxy needed):
```bash
# Gemini API - US
npx tsx scripts/run-google-visibility-study.ts g09-g10

# Google Search - US (no proxy)
npx tsx scripts/run-google-visibility-study.ts g03-g04
npx tsx scripts/run-google-visibility-study.ts g07-g08
```

2. **Switch to India proxy**, then:
```bash
# Gemini API - India
npx tsx scripts/run-google-visibility-study.ts g11-g12

# Google Search - India
npx tsx scripts/run-google-visibility-study.ts g01-g02
npx tsx scripts/run-google-visibility-study.ts g05-g06
```

## IP Verification

Each study automatically verifies the IP address before execution:

```
┌─────────────────────────────────────────────────────────────────────┐
│ IP CONFIGURATION                                                    │
├─────────────────────────────────────────────────────────────────────┤
│ IP Address:    103.123.45.67                                        │
│ Location:      Mumbai, Maharashtra, IN                              │
│ Organization:  Cherry Proxy Ltd                                     │
│ Timezone:      Asia/Kolkata                                         │
│ Coordinates:   19.0760,72.8777                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Expected:      in-mum                                               │
│ Status:        ✓ VERIFIED                                           │
└─────────────────────────────────────────────────────────────────────┘
```

If IP doesn't match expected location, you get a 10-second warning to abort.

The IP info is saved in every result file:
- `ipInfo.ip` - The actual IP address used
- `ipInfo.country` - Country code (IN, US, etc.)
- `ipInfo.city` - City name
- `ipInfo.org` - ISP/Organization
- `ipVerified` - Whether IP matched expected location

## Output

Results are saved to `studies/google/`:
- `g01-*.json` through `g12-*.json` - Individual study results
- `google-visibility-study-all-results.json` - Combined results
- `*-intermediate-*.json` - Checkpoint files (every 5 queries)

## Output Format

```json
{
  "study": "g01",
  "studyName": "Google Search + AI Overview - India IP - Original",
  "surface": "google-search",
  "location": "in-mum",
  "captureAiOverview": true,
  "ipInfo": { "ip": "103.x.x.x", "country": "IN", "city": "Mumbai" },
  "results": [
    {
      "queryIndex": 0,
      "originalQuery": "Which are the best budget dog food brands online?",
      "submittedQuery": "Which are the best budget dog food brands online?",
      "response": "[AI OVERVIEW]\n...\n\n[ORGANIC RESULTS]\n...",
      "aiOverview": "...",
      "organicResults": [
        { "position": 1, "title": "...", "url": "...", "snippet": "..." }
      ],
      "sources": [
        { "index": 1, "title": "...", "url": "..." }
      ],
      "timestamp": "2026-01-24T...",
      "durationMs": 3456,
      "success": true
    }
  ]
}
```

## Analysis (Tenant Responsibility)

After Bentham execution, analyze results in your tenant repo:

1. Score HUFT visibility (mentions, prominence, positivity)
2. Extract source citations from AI Overview
3. Compare AI Overview vs organic results
4. Generate Excel workbook (same format as OpenAI study)
5. Create comparison report: Google vs OpenAI

## Comparison with OpenAI Study

| OpenAI Surface | Google Surface | Comparison |
|----------------|----------------|------------|
| ChatGPT Web | Google Search + AI Overview | Consumer AI experience |
| Chat API | Gemini API | Direct LLM API |
| Web Search API | Google Search (organic) | Traditional search |

## Cost Estimate

| Surface | India IP | US IP |
|---------|----------|-------|
| Google Search | ~$0.50 (proxy) | $0 |
| Gemini API | ~$0.53 | ~$0.03 |

**Total for 240 queries: ~$3-4**
