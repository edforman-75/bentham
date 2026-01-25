# HUFT AI Visibility Study
## Optimizing Heads Up For Tails Presence on OpenAI Surfaces

**Prepared by:** Bentham Research
**Date:** January 24, 2026
**Client:** Heads Up For Tails (HUFT)
**Market Focus:** India

---

## Executive Summary

This study evaluated HUFT's visibility across 12 distinct OpenAI surfaces to understand where and how the brand appears in AI-generated recommendations. Our analysis of 240 AI responses reveals significant disparities in HUFT visibility depending on the surface, user location, and query formulation.

**Key Finding:** HUFT achieves strong visibility on the ChatGPT Web interface when accessed from India, but is virtually invisible on OpenAI's API surfaces—the same technology that powers third-party applications, chatbots, and enterprise solutions.

This gap represents both a vulnerability and an opportunity. As AI-powered shopping assistants, comparison tools, and recommendation engines proliferate, HUFT's current strong web presence may not translate to these emerging channels.

---

## Study Methodology

### Objective

Evaluate HUFT brand visibility across OpenAI's consumer and developer surfaces to:

1. Identify which surfaces provide the strongest HUFT representation

2. Understand the factors that influence HUFT visibility (IP location, query formulation)

3. Assess whether API-based testing can predict consumer web experience

4. Develop actionable recommendations to enhance HUFT's AI presence

### Test Design

We conducted a systematic evaluation across **12 distinct surface configurations**:

| Surface | Description | Endpoint |
|---------|-------------|----------|
| **ChatGPT Web** | Consumer-facing web interface | chatgpt.com (browser automation) |
| **Chat Completions API** | Developer API for third-party apps | api.openai.com/v1/chat/completions |
| **Web Search API** | API with real-time web search | api.openai.com/v1/responses (web_search tool) |

Each surface was tested under **4 conditions**:

* **India IP + Original prompts**: Simulating a typical Indian user
* **India IP + "in India" suffix**: Explicitly localized queries
* **US IP + Original prompts**: Simulating international/diaspora user
* **US IP + "in India" suffix**: International user seeking India-specific results

### Technical Implementation

**IP Geolocation:**

| Region | IP Address | Provider | Location |
|--------|------------|----------|----------|
| India | 103.x.x.x | Cherry Proxy | Mumbai, Maharashtra |
| US | 184.183.124.126 | Cox Communications | Sun Valley, Idaho |

**Browser Automation:** ChatGPT Web studies used Playwright connecting to Chrome via CDP (Chrome DevTools Protocol) on port 9222. India IP routing was achieved via SOCKS5 proxy configured in Chrome's ZeroOmega extension.

**API Calls:** All API studies used model `gpt-4o` via OpenAI's official endpoints. Web Search API studies used the Responses endpoint with the `web_search` tool enabled.

**Testing Period:** January 23-24, 2026

### Query Set

We utilized 20 product discovery queries representative of HUFT's core categories:

1. Dog food (budget, premium, vet-recommended, high-review)

2. Dog treats (gluten-free, low-calorie, sensitive stomach, vegetarian)

3. Dog accessories (beds, toys, harnesses)

4. Cat food (wet food, Indian brands)

5. Brand-specific query ("Heads Up For Tails options")

Queries were derived from the Ranjan et al. study on AI recommendations in the Indian pet products market, ensuring ecological validity.

### Evaluation Criteria

Each response was evaluated on six dimensions (1-10 scale):

| Criterion | Definition |
|-----------|------------|
| **Mention** | Frequency of HUFT/Heads Up For Tails references |
| **Prominence** | Position in response (early mention = higher score) |
| **Positivity** | Sentiment and endorsement language around HUFT |
| **Ranking** | Position relative to competitors (top 3 = higher score) |
| **Comprehensiveness** | Depth of HUFT coverage (products, prices, descriptions) |
| **Confidence** | Assertiveness of recommendation |

---

## Findings

### Overall Surface Performance

Results are grouped by surface type, as each surface has different characteristics and metrics.

#### ChatGPT Web Interface

Consumer-facing interface accessed via browser. Does not expose source citations.

