# Requirements for Other Modules

This document tracks requirements that emerged from customer feature requests but belong outside Bentham core (per P7: Platform-Agnostic Core).

---

## Content PIM (Glu Hub)

| Requirement | Source | Description |
|-------------|--------|-------------|
| Marketplace content transformation | GEO Opt #5 | Transform master content for Amazon (A+ content, bullets), Walmart, Flipkart formats |
| Tag management and sync | GEO Opt #6 | Manage product tags, sync to Shopify/marketplaces |
| Staged content approval workflow | GEO Opt #7, Task #6 | Hold content for review before publishing |
| Multi-format output | Task #4 | Transform Bentham JSON output into plain text, diff, HTML with CSS per target. Bentham outputs JSON only. |
| Analysis and reporting | Task #7, #8, #9 | Analyze Bentham JSON data, generate trend reports, performance metrics, correlation analysis. Bentham collects data; PIM analyzes. |
| Gap analysis | Task #2 | Compare existing content vs ideal. If API access → get via Manifest Interpreter. If no API → Bentham crawls. Analysis is tenant-specific. |
| Prioritization and scoring | Task #3 | Score and prioritize optimization opportunities based on Bentham data. Bentham outputs raw data; tenant engine decides priorities. |
| A/B testing for AI citations | Task #5 | Run before/after studies, compare JSON outputs, measure impact of changes. Orchestration triggers runs; tenant engine analyzes. |
| Time-series trend tracking | Task #8 | Schedule repeated Bentham runs, store results, compare visibility over time. Orchestration + data storage + analysis. |
| Channel-specific content versions | Merchant Center doc | Different descriptions per channel (Shopify vs Google MC vs Amazon) |
| Products optimized count | GEO Analytics #6 | Track how many products have been through optimization workflow (optimized vs pending) |
| Approval vs rejection rates | GEO Analytics #6 | Track approve/reject actions on staged content, identify patterns to improve recommendation quality |
| Confidence scores on recommendations | GEO Analytics #6 | Output confidence level on content recommendations, quality metric for optimization engine |
| **llms.txt generation** | Task #11 | Generate llms.txt content from crawled site data. Bentham discovers existing llms.txt (#23) and crawls content; PIM generates the file. |
| **Collection page optimization** | Task #14 | Generate optimized titles/descriptions for collection/category pages. Bentham analyzes collection pages (#14); PIM generates the content. |

---

## Manifest Interpreter Layer

| Requirement | Source | Description |
|-------------|--------|-------------|
| Shopify webhook listener | GEO Opt #3, Task #16, #20 | Listen for products/create, products/update webhooks. Trigger Bentham on platform events. |
| Platform-specific API calls | Task #13 | Shopify Admin API, BigCommerce API, other platform APIs |
| Content type handlers | GEO Opt #1, #2, Task #14 | PDP, Collection, Blog, Landing page structure awareness. Map platform-specific terminology (Shopify "Collections" = category pages). |
| llms.txt upload | Task #11 | Upload Bentham-generated llms.txt to Shopify Files API, create redirect to serve at /llms.txt |
| Shopify theme CSS extraction | Task #4 | Extract CSS from client's Shopify theme for on-brand HTML formatting |
| Content push to platform | Task #6 | Push Bentham-staged content to Shopify/platform via Admin API |
| Notification integrations | Task #20 | Email, Slack, dashboard notifications for human-in-the-loop approval |

---

## Tagging Service

| Requirement | Source | Description |
|-------------|--------|-------------|
| AI-powered tag generation | GEO Opt #6 | Auto-generate tags from product content + images |
| Visual search tagging | GEO Opt #6 | Image analysis for visual discovery compatibility |
| Seasonal/contextual tagging | GEO Opt #6 | "Summer", "Holiday gift", "Back to school" auto-tagging |

---

## Orchestration Layer

| Requirement | Source | Description |
|-------------|--------|-------------|
| Scheduled Bentham runs | Task #20 | Cron/scheduler to trigger Bentham studies on schedule (daily, weekly, on-demand) |
| Event-triggered runs | Task #20 | Trigger Bentham when platform events occur (new product, content change) |
| Job queue management | Task #20 | Queue, prioritize, and track Bentham job execution |
| Day-zero product triggers | Task #16 | Detect new product/listing changes. If API access → Manifest Interpreter gets data. If no API → trigger Bentham crawl. |
| Human-in-the-loop gates | Task #20 | Pause workflow for human approval before proceeding to next stage |
| Discovery scan jobs | Task #1 | Define and trigger discovery scan job types. Bentham runs the script; orchestrator decides job type and priorities. |

---

## Analytics Integration

| Requirement | Source | Description |
|-------------|--------|-------------|
| GA4 data ingestion | Task #7 | Ingest referral traffic data for correlation reporting |
| Revenue correlation | Issue 8 | Connect visibility changes to sales data |

---

## Retailer Data Service

| Requirement | Source | Description |
|-------------|--------|-------------|
| Store locator ingestion | GEO Opt #4 | API or CSV import of retail locations |
| Retailer relationship data | GEO Opt #4 | Which stores carry which products |

---

## Social/Community Integration

| Requirement | Source | Description |
|-------------|--------|-------------|
| Social listening tool integration | GEO Opt #7 | Partner with existing tools for Reddit/Quora monitoring |
| AI citation of social content | GEO Opt #7 | Bentham tracks which Reddit/Quora content appears in AI citations |

**Existing Tools (don't rebuild):**
- **KWatch.io** - Real-time Reddit/LinkedIn/X monitoring, $19/mo for 20 keywords, free tier available
- **Brand24** - Broader coverage including Quora, AI sentiment analysis, $99/mo+, also monitors LLMs
- **Sprout Social** - Enterprise social listening, Reddit/Quora included
- **Hootsuite Listening** - Enterprise, broad platform coverage

**STRATEGIC QUESTION:** Should Glu get into social media remediation at all? Options:
1. **Partner only** - Integrate with existing social listening tools, focus on AI citation tracking
2. **Light touch** - Monitor AI citations of social content, recommend actions, client executes
3. **Full service** - Build/acquire community management capability

Current recommendation: Option 2 (light touch) - unique value is AI citation connection, not competing with established social listening tools.

---

*Updated: 2026-01-27*
