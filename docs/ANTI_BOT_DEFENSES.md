# Anti-Bot Defenses & Countermeasures

This document catalogs the anti-bot defenses Bentham encounters and the countermeasures implemented.

---

## Defense Categories

AI surfaces and websites employ multiple layers of bot detection:

1. **Browser Fingerprinting** - Detecting automation through browser characteristics
2. **Behavioral Analysis** - Detecting non-human interaction patterns
3. **Network Analysis** - Identifying datacenter IPs and proxy patterns
4. **CAPTCHA Challenges** - Explicit human verification
5. **Rate Limiting** - Throttling based on request volume
6. **Account-Level Detection** - Flagging suspicious account behavior

---

## 1. Browser Fingerprinting

### What They Detect

| Signal | Detection Method | Risk Level |
|--------|------------------|------------|
| Navigator properties | `navigator.webdriver = true` | Critical |
| Chrome DevTools Protocol | CDP detection scripts | High |
| Canvas fingerprint | Unique per-browser rendering | Medium |
| WebGL fingerprint | GPU rendering characteristics | Medium |
| Audio fingerprint | AudioContext processing | Low |
| Font enumeration | Installed font list | Low |
| Plugin/extension list | Automation extensions | Medium |
| Screen resolution | Headless default sizes | Medium |
| Timezone mismatch | Browser vs IP location | High |

### Bentham Countermeasures

```typescript
// Playwright stealth configuration
const browser = await playwright.chromium.launch({
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
  ],
});

// Override navigator.webdriver
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });
});
```

**Implemented:**
- Playwright Stealth plugin for common fingerprint evasions
- Timezone alignment with proxy location
- Realistic screen resolutions (non-default)
- User-agent rotation matching proxy location
- Canvas noise injection (optional)

**Planned:**
- WebGL fingerprint randomization
- Font fingerprint normalization

---

## 2. Behavioral Analysis

### What They Detect

| Signal | Detection Method | Risk Level |
|--------|------------------|------------|
| Mouse movement | Linear paths, no micro-movements | High |
| Typing patterns | Instant text entry, no variance | High |
| Scroll behavior | Programmatic vs natural scroll | Medium |
| Click timing | Too fast, too consistent | High |
| Page interaction | No hover, no random clicks | Medium |
| Session duration | Too short, too uniform | Medium |
| Navigation patterns | Direct URL access, no browsing | Medium |

### Bentham Countermeasures

```typescript
// Human-like typing
async function humanType(page: Page, text: string) {
  for (const char of text) {
    await page.keyboard.type(char);
    await delay(50 + Math.random() * 100); // Variable delay
  }
}

// Human-like mouse movement
async function humanClick(page: Page, selector: string) {
  const element = await page.$(selector);
  const box = await element.boundingBox();

  // Move to element with bezier curve, not straight line
  await page.mouse.move(
    box.x + box.width / 2 + (Math.random() - 0.5) * 10,
    box.y + box.height / 2 + (Math.random() - 0.5) * 10,
    { steps: 10 + Math.floor(Math.random() * 10) }
  );

  await delay(50 + Math.random() * 100);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
```

**Implemented:**
- Variable typing speed with natural pauses
- Mouse movement with bezier curves
- Random micro-movements and hovers
- Variable delays between actions
- Natural scroll patterns

**Planned:**
- Session warm-up with random browsing
- Occasional "mistakes" (typos, back navigation)

---

## 3. Network Analysis

### What They Detect

| Signal | Detection Method | Risk Level |
|--------|------------------|------------|
| Datacenter IP | IP database lookup | Critical |
| Known proxy IP | Proxy blacklists | Critical |
| IP reputation | Historical abuse scores | High |
| Geographic mismatch | IP location vs account | High |
| ASN analysis | Hosting provider detection | Medium |
| Connection fingerprint | TLS fingerprint, TCP/IP stack | Medium |
| Request patterns | Identical timing, headers | Medium |

### Bentham Countermeasures

**Implemented:**
- Residential proxy providers (Bright Data, Oxylabs)
- City-level geographic targeting
- IP rotation per study (not per-request)
- Session-sticky IPs for consistency
- Multi-provider failover

**Provider Selection:**

| Provider | Type | Detection Risk | Cost |
|----------|------|----------------|------|
| Bright Data | Residential | Low | $15-25/GB |
| Oxylabs | Residential | Low | $15-20/GB |
| SmartProxy | Residential | Low-Medium | $12-14/GB |
| IPRoyal | Residential | Medium | $5-7/GB |
| Datacenter | Datacenter | High | $1-3/GB |

**Planned:**
- TLS fingerprint randomization (curl-impersonate)
- HTTP/2 fingerprint matching

---

## 4. CAPTCHA Challenges

### Types Encountered

