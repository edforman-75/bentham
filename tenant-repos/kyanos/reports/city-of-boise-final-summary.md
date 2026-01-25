# How Can the City of Boise Improve Its Web Presence?

**An AI Visibility Assessment**

**Prepared for:** City of Boise
**Date:** January 25, 2026
**Methodology:** Kyanos Phase Analysis

---

## The Question

**How visible is the City of Boise when citizens, businesses, and visitors search for information using AI-powered tools?**

We tested 118 real-world queries across 5 major AI and search platforms to find out.

---

## The Answer

**When someone asks a question about Boise, they get a useful answer 93% of the time—across all platforms.**

| Category | Answer Quality | Assessment |
|----------|---------------|------------|
| Business Relocation | **100%** | Excellent |
| Quality of Life | **100%** | Excellent |
| Tourism | **99%** | Excellent |
| Healthcare | **100%** | Excellent |
| Government | **92%** | Good |
| City Services | **88%** | Good |
| Leadership | **82%** | Needs work |
| **Transportation** | **52%** | **Problem area** |
| **OVERALL** | **93%** | Strong |

*Answer quality = weighted probability a user gets a Boise-relevant answer across Google (75%), ChatGPT (12%), Bing (8%), and Meta AI (3%)*

### The Good News

Boise's web presence is strong. Across all major platforms, users searching for information about Boise—permits, tourism, cost of living, business opportunities—are getting relevant answers the vast majority of the time.

### The Problem Areas

Two categories need attention:
- **Transportation (52%)** — Users searching for transit, roads, ACHD coordination are often not finding Boise-specific answers
- **Leadership (82%)** — Some gaps in mayor/council visibility

---

## Platform Performance

| Platform | Query Share | Boise Answer Rate |
|----------|-------------|-------------------|
| Google Organic | 75% | 93% |
| ChatGPT | 12% | 98% |
| Bing | 8% | 99% |
| Meta AI | 3% | 96% |

Google AI Overviews are a separate consideration—see below.

---

## About Google AI Overviews

When someone searches Google for government services, Google increasingly shows an **AI Overview**—a generated summary that appears at the top of results. These summaries get significant attention and clicks.

**Boise appears in AI Overviews for only 15% of queries.**

Worse, the gap is concentrated in exactly the queries that matter most:

| Query Category | AI Overview Rate |
|----------------|------------------|
| City Services (permits, licenses) | **0%** |
| Government (budget, structure) | **0%** |
| Business Relocation (incentives) | **0%** |
| Transportation | **0%** |
| Healthcare | **0%** |
| Elections | **0%** |
| Quality of Life | 40% |
| Tourism | 30% |

**Translation:** Someone searching "How do I get a building permit in Boise" will not see Boise in Google's AI-generated answer. Someone searching "Is Boise a good place to live" probably will.

**Important caveat:** We validated this finding by testing the same queries for Denver, Austin, and Seattle. Google does not generate AI Overviews for transactional government service queries for ANY city. This is a Google platform limitation, not a Boise problem.

**Focus on what you can control now:**
1. **Google Organic (53%)** — This is where the real opportunity is. Better content structure and SEO can move this significantly.
2. **ChatGPT/Bing (98%)** — Already strong. Maintain and monitor for accuracy.

**Prepare for the future:**
- When Google expands AI Overviews to government services (likely inevitable), cities with well-structured, authoritative content will be cited first. The work you do now for organic SEO will pay off then too.

---

## What This Means

### The Good News

1. **ChatGPT knows Boise well.** 98% of queries return helpful, accurate information about city services, government, and attractions. Citizens using ChatGPT for information are well-served.

2. **Bing is strong.** 98% visibility means Boise ranks well in Microsoft's ecosystem (including Copilot).

3. **Tourism content works.** Quality of life and tourism queries perform reasonably well across all platforms.

### The Concern

1. **Google dominates search.** Despite ChatGPT's rise, most people still start with Google. The 53% Google Search visibility and 15% AI Overview rate means Boise is underperforming where it matters most.

2. **Service queries are invisible.** The 0% AI Overview rate for city services, government, and business queries means the city's core functions are not surfacing in AI-enhanced search.

3. **Business attraction suffers.** Companies researching Boise for relocation see zero AI Overview content about incentives, workforce, or commercial opportunities.

---

## SEO Recommendations for Problem Areas

### Transportation (52% Answer Quality) — Critical

Transportation queries are failing across all platforms. Users asking about Boise transit, roads, and transportation options aren't finding answers.

