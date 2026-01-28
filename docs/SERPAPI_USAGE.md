# SerpAPI Usage Guide

SerpAPI is the recommended method for Google Search data collection in Bentham. It handles location, CAPTCHAs, and anti-bot measures automatically.

## Why SerpAPI

| Feature | Browser Automation | SerpAPI |
|---------|-------------------|---------|
| CAPTCHA handling | Manual/2Captcha | Automatic |
| Location control | Proxy required | Native params |
| Cloudflare issues | Frequent | None |
| Rate limiting | Aggressive | Managed |
| Cost per query | ~$0.02 (proxy) | ~$0.005 |
| Reliability | 60-80% | 99%+ |

## Configuration

### Environment Variables

```bash
# .env
SERPAPI_KEY=your-serpapi-api-key
```

### Basic Usage

```typescript
import 'dotenv/config';

const SERPAPI_KEY = process.env.SERPAPI_KEY;

async function searchGoogle(query: string, location: 'india' | 'us') {
  const locationParams = location === 'india'
    ? {
        location: 'Mumbai,Maharashtra,India',
        google_domain: 'google.co.in',
        gl: 'in',
        hl: 'en'
      }
    : {
        location: 'United States',
        google_domain: 'google.com',
        gl: 'us',
        hl: 'en'
      };

  const params = new URLSearchParams({
    api_key: SERPAPI_KEY,
    engine: 'google',
    q: query,
    ...locationParams,
  });

  const response = await fetch(`https://serpapi.com/search.json?${params}`);
  return response.json();
}
```

## Location Parameters

### India (Mumbai)
```typescript
{
  location: 'Mumbai,Maharashtra,India',
  google_domain: 'google.co.in',
  gl: 'in',
  hl: 'en'
}
```

### India (Bangalore)
```typescript
{
  location: 'Bangalore,Karnataka,India',
  google_domain: 'google.co.in',
  gl: 'in',
  hl: 'en'
}
```

### United States
```typescript
{
  location: 'United States',
  google_domain: 'google.com',
  gl: 'us',
  hl: 'en'
}
```

### United Kingdom
```typescript
{
  location: 'London,England,United Kingdom',
  google_domain: 'google.co.uk',
  gl: 'uk',
  hl: 'en'
}
```

## AI Overview Extraction

SerpAPI returns AI Overviews in the `ai_overview` field. The content may be:

1. **Inline text blocks** - Directly in the response
2. **Separate fetch required** - Use `serpapi_link` with `page_token`

### Handling AI Overviews

```typescript
interface SerpAPIResponse {
  ai_overview?: {
    text_blocks?: Array<{
      type: string;
      snippet?: string;
      list?: string[];
    }>;
    text?: string;
    page_token?: string;
    serpapi_link?: string;
  };
  organic_results?: Array<{
    position: number;
    title: string;
    link: string;
    snippet: string;
  }>;
}

async function extractAIOverview(data: SerpAPIResponse): Promise<string | null> {
  if (!data.ai_overview) return null;

  // Method 1: Text blocks in response
  if (data.ai_overview.text_blocks) {
    return data.ai_overview.text_blocks
      .map(block => {
        if (block.snippet) return block.snippet;
        if (block.list) return block.list.join('\n');
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  // Method 2: Direct text
  if (data.ai_overview.text) {
    return data.ai_overview.text;
  }

  // Method 3: Fetch via serpapi_link
  if (data.ai_overview.serpapi_link && data.ai_overview.page_token) {
    const url = `https://serpapi.com/search.json?api_key=${SERPAPI_KEY}&engine=google_ai_overview&page_token=${data.ai_overview.page_token}`;
    const response = await fetch(url);
    const aiData = await response.json();

    if (aiData.ai_overview?.text_blocks) {
      return aiData.ai_overview.text_blocks
        .map((block: any) => block.snippet || block.list?.join('\n') || '')
        .filter(Boolean)
        .join('\n\n');
    }
  }

  return null;
}
```

## Query Suffix Strategy

When using SerpAPI with location parameters:

| Scenario | Query Format | Location Params |
|----------|-------------|-----------------|
| India market study | "best dog food brands" | Mumbai, IN |
| US asking about India | "best dog food brands in India" | US |
| Compare markets | Run both versions | Both locations |

**Key insight:** With SerpAPI's location params, you generally DON'T need "in India" suffix for India-location queries. The location parameters tell Google where the searcher is.

## Rate Limiting

- **Free tier:** 100 searches/month
- **Paid plans:** Start at $50/month for 5,000 searches
- **Recommended delay:** 1-2 seconds between requests
- **Batch processing:** Up to 10 concurrent requests

## Error Handling

```typescript
async function searchWithRetry(query: string, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        if (data.error.includes('rate limit')) {
          await sleep(5000 * attempt);
          continue;
        }
        throw new Error(data.error);
      }

      return data;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(2000 * attempt);
    }
  }
}
```

## Cost Optimization

1. **Use caching** - Store results to avoid duplicate queries
2. **Batch similar queries** - Run related queries together
3. **Skip AI Overview fetch** - If not needed, don't request it
4. **Filter locations** - Only query necessary markets

## Integration with Bentham Studies

The main Google visibility study script (`scripts/run-google-visibility-study.ts`) uses SerpAPI:

```bash
# Run all Google studies
npx tsx scripts/run-google-visibility-study.ts

# Run specific study (India + AI Overview)
npx tsx scripts/run-google-visibility-study.ts g01

# Run range
npx tsx scripts/run-google-visibility-study.ts g01-g04
```

## Comparison: SerpAPI vs Browser Automation

### When to use SerpAPI
- Google Search (all markets)
- Google AI Overviews
- High-volume studies (100+ queries)
- Production/automated pipelines

### When to use Browser Automation
- ChatGPT (Cloudflare blocks SerpAPI-style approaches)
- Perplexity Web (no API available)
- Visual verification needed
- Testing specific browser behaviors

## Troubleshooting

### No AI Overview returned
- Not all queries trigger AI Overviews (~20-30% do)
- Try more specific/informational queries
- Check if AI Overview is available for that market

### Location not matching
- Verify `gl` and `google_domain` match
- Use specific city in `location` param
- Check SerpAPI dashboard for actual location used

### Rate limit errors
- Add delays between requests
- Upgrade plan if needed
- Implement exponential backoff