| CAPTCHA Type | Surfaces Using It | Difficulty |
|--------------|-------------------|------------|
| reCAPTCHA v2 | Google, many others | Medium |
| reCAPTCHA v3 | Google services | Low (score-based) |
| hCaptcha | Cloudflare sites | Medium |
| Cloudflare Turnstile | ChatGPT, many others | Low-Medium |
| FunCaptcha | Some enterprise | High |
| Custom image | Meta, Amazon | Medium |

### Bentham Countermeasures

**Implemented:**
- 2Captcha integration for human solving
- Anti-Captcha as backup provider
- Automatic CAPTCHA detection
- Session health tracking (CAPTCHA frequency)
- Session rotation on high CAPTCHA rate

```typescript
// CAPTCHA detection
async function detectCaptcha(page: Page): Promise<CaptchaType | null> {
  const indicators = [
    { selector: 'iframe[src*="recaptcha"]', type: 'recaptcha-v2' },
    { selector: 'iframe[src*="hcaptcha"]', type: 'hcaptcha' },
    { selector: 'iframe[src*="turnstile"]', type: 'turnstile' },
  ];

  for (const { selector, type } of indicators) {
    if (await page.$(selector)) return type;
  }
  return null;
}

// Solve with 2Captcha
async function solveCaptcha(page: Page, type: CaptchaType) {
  const siteKey = await extractSiteKey(page, type);
  const solution = await captchaSolver.solve({
    type,
    siteKey,
    pageUrl: page.url(),
  });
  await injectSolution(page, type, solution);
}
```

**Cost:** ~$3/1000 solves

---

## 5. Rate Limiting

### Patterns Observed

| Surface | Rate Limit | Reset Window | Penalty |
|---------|------------|--------------|---------|
| ChatGPT (web) | ~50 msgs/3hr | Rolling | Soft block |
| Perplexity (web) | ~100/day | Daily | Hard block |
| Claude API | Per-tier limits | Minute/day | 429 response |
| Google Search | ~100/day/IP | Daily | CAPTCHA + block |
| Amazon | Variable | Session-based | Product block |

### Bentham Countermeasures

**Implemented:**
- Per-surface rate limit tracking
- Exponential backoff on 429s
- Session rotation on rate limit
- Query distribution across sessions
- Configurable delays between queries

```typescript
// Rate limit configuration per surface
const surfaceDefaults = {
  'chatgpt-web': {
    maxQueriesPerSession: 40,
    minDelayBetweenQueries: 30000, // 30 seconds
    cooldownOnRateLimit: 3600000, // 1 hour
  },
  'perplexity-web': {
    maxQueriesPerSession: 80,
    minDelayBetweenQueries: 15000,
    cooldownOnRateLimit: 86400000, // 24 hours
  },
};
```

**Planned:**
- Predictive rate limit modeling
- Cross-study query coordination

---

## 6. Account-Level Detection

### Signals

| Signal | Detection Method | Risk Level |
|--------|------------------|------------|
| New account velocity | Query volume from new accounts | High |
| Account age | Fresh accounts flagged | Medium |
| Profile completeness | Empty profiles suspicious | Low |
| Login patterns | Same device, different locations | High |
| Query patterns | Research-style queries | Medium |
| Session anomalies | Long sessions, no breaks | Medium |

### Bentham Countermeasures

**Implemented:**
- Account warming period (gradual usage increase)
- Profile completion during setup
- Consistent login location per account
- Session breaks and realistic usage patterns
- Account rotation across studies

**Account Lifecycle:**

```
creation → warming (7-14 days) → ready → active → cooling → recycled
              ↓                    ↓
           flagged ←──────── suspended
```

**Planned:**
- Dedicated accounts per study (full isolation)
- Account reputation scoring
- Proactive account retirement

---

## Surface-Specific Defenses

### ChatGPT (OpenAI)

| Defense | Level | Countermeasure |
|---------|-------|----------------|
| Cloudflare Turnstile | Medium | CAPTCHA solver |
| Browser fingerprinting | High | Playwright stealth |
| Rate limiting | Medium | Session rotation |
| Account detection | Medium | Warm accounts |

### Google Search

| Defense | Level | Countermeasure |
|---------|-------|----------------|
| reCAPTCHA | High | CAPTCHA solver + residential IPs |
| IP reputation | Critical | Premium residential proxies |
| Query patterns | Medium | Randomized delays |

### Perplexity

| Defense | Level | Countermeasure |
|---------|-------|----------------|
| Rate limiting | High | Low query velocity |
| Account detection | Low | Standard precautions |
| Browser detection | Medium | Playwright stealth |

### Meta AI

| Defense | Level | Countermeasure |
|---------|-------|----------------|
| Account verification | High | Aged, verified accounts |
| Browser fingerprinting | High | Puppeteer (works better) |
| IP reputation | Medium | Residential proxies |

### Amazon (Rufus)

| Defense | Level | Countermeasure |
|---------|-------|----------------|
| Browser fingerprinting | High | Stealth plugins |
| Rate limiting | Medium | Session rotation |
| Product access blocks | Medium | Query distribution |