**Why it's happening:**
- ACHD (Ada County Highway District) handles roads, not the City of Boise
- Jurisdictional confusion between city/county/state transportation
- Lack of clear "Transportation in Boise" hub content

**SEO Fixes:**

1. **Create a Transportation Hub Page** on cityofboise.org
   - Title: "Getting Around Boise: Transportation Guide"
   - Include: roads (link to ACHD), airport, public transit (Valley Regional Transit), bike paths, parking
   - Target keywords: "Boise transportation", "Boise public transit", "getting around Boise"

2. **Add Structured Data**
   ```json
   {
     "@type": "FAQPage",
     "mainEntity": [
       {"@type": "Question", "name": "Does Boise have public transportation?"},
       {"@type": "Question", "name": "How do I get from Boise Airport to downtown?"},
       {"@type": "Question", "name": "Who maintains roads in Boise?"}
     ]
   }
   ```

3. **Clarify Jurisdiction**
   - Explicit content: "Roads in Boise are maintained by ACHD, not the City. Here's how to report issues..."
   - Link prominently to ACHD, Valley Regional Transit

4. **Target These Failing Queries:**
   - "Boise public transportation options"
   - "How do I get around Boise without a car"
   - "Boise airport to downtown"
   - "Report road issue Boise" (clarify ACHD handles this)

---

### Leadership (82% Answer Quality) — Moderate

Some gaps in visibility for mayor and city council queries.

**SEO Fixes:**

1. **Enhance Mayor's Page**
   - Add structured Person schema with full bio
   - Include recent news/announcements
   - Add contact information prominently

2. **City Council Directory**
   - Individual pages for each council member
   - District maps
   - Meeting schedule with Event schema
   - How to contact/attend meetings

3. **Target Keywords:**
   - "Who is the mayor of Boise"
   - "Boise city council members"
   - "Boise city council meeting schedule"

---

### City Services (88% Answer Quality) — Optimization

Already good, but can improve from 88% to 95%+.

**SEO Fixes:**

1. **Lead with Answers**
   - Current: Pages describe the service
   - Better: First sentence answers "How do I..."

2. **Add FAQ Schema** to top 10 service pages:
   - Building permits
   - Business licenses
   - Utility setup
   - Code violations
   - Police reports

3. **Include Specific Details**
   - Fees (exact amounts)
   - Processing times
   - Required documents
   - Contact phone/email

---

## What Should Boise Do?

### The 90-Day Plan

**Week 1-2: Fix Transportation (Critical)**
- [ ] Create "Getting Around Boise" transportation hub page
- [ ] Add clear ACHD/VRT jurisdiction explanations
- [ ] Add FAQPage schema for transportation queries
- [ ] Include links to airport, transit, bike paths, parking

**Week 3-4: Fix Leadership Gaps**
- [ ] Enhance mayor's bio page with Person schema
- [ ] Create/update individual city council member pages
- [ ] Add meeting schedule with Event schema
- [ ] Ensure contact information is prominent

**Month 2: Optimize City Services**
- [ ] Add FAQPage schema to top 10 service pages
- [ ] Rewrite permit pages to lead with the answer
- [ ] Add specific fees, processing times, requirements
- [ ] Create master FAQ linking all services

**Month 3: Measurement & Iteration**
- [ ] Re-run this visibility study to measure improvement
- [ ] Target: Transportation 52% → 80%
- [ ] Target: Leadership 82% → 95%
- [ ] Target: City Services 88% → 95%

---

### Specific Actions by Category

**City Services (currently 0% AI Overview)**

The 20 city service queries we tested returned zero AI Overviews. Fix this by:

1. **Building Permits Page** → Restructure to answer:
   - "How do I get a building permit in Boise?" (first sentence)
   - What types of permits exist (bulleted list)
   - Cost and timeline (specific numbers)
   - How to apply (numbered steps)

2. **Business Licenses Page** → Same pattern:
   - Lead with the direct answer
   - List requirements clearly
   - Include fees and processing time
   - Link to application

3. **Reporting Issues (potholes, streetlights, etc.)** → Make it scannable:
   - Phone number prominent
   - Online reporting link
   - What information to include
   - Expected response time

**Business Relocation (currently 0% AI Overview)**

Companies researching Boise for relocation find nothing in AI Overviews. Create:

1. **"Why Relocate to Boise" hub page** with:
   - Tax incentives (specific programs, amounts)
   - Workforce stats (education levels, unemployment rate)
   - Cost comparison vs. other Western cities
   - Success stories / companies that moved

