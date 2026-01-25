# Running the Ranjan Web Search API Comparison Study

This guide walks you through running the four-way surface comparison study.

---

## What This Study Does

Runs the same 20 prompts Ranjan used through **four different OpenAI surfaces**:

| # | Surface | Localization Method | IP Address |
|---|---------|---------------------|------------|
| 1 | OpenAI API Baseline | None (control group) | Your direct IP |
| 2 | OpenAI API + India Prompt | System prompt injection | Your direct IP |
| 3 | OpenAI Web Search API | `user_location` parameter (Ranjan's approach) | Your direct IP |
| 4 | ChatGPT Web | India IP via residential proxy | Mumbai proxy IP |

**Purpose:** Determine if the Web Search API with `user_location` achieves ChatGPT.com-like localization.

---

## Prerequisites

### 1. Environment Setup

Make sure you have:
- Node.js 20+
- pnpm installed
- Playwright installed: `pnpm add playwright`
- csv-parse installed: `pnpm add csv-parse`

### 2. API Keys (Already Configured)

The `.env` file already has the required keys:
- `OPENAI_API_KEY` - for API surfaces
- `TWOCAPTCHA_API_KEY` - for India proxy

The script loads these automatically via `dotenv/config`.

### 3. Ranjan's CSV File

Place Ranjan's Web Search API results at:
```
/Users/edf/Downloads/huft_api_response_22_Jan_2026 - huft_web_search_api_20.csv
```

---

## Step-by-Step Instructions

### Step 1: Navigate to Bentham Directory

```bash
cd /Users/edf/bentham
```

### Step 2: Install Dependencies (if not already done)

```bash
pnpm install
pnpm add csv-parse playwright
```

### Step 3: Run the Study

```bash
npx tsx scripts/run-ranjan-comparison-study.ts
```

### Step 4: Log into ChatGPT (when prompted)

The script will:
1. Open a browser window with India proxy
2. Navigate to chatgpt.com
3. Prompt you to log in manually

**When you see:**
```
Please log in manually in the browser window.
Press Enter here when you are logged in and ready...
```

1. Log into ChatGPT in the browser
2. Make sure you can see the chat interface
3. Press Enter in the terminal

### Step 5: Monitor Progress

The script will show progress like:
```
[1/20] "Which are the best budget dog food brands online?"
──────────────────────────────────────────────────────────────────────
  → OpenAI API Baseline... ✓ (1250ms) [IP: 73.xxx.xxx.xxx]
  → OpenAI API + India Prompt... ✓ (1340ms) [IP: 73.xxx.xxx.xxx]
  → OpenAI Web Search API... ✓ (2100ms, 5 sources) [IP: 73.xxx.xxx.xxx]
  → ChatGPT Web (India IP)... ✓ (8500ms) [IP: 103.xxx.xxx.xxx]
```

### Step 6: Handle Notifications

**If you get a quota notification:**
```
🚨🚨🚨 [10:30:45 AM] OpenAI quota/rate limit exceeded!
```
The script will skip remaining OpenAI API calls but continue with ChatGPT Web.

**If a query gets stuck (>2 minutes):**
```
🚨🚨🚨 [10:30:45 AM] STUCK! ChatGPT Web query #5 taking 3+ minutes
```
Check the browser window - you may need to manually interact or restart.

### Step 7: Review Results

When complete, the script generates:

1. **Results JSON:** `studies/ranjan-comparison-results.json`
   - Full response data from all surfaces
   - Request payloads and timestamps
   - Localization metrics

2. **Provenance Report:** `studies/ranjan-comparison-provenance-report.txt`
   - Exact configuration for each surface
   - IP addresses used
   - Comparison matrix
   - Localization metrics vs Ranjan's data

---

## Output Files

| File | Description |
|------|-------------|
| `ranjan-comparison-results.json` | Complete study results with all responses |
| `ranjan-comparison-provenance-report.txt` | Audit report of what was submitted to each surface |
| `ranjan-comparison-intermediate-N.json` | Checkpoint files (for resuming) |

---

## Resuming an Interrupted Study

If the study stops mid-way, you can resume:

1. Find the last completed query number in the intermediate file
2. Edit the script and set `RESUME_FROM_QUERY`:
   ```typescript
   const RESUME_FROM_QUERY = 10; // Start from query 11
   ```
3. Run the script again

---

## Troubleshooting

### "Cannot connect to proxy"
- Check 2Captcha proxy credentials
- Verify proxy balance at 2captcha.com

### "ChatGPT requires login"
- The browser may have been blocked
- Try clearing cookies and logging in again
- Use a fresh browser profile

### "Rate limited" or "Quota exceeded"
- Check your OpenAI API quota at platform.openai.com
- The script will continue with ChatGPT Web even if API calls fail

### "Stuck on ChatGPT Web"
- ChatGPT sometimes hangs on the web interface
- Try refreshing the page manually
- Check if there's a CAPTCHA or verification

---

## Understanding the Provenance Report

The report documents exactly what was submitted:

```
SURFACE: OpenAI Web Search API + user_location
─────────────────────────────────────────────────
IP SOURCE:
  Type:              direct
  Location:          San Francisco, California, US
  IP Address:        73.xxx.xxx.xxx

LOCALIZATION METHOD:
  user_location parameter: {country: IN, city: Mumbai}

REQUEST TEMPLATE:
  Endpoint:          https://api.openai.com/v1/responses
  ...
```

This lets you audit exactly how each surface was called.

---

## Comparing Results

The report includes a comparison section:

```
LOCALIZATION METRICS COMPARISON
═══════════════════════════════════════════════════════════════════════════════

RANJAN'S WEB SEARCH API RESULTS (from CSV):
  ₹ Price mentions:      45
  Indian retailers:      32
  Indian brands:         28
  HUFT mentions:         15

OPENAI API BASELINE:
  ₹ Price mentions:      2 (4% of Ranjan)
  Indian retailers:      3 (9% of Ranjan)
  ...

CHATGPT WEB (INDIA IP):
  ₹ Price mentions:      48 (107% of Ranjan)
  Indian retailers:      35 (109% of Ranjan)
  ...
```

This shows which surface achieves the best India localization.

---

## Expected Runtime

- **Per query:** ~15-30 seconds (all 4 surfaces)
- **Total study:** ~10-15 minutes for 20 queries
- **With retries:** May take longer if rate limited

---

## Contact

If issues arise, check:
1. The terminal output for error messages
2. The browser window for ChatGPT issues
3. The intermediate files for partial results