| Rank | Study | Location | Query Type | Overall Score | HUFT Mentions | HUFT Rate |
|------|-------|----------|------------|---------------|---------------|-----------|
| **1** | S02 | India | "in India" | **3.9** | 73 | **73%** |
| **2** | S01 | India | Original | **3.8** | 70 | **70%** |
| 3 | S04 | US | "in India" | 3.0 | 50 | 50% |
| 4 | S03 | US | Original | 0.9 | 31 | 31% |

#### Chat Completions API

Developer API (gpt-4o model). Does not expose source citations.

| Rank | Study | Location | Query Type | Overall Score | HUFT Mentions | HUFT Rate |
|------|-------|----------|------------|---------------|---------------|-----------|
| **1** | S08 | US | "in India" | **2.1** | 22 | **22%** |
| 2 | S06 | India | "in India" | 1.7 | 18 | 18% |
| 3 | S07 | US | Original | 0.7 | 7 | 7% |
| 4 | S05 | India | Original | 0.5 | 3 | 3% |

#### Web Search API

API with real-time web search enabled. Exposes source citations in responses.

| Rank | Study | Location | Query Type | Overall Score | HUFT Mentions | HUFT Rate | Sources Cited |
|------|-------|----------|------------|---------------|---------------|-----------|---------------|
| **1** | S10 | India | "in India" | **1.7** | 36 | **36%** | Yes |
| 2 | S12 | US | "in India" | 1.3 | 30 | 30% | Yes |
| 3 | S11 | US | Original | 0.5 | 8 | 8% | Yes |
| 4 | S09 | India | Original | 0.2 | 1 | 1% | Yes |

### Key Observations

#### 1. ChatGPT Web Dominance

The consumer web interface dramatically outperforms APIs:

- **ChatGPT Web (India IP)**: 70-73 HUFT mentions across 20 queries

- **Chat API (India IP)**: 3-18 mentions

- **Web Search API (India IP)**: 1-36 mentions

HUFT appears in **75% of ChatGPT Web responses** from India, but only **15-35% of API responses**.

#### 2. IP Location Matters—But Only on Web

India IP addresses correlate with higher HUFT visibility on ChatGPT Web:

- India IP: 70-73 mentions

- US IP: 31-50 mentions

However, this effect **disappears on APIs**, where India IP actually produces *fewer* HUFT mentions than US IP in some configurations.

#### 3. Query Localization Has Limited Impact

Adding "in India" to queries provides modest improvement:

- ChatGPT Web India: 70 → 73 mentions (+4%)

- Chat API: Minimal change

- Web Search API: Minimal change

The explicit localization signal is less impactful than the underlying surface architecture.

#### 4. APIs Cannot Predict Web Experience
Correlation analysis reveals no API surface reliably predicts ChatGPT Web behavior:

| Comparison | Correlation | Match Rate |
|------------|-------------|------------|
| ChatGPT Web (India, Original) vs Study 2 | 0.49 | 70% |
| Chat API (India, Suffix) vs Study 2 | 0.35 | 50% |
| Web Search API (India, Suffix) vs Study 2 | 0.07 | 40% |

**Implication:** Testing HUFT visibility via APIs will not reveal how the brand performs for actual ChatGPT users.

#### 5. Query-Specific Patterns

Queries where HUFT consistently appears (across most surfaces):

- "Heads Up For Tails options" (100% - expected)

- "Gluten-free dog treats" (58%)

- "Dog harnesses for puppies" (50%)

Queries where HUFT rarely appears (even on favorable surfaces):

- "Dog food recommended by vets" (0%)

- "Pet food brand with good meat content" (0%)

- "Dog food brands with high reviews" (8%)

This suggests HUFT has strong associations with **treats and accessories** but weaker presence in **core dog food recommendations**.

---

## Competitive Context

When HUFT is not mentioned, responses typically feature:

- **International brands**: Pedigree, Royal Canin, Purina, Hill's Science Diet, Blue Buffalo

- **Budget brands**: Drools, Purepet, Chappi

- **Premium imports**: Orijen, Acana, Farmina

HUFT's positioning as a premium Indian brand with diverse product offerings is not consistently reflected in AI recommendations, particularly for food categories.

---

## Implications for HUFT

### Vulnerability: The API Gap

As AI becomes embedded in:

- E-commerce platforms (shopping assistants)

- Voice assistants (Alexa, Google Home integrations)

