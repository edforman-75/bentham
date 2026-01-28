# Bentham Visibility Tool

AI Visibility Assessment Tool for analyzing brand presence across AI surfaces (ChatGPT, Google AI Overviews, etc.) and evaluating website structured data quality.

## Features

- **JSON-LD Schema Analysis**: Evaluate Product schema markup quality across your website
- **AI Surface Testing**: Query OpenAI, Gemini, and other AI surfaces for brand mentions
- **Competitive Benchmarking**: Compare your brands against competitors
- **Automated Reports**: Generate professional HTML reports with charts
- **CLI & API**: Run via command line or integrate programmatically

## Installation

```bash
# Install globally
npm install -g @bentham/visibility-tool

# Or run with npx
npx @bentham/visibility-tool --help
```

## Quick Start

### Option A: Use the Web Form (Recommended for New Users)

Open the manifest builder form:

```bash
# From visibility-tool directory
pnpm form
# Or directly open in browser
open public/manifest-builder.html
```

The form lets you:
- Add primary brands and competitors
- Enter product URLs for JSON-LD analysis
- Select AI surfaces to test
- Configure options
- Download the manifest JSON

### Option B: Create a Study Manifest via CLI

```bash
visibility-tool init my-study.json
```

This creates a template manifest file. Edit it to configure:
- **brands**: Your brands and competitors with product URLs
- **queries**: Search queries to test on AI surfaces
- **surfaces**: Which AI platforms to analyze
- **report**: Output configuration

### 2. Run the Study

```bash
visibility-tool run my-study.json
```

### 3. View Results

Results are saved to the configured `outputDir`:
- `report.html` - Visual report with charts
- `jsonld-results.json` - Raw JSON-LD analysis data
- `summary.json` - Aggregate statistics
- `screenshots/` - Page screenshots (if enabled)

## Manifest Format

```json
{
  "id": "my-study-2026",
  "name": "Brand AI Visibility Study",

  "brands": [
    {
      "name": "MyBrand",
      "category": "primary",
      "segment": "footwear",
      "website": "https://mybrand.com",
      "productUrls": [
        "https://mybrand.com/product-1",
        "https://mybrand.com/product-2"
      ]
    },
    {
      "name": "Competitor",
      "category": "competitor",
      "segment": "footwear",
      "productUrls": [
        "https://competitor.com/product-1"
      ]
    }
  ],

  "queries": [
    { "text": "best running shoes 2026", "category": "running" },
    { "text": "MyBrand vs Competitor", "category": "comparison" }
  ],

  "surfaces": [
    { "name": "jsonld-pdp", "enabled": true },
    { "name": "openai-api", "enabled": true }
  ],

  "outputDir": "./results",

  "report": {
    "title": "AI Visibility Assessment",
    "clientName": "My Company",
    "includeCharts": true
  }
}
```

## CLI Commands

```bash
# Create new manifest
visibility-tool init [output.json]

# Validate manifest
visibility-tool validate <manifest.json>

# Run study
visibility-tool run <manifest.json>

# Run specific surfaces only
visibility-tool run manifest.json --surfaces jsonld-pdp,openai-api

# Regenerate report from existing results
visibility-tool report <results-dir>

# Dry run (validate without executing)
visibility-tool run manifest.json --dry-run
```

## API Server

Start the API server for programmatic access:

```bash
visibility-tool api
# or
PORT=3001 visibility-tool api
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/manifest/template` | Get manifest template |
| POST | `/api/manifest/validate` | Validate manifest |
| POST | `/api/study/submit` | Submit study job |
| GET | `/api/study/:jobId/status` | Get job status |
| GET | `/api/study/:jobId/results` | Get results (JSON) |
| GET | `/api/study/:jobId/report` | Get report (HTML) |
| GET | `/api/study/jobs` | List all jobs |

### Example API Usage

```bash
# Submit a study
curl -X POST http://localhost:3000/api/study/submit \
  -H "Content-Type: application/json" \
  -d @my-study.json

# Check status
curl http://localhost:3000/api/study/job-12345/status

# Get HTML report
curl http://localhost:3000/api/study/job-12345/report > report.html
```

## JSON-LD Scoring

Products are scored on a 100-point scale across 5 categories:

| Category | Max Points | What's Measured |
|----------|------------|-----------------|
| Identity | 25 | name, sku, mpn, gtin, brand |
| Content | 20 | description length, images |
| Commerce | 25 | price, currency, availability |
| Social | 20 | aggregateRating, reviews |
| Enrichment | 10 | category, color, material |

### Grades

- **A+ (90-100)**: Excellent - optimized for AI visibility
- **A (80-89)**: Good - minor improvements possible
- **B+ (70-79)**: Above average - some gaps
- **B (60-69)**: Average - notable gaps
- **C (50-59)**: Below average - significant issues
- **D (40-49)**: Poor - major gaps
- **F (<40)**: Failing - critical issues or missing schema

## Generating Strategic Narratives

The tool generates a prompt you can use with Claude Code to create VP-level strategic narratives:

1. Run your study
2. Open the HTML report
3. Find the "Generate Strategic Narrative" section
4. Copy the prompt into Claude Code
5. Claude will analyze the data and write a strategic report

## Programmatic Usage

```typescript
import {
  validateManifest,
  collectFromUrls,
  generateReport,
  scoreJsonLd
} from '@bentham/visibility-tool';

// Load and validate manifest
const manifest = validateManifest(require('./my-study.json'));

// Collect JSON-LD data
const results = await collectFromUrls(
  urls,
  { stealthMode: true },
  (completed, total, result) => {
    console.log(`${completed}/${total}: ${result.scoring.grade}`);
  }
);

// Generate report
const html = generateReport({ manifest, jsonld: results, timestamp: new Date().toISOString() });
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for AI surface testing | - |
| `GOOGLE_API_KEY` | Google API key for Gemini | - |
| `SERPAPI_KEY` | SerpAPI key for search results | - |
| `PORT` | API server port | 3000 |

## Chrome Setup for PDP Analysis

For JSON-LD collection with stealth mode, run Chrome with remote debugging:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

## License

MIT
