# Surface Data Collection Methods

This document defines which data collection method Bentham uses for each AI surface, including location/proxy requirements.

## Overview

| Surface | Collection Method | Location Handling | Cloudflare Risk |
|---------|-------------------|-------------------|-----------------|
| Google Search | SerpAPI Adapter | Native (params) | None |
| Google AI Overview | SerpAPI Adapter | Native (params) | None |
| ChatGPT Web | Browser + CDP | VPN/Proxy required | High |
| Perplexity Web | Browser + Proxy | Proxy required | Medium |
| Gemini API | Direct API | API param | None |
| OpenAI API | Direct API | N/A (no location) | None |
| Anthropic API | Direct API | N/A (no location) | None |

## Collection Methods

### 1. SerpAPI Adapter (Recommended for Google)

**Surfaces:** `google-search`, `google-ai-overview`

**Why:** SerpAPI handles location natively via parameters. No proxy needed, no Cloudflare issues, handles CAPTCHAs automatically. The `SerpApiAdapter` properly parses AI Overview responses including `text_blocks`, `answer_box`, and `knowledge_graph` fallbacks.

**Usage:**
```typescript
import {
  createGoogleSearchSerpApiAdapter,
  createGoogleAiOverviewAdapter,
  SERPAPI_LOCATIONS,
} from '@bentham/surface-adapters';

// For Google Search (organic + AI Overview)
const searchAdapter = createGoogleSearchSerpApiAdapter(
  process.env.SERPAPI_KEY,
  'in-mum' // or custom location object
);

// For AI Overview only
const aiOverviewAdapter = createGoogleAiOverviewAdapter(
  process.env.SERPAPI_KEY,
  'in-mum'
);

// Available preset locations
// SERPAPI_LOCATIONS['in-mum'], ['in-blr'], ['in-del']
// SERPAPI_LOCATIONS['us-national'], ['us-nyc']
// SERPAPI_LOCATIONS['uk-lon']
```

**Location Parameters:**
```typescript
// India (Mumbai)
{
  location: 'Mumbai,Maharashtra,India',
  googleDomain: 'google.co.in',
  gl: 'in',
  hl: 'en'
}

// US (National)
{
  location: 'United States',
  googleDomain: 'google.com',
  gl: 'us',
  hl: 'en'
}
```

**Response Structure:**
```typescript
{
  success: true,
  structured: {
    mainResponse: '...',       // Full formatted text
    aiOverview: '...',         // AI Overview text only
    hasAiOverview: true,       // Whether AI Overview was found
    sources: [...],            // Cited sources
    organicResults: [...],     // Organic search results
    searchMetadata: {...},     // SerpAPI metadata
  }
}
```

**Cost:** ~$0.005 per search (with AI Overview extraction)

**Script:** `scripts/run-google-visibility-study.ts`

---

### 2. Browser Automation via CDP (ChatGPT)

**Surfaces:** `chatgpt-web`

**Why:** ChatGPT has aggressive Cloudflare protection that blocks Playwright's test browsers. Must use real Chrome connected via Chrome DevTools Protocol (CDP).

**Requirements:**
1. User's real Chrome browser (not Playwright's Chromium)
2. Chrome launched with `--remote-debugging-port=9222`
3. India IP via VPN (user must connect manually)
4. User logged into ChatGPT

**Location Handling:**
- IP address determines location context
- Queries should NOT include "in India" suffix when using India IP
- India VPN required for India-market studies

**Script:** `scripts/run-chatgpt-100-study-cdp-india.ts`

**Workflow (Option A: VPN):**
```bash
# 1. User connects to India VPN
# 2. Launch Chrome with CDP
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="/tmp/chrome-chatgpt" \
  "https://chatgpt.com"

# 3. User logs into ChatGPT
# 4. Run study
npx tsx scripts/run-chatgpt-india-study.ts
```