- Customer service chatbots

- Comparison shopping tools

- Veterinary clinic recommendation systems

These applications predominantly use **API surfaces**, where HUFT visibility is 5-70x lower than the consumer web interface.

**Risk:** A competitor who optimizes for API surfaces could dominate AI-powered product discovery channels while HUFT maintains only web visibility.

### Opportunity: Strengthen Web Presence in India

HUFT's strong performance on ChatGPT Web from India IP addresses indicates:

1. The brand has meaningful presence in training data and/or web search results

2. Location-aware personalization benefits HUFT

3. Indian users querying ChatGPT directly will frequently see HUFT recommendations

**Action:** Maintain and enhance this advantage through continued SEO optimization, content marketing, and brand authority building.

### Opportunity: Close the API Gap

The disparity between web and API surfaces suggests an opportunity for differentiation:

1. **Structured data**: Ensure HUFT product information is available in formats easily consumed by AI systems

2. **API-specific optimization**: Investigate what signals influence API recommendation behavior

3. **Partnership**: Explore direct integration opportunities with OpenAI or major API consumers

---

## Recommendations

### Immediate Actions (0-3 months)

1. **Audit training data sources**: Identify where HUFT content appears (or is absent) in likely AI training corpora

2. **Enhance structured data**: Implement comprehensive schema.org markup for all products

3. **Monitor API behavior**: Establish ongoing monitoring of HUFT visibility across API surfaces

### Medium-term Actions (3-6 months)

4. **Content gap analysis**: Develop authoritative content for categories where HUFT underperforms (vet-recommended food, high-protein options)

5. **Competitive benchmarking**: Track competitor visibility on same surfaces

6. **Third-party integrations**: Identify high-value applications using OpenAI APIs and pursue direct partnership

### Long-term Strategy (6-12 months)

7. **AI-specific brand building**: Develop content and signals specifically designed to influence AI training

8. **Diversify AI presence**: Extend analysis to Claude, Gemini, Perplexity and other AI platforms

9. **Enterprise AI engagement**: Engage with enterprise customers of OpenAI APIs to ensure HUFT inclusion in their product databases

---

## Appendix: Amazon Rufus Testing (Inconclusive)

We attempted to include Amazon's Rufus AI shopping assistant in this study but were unable to obtain reliable data:

**Amazon.in (India):** Rufus requires an authenticated Amazon India account. Testing was not possible without local account credentials.

**Amazon.com (US with India-localized prompts):** Testing revealed that Rufus exhibited "category-locking" behavior—once a product category was established (e.g., "dog food"), subsequent queries about different product types (treats, beds, toys, cat food) received responses anchored to the original category rather than the actual query content. This made cross-query comparison unreliable.

**Recommendation:** Future Rufus testing should use Amazon's mobile app (where Rufus has fuller functionality) or investigate whether Rufus behavior differs when queries are submitted in fresh sessions rather than sequential conversations.

---

## Source Influence Analysis

We analyzed which web sources appear in AI responses and their correlation with HUFT visibility.

### Key Finding: Source Citations Vary Dramatically by Surface

| Surface | Responses with Sources | Avg Sources/Response |
|---------|------------------------|----------------------|
| **Web Search API** | 80/80 (100%) | 4.2 |
| **Chat API** | 0/80 (0%) | 0 |
| **ChatGPT Web** | 0/80 (0%) | 0 |

The Web Search API explicitly cites sources via URLs, while Chat API and ChatGPT Web do not expose their source references.

### Top Sources by Frequency (Web Search API)

| Domain | Appearances | HUFT Co-occurrence |
|--------|-------------|-------------------|
| headsupfortails.com | 8 | 100% |
| zigly.com | 7 | 43% |
| pets-lifestyle.com | 7 | 29% |
| supertails.com | 6 | 33% |
| pawsindia.com | 5 | 60% |
| thecaninecompany.in | 3 | 100% |
| absolutpet.in | 3 | 100% |

### Source-HUFT Correlation Insights

**Strong Positive Correlation:**

- When **headsupfortails.com** appears as a source, HUFT is mentioned 100% of the time

- **thecaninecompany.in** and **absolutpet.in** also show 100% HUFT co-occurrence

- These sites likely feature HUFT products prominently in their content

**Weak or No Correlation:**