2. **Commercial real estate overview**
3. **Talent pipeline information** (universities, training programs)

**Government Transparency (currently 0% AI Overview)**

1. **Budget page** that directly states:
   - "Boise's 2026 budget is $X million"
   - Top spending categories
   - How to access detailed budget documents

2. **City Council page** with:
   - Who represents each district
   - Meeting schedule (structured data)
   - How to attend or comment

---

### Technical Implementation

**Schema.org Markup to Add:**

```json
{
  "@type": "GovernmentOrganization",
  "name": "City of Boise",
  "areaServed": "Boise, Idaho",
  "department": [
    {"@type": "GovernmentOffice", "name": "Planning & Development"},
    {"@type": "GovernmentOffice", "name": "Public Works"}
  ]
}
```

```json
{
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "How do I get a building permit in Boise?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Submit an application through..."
    }
  }]
}
```

**Content Pattern That Works:**

```
# How to [Action] in Boise

[One sentence answer]

## What You Need
- Item 1
- Item 2

## Steps
1. Step one
2. Step two

## Cost & Timeline
- Fee: $X
- Processing: X days

## Contact
Phone: (208) XXX-XXXX
Online: [link]
```

---

### Who Should Do What

| Role | Action | Timeline |
|------|--------|----------|
| **Web Team** | Add Schema.org markup to top 20 pages | Week 1-2 |
| **Content Team** | Restructure permit/service pages | Week 2-4 |
| **Economic Dev** | Create business relocation hub | Month 2 |
| **IT** | Set up visibility monitoring | Month 1 |
| **Comms Director** | Approve content patterns, assign owners | Week 1 |

---

### Expected Impact

If Boise implements these changes:

| Category | Now | After 90 Days | Target |
|----------|-----|---------------|--------|
| Transportation | 52% | 75% | 85% |
| Leadership | 82% | 92% | 95% |
| City Services | 88% | 93% | 95% |
| **Overall Answer Quality** | **93%** | **96%** | **97%** |

**Boise is already strong at 93%.** The goal is to close the gaps in Transportation and Leadership, not to overhaul everything.

The same SEO work that improves organic search today will position Boise for AI Overviews when Google expands them to government queries.

---

## Measuring Progress

Track these metrics monthly:

| Metric | Current | 90-Day Target |
|--------|---------|---------------|
| **Overall Answer Quality** | **93%** | **96%** |
| Transportation | 52% | 80% |
| Leadership | 82% | 92% |
| City Services | 88% | 93% |
| Google Organic (all categories) | 93% | 96% |

Re-run this study after implementing changes to measure improvement.

---

## Methodology

**118 queries** tested across **5 platforms**:
- ChatGPT (web interface)
- Meta AI
- Google AI Overview (via SerpAPI)
- Google Search (via SerpAPI)
- Bing Search (via SerpAPI)

**14 categories**: City Services, Tourism, Quality of Life, Government, Business Relocation, Family Relocation, Vacation Planning, Transportation, Leadership, Healthcare, Events, Challenges, Elections, Freshness

**All 590 data points** collected and validated for accuracy.

---

## Bottom Line

**Boise's web presence is strong.** When someone searches for information about Boise—whether on Google, ChatGPT, Bing, or Meta AI—they get a useful answer 93% of the time.

**Two areas need work:**
1. **Transportation (52%)** — Create a hub page clarifying city vs. ACHD responsibilities
2. **Leadership (82%)** — Enhance mayor/council pages with structured data

**Google AI Overviews** don't appear for government service queries (this is true for all cities, not just Boise). Focus on organic search quality now; AI Overviews will follow when Google expands.

The recommended fixes are straightforward SEO improvements—structured data, clear answers, better content organization—achievable in 90 days.

---

## Sources

**Market Share Data:**
- [First Page Sage: Google vs ChatGPT Market Share 2026](https://firstpagesage.com/seo-blog/google-vs-chatgpt-market-share-report/)
- [Statcounter: AI Chatbot Market Share](https://gs.statcounter.com/ai-chatbot-market-share)
- [DemandSage: AI Chatbot Statistics 2026](https://www.demandsage.com/chatbot-statistics/)
- [One Little Web: AI Chatbots vs Search Engines Study](https://onelittleweb.com/data-studies/ai-chatbots-vs-search-engines/)

---

*Kyanos Phase Assessment | Bentham AI Visibility Pipeline*
