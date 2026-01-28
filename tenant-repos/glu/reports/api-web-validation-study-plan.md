# API vs Web Surface Validation Study Plan

## Problem Statement

Our conclusions about API vs web surface divergence are based on a single study:
- **Category:** Pet food/products
- **Geography:** India
- **Sample:** 100 queries

We found:
- ChatGPT Web adds +83 HUFT brand mentions vs OpenAI API
- Google AI Overview reduces brand mentions by ~97% vs Gemini API

**Risk:** These patterns may be specific to pet food in India. If we generalize and we're wrong, our positioning advice is flawed.

---

## Proposed Validation Studies

### Study Selection Criteria

To validate generalizability, we need categories that vary on:
1. **Geography** - US, UK, other markets (not just India)
2. **Purchase type** - B2C vs B2B
3. **Consideration level** - Everyday vs high-stakes
4. **Brand landscape** - Fragmented vs consolidated

### Recommended Categories

| Category | Geography | Type | Consideration | Why This Category |
|----------|-----------|------|---------------|-------------------|
| **CRM Software** | US | B2B | High | Enterprise SaaS, clear brand leaders (Salesforce, HubSpot) |
| **Personal Injury Lawyers** | US | B2C Services | High | Local services, fragmented market, heavy Google presence |
| **Mattresses** | US | B2C Products | Medium | DTC brands vs legacy, heavily marketed category |
| **Pet Food** | US | B2C Products | Low | Direct comparison to India study—same vertical, different geo |

### Study Design (Per Category)

Each study follows identical methodology:

| Surface | Method | Queries | Location |
|---------|--------|---------|----------|
| OpenAI API (GPT-4o) | Direct API call | 100 | N/A (no geo) |
| ChatGPT Web | Browser automation or manual | 100 | US IP via proxy |
| Gemini API | Direct API call | 100 | N/A (no geo) |
| Google AI Overview | SerpAPI | 100 | US location param |

### Query Design Principles

For each category, queries should cover:
- **Best-of queries**: "best [category] 2026", "top [category]"
- **Comparison queries**: "[brand A] vs [brand B]"
- **Feature queries**: "[category] with [feature]"
- **Problem queries**: "how to [solve problem with category]"
- **Local queries** (where applicable): "[category] in [city]"

---

## Specific Query Sets

### 1. CRM Software (US, B2B)

**Tracked brands:** Salesforce, HubSpot, Zoho, Pipedrive, Monday, Freshsales, Copper, Insightly, Nimble, Close

**Sample queries:**
- best crm software for small business
- salesforce vs hubspot
- crm with email automation
- best free crm 2026
- crm for real estate agents
- hubspot vs zoho crm
- how to choose a crm
- crm with lead scoring
- best crm for startups
- enterprise crm comparison

### 2. Personal Injury Lawyers (US, B2C Services)

**Tracked brands:** Morgan & Morgan, Cellino & Barnes (legacy), local firm names, national chains

**Sample queries:**
- best personal injury lawyer near me
- car accident attorney
- how to find a good injury lawyer
- personal injury lawyer contingency fee
- slip and fall attorney
- medical malpractice lawyer
- wrongful death attorney
- injury lawyer free consultation
- how much do injury lawyers charge
- when to hire a personal injury lawyer

### 3. Mattresses (US, B2C Products)

**Tracked brands:** Casper, Purple, Tempur-Pedic, Saatva, Nectar, Helix, Leesa, Brooklyn Bedding, Bear, Tuft & Needle

**Sample queries:**
- best mattress 2026
- casper vs purple mattress
- best mattress for back pain
- memory foam vs hybrid mattress
- best mattress for side sleepers
- tempur-pedic reviews
- mattress in a box comparison
- best cooling mattress
- luxury mattress brands
- how to choose a mattress

### 4. Pet Food (US) - Control Study

**Same brands as India study:** Royal Canin, Pedigree, Drools, Farmina, HUFT, Supertails, Blue Buffalo, Purina, Hill's, Wellness

**Same query set as India study** - enables direct geo comparison

---

## Hypotheses to Test

### H1: ChatGPT Web Layer Behavior
- **Null:** ChatGPT Web adds brand mentions across all categories (not India-specific)
- **Alternative:** ChatGPT Web augmentation is geography or category-specific

### H2: Google AI Overview Behavior
- **Null:** Google AI Overviews are consistently more conservative than Gemini API
- **Alternative:** The reduction pattern is category or geography-specific

### H3: Brand Locality Effect
- **Null:** Web layers boost local/regional brands in their home markets
- **Alternative:** The India locality boost for HUFT was coincidental

### H4: B2B vs B2C Difference
- **Null:** API vs web divergence patterns are similar for B2B and B2C
- **Alternative:** B2B categories show different augmentation patterns

---

## Success Criteria

The validation is successful if we can answer:

1. **Does ChatGPT Web consistently add brand mentions vs API?**
   - If yes across categories: Our "foundation floor" positioning is valid
   - If no: Need to qualify by category

2. **Does Google AI Overview consistently reduce brand mentions vs Gemini API?**
   - If yes: Our "upper bound" positioning for Google is valid
   - If no: Need to understand when/why it differs

3. **Is the India locality effect generalizable?**
   - Do US brands get boosted in US queries on ChatGPT Web?
   - If yes: Web layer systematically localizes
   - If no: India was special case

---

## Timeline and Resources

| Phase | Duration | Output |
|-------|----------|--------|
| Query set development | 2 days | 400 queries (100 per category) |
| API data collection | 1 day | OpenAI + Gemini API results |
| ChatGPT Web collection | 2 days | Manual or automated browser |
| Google AI Overview collection | 1 day | SerpAPI batch run |
| Analysis | 2 days | Brand mention comparison |
| Report | 1 day | Validation findings document |

**Total: ~9 days**

---

## Decision Point

After validation studies complete:

| Finding | Implication for GLU/GEO |
|---------|------------------------|
| Patterns hold across categories | Proceed with "Foundation Model Visibility" positioning |
| Patterns vary significantly | Qualify positioning by category; may need category-specific products |
| ChatGPT boost doesn't generalize | Re-evaluate "floor" messaging for ChatGPT |
| Google reduction doesn't generalize | Re-evaluate "upper bound" messaging for Google |

---

## Recommended Priority

Given the two-week launch timeline:

1. **Immediate (before launch):** Run US Pet Food study as direct comparison to India
2. **Week of launch:** Run CRM Software study (different vertical, same methodology)
3. **Post-launch:** Run remaining studies to build evidence base

This gives us at least one validation point before launch while not blocking the timeline entirely.