- **zigly.com** (43%), **supertails.com** (33%): HUFT competitors' sites rarely drive HUFT mentions

- **comfytails.in**, **sleepsia.in**: Pet-adjacent sites with 0% HUFT correlation

### Implications for HUFT Strategy

1. **Own-site SEO matters**: headsupfortails.com citations directly translate to AI mentions

2. **Competitor sites dilute presence**: Zigly, Supertails, and other competitors reduce HUFT visibility when cited

3. **Third-party authority sites**: Seek coverage on high-authority pet lifestyle sites that currently show low HUFT presence

4. **API opacity**: Chat API and ChatGPT Web don't reveal sources, making optimization more challenging than Web Search API

---

## Conclusion

HUFT enjoys strong visibility on ChatGPT's consumer web interface when accessed from India—the brand's primary market. This positions HUFT well for direct AI-assisted product discovery by Indian consumers.

However, the near-invisibility on API surfaces represents a significant blind spot. As AI becomes embedded in commerce, customer service, and product discovery applications, brands that appear only on consumer web interfaces will cede ground to competitors who optimize for the full AI ecosystem.

The path forward requires a dual strategy:

1. **Protect the web advantage**: Continue building brand authority and content presence that drives ChatGPT Web visibility

2. **Close the API gap**: Investigate and address the factors causing HUFT's absence from API-generated recommendations

The AI recommendation landscape is nascent and rapidly evolving. Early action to establish presence across all surfaces will compound over time as these systems become primary discovery channels for Indian pet product consumers.

---

## Cost Analysis

Understanding the cost structure is important for planning ongoing monitoring and larger-scale studies.

### Cost Per 1,000 Queries by Surface

| Surface | IP | API Tokens | Web Search | Proxy | Subscription | Total/1K |
|---------|-----|------------|------------|-------|--------------|----------|
| ChatGPT Web | India | $0 | $0 | $25 | $20 | **$45** |
| ChatGPT Web | US | $0 | $0 | $0 | $20 | **$20** |
| Chat API | US | $3.50 | $0 | $0 | $0 | **$3.50** |
| Chat API | India | $3.50 | $0 | $25 | $0 | **$28.50** |
| Web Search API | US | $5 | $30 | $0 | $0 | **$35** |
| Web Search API | India | $5 | $30 | $25 | $0 | **$60** |

### Actual Cost: This 20-Query Study

| Surface | Studies | Queries | Total Cost |
|---------|---------|---------|------------|
| ChatGPT Web (India) | 2 | 40 | $1.80 |
| ChatGPT Web (US) | 2 | 40 | $0.80 |
| Chat API (US) | 2 | 40 | $0.14 |
| Chat API (India) | 2 | 40 | $1.14 |
| Web Search API (US) | 2 | 40 | $1.40 |
| Web Search API (India) | 2 | 40 | $2.40 |
| **Total (12 studies)** | **12** | **240** | **$7.68** |

### Cost Implications

1. **Lowest cost monitoring**: Chat API at $3.50/1K queries—but this surface shows lowest HUFT visibility (15% vs 75% on web)
2. **Consumer experience testing**: ChatGPT Web at $45/1K (India) requires browser automation but provides the most valid HUFT visibility measurement
3. **Source influence analysis**: Web Search API at $35-60/1K exposes citations, useful for understanding what drives mentions
4. **Tradeoff**: The cheapest surface (Chat API) cannot predict the most valid surface (ChatGPT Web), so cost-effective monitoring requires accepting lower validity or investing in browser automation

---

## Appendix: Study Data

Full verbatim responses and scoring are available in the accompanying Excel file: `huft-analysis.xlsx`

* **Tab 1 (Study Configuration)**: IP addresses, geolocations, endpoints for each study
* **Tab 2 (Summary)**: Aggregated scores by surface
* **Tab 3 (Verbatims)**: All 240 responses with individual criterion scores
* **Tab 4 (Source Influence)**: Query-level source citations and domain presence
* **Tab 5 (Source Summary)**: Aggregated source statistics by surface configuration
* **Tab 6 (Cost Analysis)**: Per-1000 costs and actual study costs by surface

---

*This report was prepared by Bentham Research for Heads Up For Tails. Methodology and data collection conducted January 23-24, 2026.*
