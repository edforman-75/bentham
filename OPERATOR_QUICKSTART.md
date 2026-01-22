# Operator Quickstart Guide

This guide walks you through setting up and running Bentham from the terminal.

> **Important:** Bentham requires manual browser setup for web chatbot surfaces. You must log into chatbot websites yourself before running queries.

---

## Why Two Types of Tests? (READ THIS FIRST)

Bentham exists because **API responses and Web responses are different** — and we need to monitor what consumers actually see.

### The Problem We're Solving

When you call the OpenAI API directly, you get the **foundation model's response** — no web search, no localization, no shopping data.

When a consumer visits chatgpt.com, they see something completely different — **web-augmented responses** with real-time search, local retailers, prices, and geographic personalization.

**Example from our HUFT India study:**

| Surface | HUFT Mentions | What It Shows |
|---------|---------------|---------------|
| OpenAI API | 6% of responses | Generic global brands (Purina, Blue Buffalo, Hill's) |
| ChatGPT Web | 65% of responses | India-localized brands, ₹ prices, local retailers |

That's a **10x difference**. If you only monitor the API, you're blind to what consumers actually see.

### Two Test Types

| Test Type | What It Does | Browser Required? |
|-----------|--------------|-------------------|
| **API Surface Test** | Calls api.openai.com directly with your API key | No |
| **Web Surface Test** | Scrapes chatgpt.com through an authenticated browser session | Yes (by design) |

**The browser requirement for web tests isn't a bug — it's the whole point.** We're capturing what consumers see, which requires a real browser session.

### Which Endpoints Do What?

| Endpoint | Purpose | Real-time? |
|----------|---------|------------|
| `POST /v1/query` | Run a single query against any surface | Yes |
| `POST /v1/studies` | Submit a batch study for async execution | Yes (queued) |
| `GET /v1/studies/:id` | Get status/results of a previous study | No (retrieves stored data) |

**Common confusion:** The `/v1/studies/:id` endpoint returns **stored results** from previous runs. It doesn't do real-time scraping. For real-time queries, use `/v1/query` or the CDP test scripts.

---

## Prerequisites

- Node.js 20+
- pnpm 8+
- Google Chrome
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

---

## Step 1: Clone and Install

```bash
git clone git@github.com:edforman-75/bentham.git
cd bentham
pnpm install
```

---

## Step 2: Create Your Environment File

**You MUST create a `.env` file before running Bentham.** Copy the example and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your API keys and credentials:

```bash
# REQUIRED: Database
DATABASE_URL=postgresql://user:password@localhost:5432/bentham

# REQUIRED: Redis
REDIS_URL=redis://localhost:6379

# REQUIRED for API surfaces: AI API keys
OPENAI_API_KEY=sk-your-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OPTIONAL: AWS for evidence storage
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_EVIDENCE=bentham-evidence

# OPTIONAL: Proxy provider (for geographic distribution)
BRIGHT_DATA_USERNAME=
BRIGHT_DATA_PASSWORD=
BRIGHT_DATA_HOST=

# OPTIONAL: Notifications
SLACK_WEBHOOK_URL=
```

**Never commit your `.env` file** — it's already in `.gitignore`.

---

## Step 3: Start Infrastructure

Option A: Use Docker (recommended for local dev):

```bash
docker-compose up -d
```

Option B: Run PostgreSQL and Redis locally/remotely and update `DATABASE_URL` and `REDIS_URL` in your `.env`.

---

## Step 4: Run Database Migrations

```bash
pnpm --filter @bentham/database migrate
```

---

## Step 5: Manual Browser Setup (Required for Web Chatbots)

**Web chatbot surfaces (ChatGPT, Perplexity, Claude, etc.) require you to manually log in via Chrome.**

### 5a. Start Chrome with Debug Port

Close all Chrome windows first, then start Chrome with remote debugging enabled:

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222
```

**Windows:**
```bash
chrome.exe --remote-debugging-port=9222
```

### 5b. Log Into Web Chatbots Manually

Open Chrome tabs and log into any chatbot surfaces you want to query:

| Surface | URL | Notes |
|---------|-----|-------|
| ChatGPT | https://chat.openai.com | Log in with OpenAI account |
| Perplexity | https://perplexity.ai | Log in or use without account |
| Claude | https://claude.ai | Log in with Anthropic account |
| Grok | https://x.com (access via X) | Requires X Premium subscription |
| Meta AI | https://meta.ai | Log in with Meta account |
| Copilot | https://copilot.microsoft.com | Log in with Microsoft account |

**Keep these tabs open while Bentham runs.** Bentham will interact with your authenticated sessions via Chrome DevTools Protocol (CDP).

### 5c. Verify Chrome Debug Port

```bash
curl http://localhost:9222/json/version
```

You should see Chrome version info. If this fails, Chrome isn't running with the debug port.

---

## Step 6: Start Bentham

**Terminal 1 — API Server:**
```bash
pnpm dev
```

**Terminal 2 — Worker (optional, for job processing):**
```bash
pnpm --filter @bentham/worker dev
```

---

## Step 7: Test a Query

> **Important:** The `/v1/query` endpoint requires the API server to be running (Step 6). If you get "connection refused", make sure `pnpm dev` is running in another terminal.

### API Surface Test (uses API key, no browser needed):

This calls the OpenAI API directly. You'll get the **foundation model's response** — no web search, no localization.

```bash
# Make sure the API server is running first (pnpm dev)
curl -X POST http://localhost:3000/v1/query \
  -H "Content-Type: application/json" \
  -d '{"surface": "openai-api", "query": "What are the best dog food brands in India?"}'
```

**Expected response:** Generic global brands (Purina, Blue Buffalo, Hill's, etc.) with no India-specific content.

### Web Surface Test (requires Chrome with logged-in session):

This scrapes chatgpt.com through your authenticated browser. You'll get **web-augmented responses** with real-time search and localization.

**Option A — Via API endpoint:**
```bash
curl -X POST http://localhost:3000/v1/query \
  -H "Content-Type: application/json" \
  -d '{"surface": "chatgpt-web", "query": "What are the best dog food brands in India?"}'
```

**Option B — Via CDP test script (direct):**
```bash
npx tsx scripts/test-all-cdp.ts "What are the best dog food brands in India?"
```

**Expected response:** India-localized brands (Drools, HUFT, Pedigree India), prices in ₹, local retailers (Amazon.in, Flipkart, BigBasket).

### Verifying the Difference

Run both tests with the same query and compare. You should see dramatically different results — that's the whole point of Bentham.

---

## Troubleshooting

### "Cannot connect to Chrome"
- Ensure Chrome is running with `--remote-debugging-port=9222`
- Check no other process is using port 9222
- Close all Chrome windows and restart with the debug flag

### "Session expired" or "Login required"
- Open Chrome, navigate to the chatbot URL
- Log in again
- Keep the tab open

### "Rate limited"
- Web chatbots have rate limits
- Wait a few minutes between queries
- Consider using API surfaces instead for high volume

### Database connection errors
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Run migrations: `pnpm --filter @bentham/database migrate`

---

## Surface Categories

| Category | Surfaces | Auth Method |
|----------|----------|-------------|
| **API** | OpenAI, Anthropic, Google AI, Perplexity API | API keys in `.env` |
| **Web Chatbots** | ChatGPT, Claude, Perplexity, Grok, Meta AI, Copilot | Manual browser login |
| **Search** | Google Search, Bing Search | Manual browser (optional login) |
| **E-commerce** | Amazon, Amazon Rufus, Zappos | Manual browser login |

---

## Next Steps

- Read [Architecture](docs/ARCHITECTURE.md) for system design
- Read [Modules](docs/MODULES.md) for component breakdown
- Read [API Reference](docs/API_REFERENCE.md) for endpoint documentation

---

## API Rate Limits and Quotas

When using API surfaces (OpenAI, Anthropic, etc.), you may need to **increase your API quotas** before running large studies:

| Provider | Default Limits | How to Increase |
|----------|---------------|-----------------|
| OpenAI | Varies by tier | [platform.openai.com/account/limits](https://platform.openai.com/account/limits) |
| Anthropic | 60 RPM (rate), $100/mo (spend) | [console.anthropic.com](https://console.anthropic.com) → Settings → Limits |
| Google AI | 60 RPM | [Google Cloud Console](https://console.cloud.google.com) → APIs → Quotas |
| Perplexity | Varies | [perplexity.ai/settings](https://perplexity.ai/settings) |

**Before running a large study:**
1. Calculate expected API calls: `queries × surfaces × locations`
2. Check your current quota/spend limits
3. Request increases if needed (may take 24-48 hours to approve)
4. Monitor usage during study execution

---

## Charter and Design Principles

Bentham follows strict design principles documented in [docs/CHARTER.md](docs/CHARTER.md):

1. **Manifest-Driven Execution** — Studies are defined declaratively
2. **Separation of Execution and Validation** — Executor cannot self-attest completion
3. **Deterministic by Default** — Production code, not AI making judgments
4. **Self-Healing with Transparency** — Auto-recovery with human notification
5. **Tenant Isolation** — Strict data separation between tenants

Read the full charter for guardrails, roles, and service level objectives.

---

## Security Notes

- **Never share your `.env` file**
- **Never commit API keys or passwords**
- Your browser sessions contain your personal login credentials
- Bentham only interacts with surfaces you've manually authenticated