---

## Monitoring & Response

### Detection Indicators

Bentham monitors for signs that defenses have been triggered:

```typescript
interface DetectionSignals {
  captchaRate: number;      // CAPTCHAs per 100 queries
  blockRate: number;        // Hard blocks per 100 queries
  responseLatency: number;  // Unusual delays
  errorRate: number;        // 4xx/5xx responses
  contentQuality: number;   // Degraded responses
}

// Thresholds for concern
const thresholds = {
  captchaRate: { warning: 5, critical: 15 },
  blockRate: { warning: 1, critical: 5 },
  responseLatency: { warning: 10000, critical: 30000 },
};
```

### Automated Response

| Signal | Threshold | Response |
|--------|-----------|----------|
| CAPTCHA rate > 15% | Critical | Rotate session, pause surface |
| Block rate > 5% | Critical | Pause surface, notify operator |
| Response degradation | Warning | Increase delays, rotate proxy |
| Account suspension | Critical | Quarantine account, switch |

---

## Best Practices for Operators

### Study Configuration

1. **Start slow** - Begin with low query velocity, increase gradually
2. **Distribute queries** - Don't hit one surface intensively
3. **Use residential proxies** - Never use datacenter for web surfaces
4. **Warm accounts** - Let new accounts age before heavy use
5. **Monitor signals** - Watch CAPTCHA and block rates

### When Detection Occurs

1. **Don't panic** - One CAPTCHA doesn't mean detection
2. **Slow down** - Reduce query velocity immediately
3. **Rotate** - Switch sessions and proxies
4. **Analyze** - Check which queries triggered detection
5. **Adapt** - Update timing and patterns based on learnings

---

## Anticipated Future Challenges

Detection technology is evolving rapidly. These are the challenges we expect to face:

| Challenge | Timeline | Impact | Planned Response |
|-----------|----------|--------|------------------|
| **ML-Based Behavioral Detection** | Now - 2025 | Critical | AI-generated behavioral patterns, recorded human sessions |
| **Device Attestation** (TPM, Secure Enclave) | 2025-2026 | High | Real device farms, mobile device pool |
| **Residential IP Degradation** | 2025 | High | Premium proxy tiers, mobile carrier IPs |
| **Cross-Site Tracking** | 2025-2026 | Medium | Isolated browser profiles, session compartmentalization |
| **Account Verification Escalation** | Now - 2025 | High | Verified account inventory, longer warming periods |
| **API-Only Access** | 2025-2026 | Medium | API-first architecture (already supported) |
| **Content Watermarking** | 2026+ | Low | Watermark detection, methodology transparency |
| **Geographic Restrictions** | Now | Medium | Multi-region proxy coverage, location-specific accounts |

### Challenge Details

#### ML-Based Behavioral Detection
AI models are being deployed to analyze mouse movements, typing patterns, and scroll behavior in real-time. Simple randomization may no longer be sufficient.

**Response:** Record actual human interaction sessions and replay patterns, train our own models to generate realistic behavior, implement micro-hesitations and correction patterns.

#### Device Attestation
Platforms may require hardware-level verification that the browser is running on a real device, not a virtual machine or headless browser.

**Response:** Invest in real device farms (physical phones/tablets), explore mobile carrier IP partnerships, consider cloud-based real browser services.

#### Residential IP Degradation
As residential proxy services become more popular, major platforms are building databases of known proxy IPs even in residential ranges.

**Response:** Use premium proxy tiers with guaranteed fresh IPs, rotate across multiple providers, consider mobile carrier IPs which are harder to blacklist.

---

## Mitigation Roadmap

### Short-term (Q1-Q2 2025)
- [ ] ML-based CAPTCHA prediction (reduce solve costs)
- [ ] Automated behavioral pattern tuning based on detection signals
- [ ] Cross-surface detection correlation
- [ ] Premium proxy tier integration

### Medium-term (Q3-Q4 2025)
- [ ] Custom browser builds with deep stealth
- [ ] Mobile device emulation
- [ ] Advanced TLS fingerprint management
- [ ] Account reputation scoring system

### Long-term (2026+)
- [ ] Dedicated mobile device farm
- [ ] AI-generated behavioral patterns
- [ ] Real-time defense adaptation
- [ ] API-first migration for high-volume surfaces

---

## References

- [Playwright Stealth](https://github.com/nicklason/playwright-stealth)
- [Puppeteer Extra](https://github.com/berstend/puppeteer-extra)
- [FingerprintJS](https://fingerprintjs.com/) - Understanding browser fingerprinting
- [CreepJS](https://abrahamjuliot.github.io/creepjs/) - Fingerprint testing tool
- [2Captcha Documentation](https://2captcha.com/api-docs)
- [Bright Data Documentation](https://docs.brightdata.com/)