**Workflow (Option B: Vultr Mumbai VPS):**
```bash
# 1. Create Mumbai VPS on Vultr ($6/month)
# 2. Start SSH SOCKS tunnel
sshpass -p 'PASSWORD' ssh -D 1080 -f -C -q -N root@MUMBAI_IP

# 3. Launch Chrome with SOCKS proxy
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --proxy-server="socks5://localhost:1080" \
  --remote-debugging-port=9333 \
  --user-data-dir="/tmp/chrome-india" \
  "https://chatgpt.com"

# 4. Verify India IP at ipinfo.io, log into ChatGPT
# 5. Run study (update CDP_URL to port 9333)
npx tsx scripts/run-chatgpt-india-study.ts
```

---

### 3. Browser Automation with Proxy (Perplexity, Google fallback)

**Surfaces:** `perplexity-web`, `google-search` (fallback)

**Why:** These surfaces have lighter Cloudflare protection. Playwright with residential proxy works.

**Proxy Options:**

**2Captcha Residential (Recommended):**
```typescript
const PROXY_CONFIG = {
  server: 'http://170.106.118.114:2334',
  username: `${TWOCAPTCHA_API_KEY}-zone-custom-region-in-st-maharashtra-city-mumbai`,
  password: TWOCAPTCHA_API_KEY,
};
```

**Cherry Proxy (API calls only):**
```typescript
// Note: Cherry proxy works for HTTP API calls but NOT for browser HTTPS tunneling
const CHERRY_PROXY = {
  host: 'aus.360s5.com',
  port: 3600,
  user: '10016865-zone-custom-region-IN-sessid-StudyName-sessTime-120',
  pass: 'WFRqYTzM',
};
```

---

### 4. Direct API Calls

**Surfaces:** `openai-api`, `anthropic-api`, `google-ai-api`, `perplexity-api`, `xai-api`, `together-api`

**Why:** No browser needed. Direct HTTP requests to API endpoints.

**Location Handling:**
- Most APIs don't have location parameters
- Gemini API: Can set `user_location` in request
- OpenAI: No native location; use "in India" suffix in prompts if needed

---

## Decision Matrix

```
Is it Google Search/AI Overview?
  └─ YES → Use SerpAPI
  └─ NO ↓

Is it a direct API (OpenAI, Anthropic, etc.)?
  └─ YES → Use Direct API call
  └─ NO ↓

Is it ChatGPT Web?
  └─ YES → Use CDP + VPN (Cloudflare blocks proxied Playwright)
  └─ NO ↓

Is it Perplexity Web or other?
  └─ YES → Use Playwright + 2Captcha Proxy
```

## Location-Specific Query Handling

| IP Location | Query Suffix | Example |
|-------------|--------------|---------|
| India IP | No suffix | "best dog food brands" |
| US IP | Add "in India" | "best dog food brands in India" |
| API (no location) | Add "in India" | "best dog food brands in India" |
| SerpAPI | No suffix (use params) | "best dog food brands" |

## Proxy Credentials

### 2Captcha (Browser automation)
- **Server:** `http://170.106.118.114:2334`
- **Username format:** `{API_KEY}-zone-custom-region-in-st-{state}-city-{city}`
- **Password:** Same as API key
- **Example cities:** `mumbai`, `bengaluru`, `delhi`

### Cherry Proxy (API calls only)
- **Server:** `aus.360s5.com:3600`
- **Username:** `10016865-zone-custom-region-IN-sessid-{SessionName}-sessTime-120`
- **Password:** `WFRqYTzM`

## Environment Variables

```bash
# .env file
SERPAPI_KEY=your-serpapi-key
TWOCAPTCHA_API_KEY=your-2captcha-key
OPENAI_API_KEY=your-openai-key
GEMINI_API_KEY=your-gemini-key
```

## Common Issues

### ChatGPT: ERR_CONNECTION_CLOSED or Cloudflare block
- **Cause:** Using Playwright browser instead of real Chrome
- **Fix:** Use CDP connection to user's real Chrome + VPN

### Google: CAPTCHA challenges
- **Cause:** Too many requests or detected automation
- **Fix:** Use SerpAPI instead of browser automation

### Proxy: ERR_TUNNEL_CONNECTION_FAILED
- **Cause:** Cherry proxy doesn't support HTTPS tunneling for browsers
- **Fix:** Use 2Captcha proxy for browser automation, Cherry for API only

### Proxy: HTTP 407 Authentication Required
- **Cause:** Proxy credentials incorrect or expired
- **Fix:** Verify credentials, check API key balance
