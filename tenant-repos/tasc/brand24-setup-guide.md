# Brand24 Setup Guide for TASC Performance

## Quick Start

1. Go to [brand24.com](https://brand24.com) and start a 14-day free trial
2. Create projects using the configurations below
3. Wait 24-48 hours for initial data collection
4. Export CSV and import to Bentham database

---

## Project 1: TASC Brand Monitoring

### Project Name
`TASC Performance - Brand Mentions`

### Required Keywords
```
"TASC Performance"
"tasc performance"
tascperformance
@tascperformance
#tascperformance
#tasclife
```

### Product Keywords (add as separate keywords or in same project)
```
"BamCo fabric"
"tasc bamboo"
"tasc polo"
"tasc shirt"
"tasc joggers"
```

### Excluded Keywords (to filter out noise)
```
task (common misspelling confusion)
"task performance" (unrelated)
TASC test (standardized testing)
"tasc score" (testing)
```

### Recommended Sources
- Twitter/X
- Instagram
- Facebook
- Reddit
- YouTube
- TikTok
- Blogs
- News
- Forums
- Reviews

### Language
- English (primary)
- Spanish (if targeting Latin America)

---

## Project 2: Competitor Monitoring

### Project Name
`TASC Competitors - Activewear`

### Competitor Keywords

**Lululemon** (major competitor)
```
lululemon
@lululemon
#lululemon
"lululemon abc pants"
"lululemon polo"
```

**Vuori** (direct competitor - similar positioning)
```
vuori
@vuaborivuori
#vuori
"vuori pants"
"vuori shirt"
```

**Rhone** (premium men's activewear)
```
rhone apparel
@rhone
#rhone
"rhone commuter"
```

**Free Fly** (bamboo competitor)
```
"free fly apparel"
"free fly bamboo"
@freeflyapparel
```

**Cariloha** (bamboo competitor)
```
cariloha
@cariloha
"cariloha bamboo"
```

### Excluded Keywords
```
"rhone river" (geography)
"free fly fishing" (unrelated)
```

---

## Project 3: Category Monitoring

### Project Name
`Sustainable Activewear Category`

### Category Keywords
```
"bamboo athletic wear"
"bamboo activewear"
"sustainable activewear"
"eco-friendly workout clothes"
"best bamboo shirts"
"anti-odor athletic shirts"
"moisture wicking bamboo"
"sustainable golf apparel"
"eco-friendly gym clothes"
```

### Why This Matters
Captures conversations where TASC *should* be mentioned but may not be. Identifies content gaps and opportunities.

---

## Data Export Instructions

### From Brand24 Dashboard

1. Go to **Mentions** tab
2. Set date range (recommend: last 30 days initially)
3. Click **Export** button (top right)
4. Select **CSV** format
5. Choose columns:
   - Date
   - Title
   - Content/Text
   - Author
   - Source
   - URL
   - Sentiment
   - Reach
   - Likes
   - Shares
   - Comments
   - Country
   - Language

### File Naming Convention
```
brand24-tasc-brand-YYYY-MM-DD.csv
brand24-tasc-competitors-YYYY-MM-DD.csv
brand24-tasc-category-YYYY-MM-DD.csv
```

---

## Import to Bentham

### Directory Setup
```bash
mkdir -p data/brand24-exports/tasc
```

### Place CSV files
```
data/brand24-exports/tasc/
├── brand24-tasc-brand-2026-01-29.csv
├── brand24-tasc-competitors-2026-01-29.csv
└── brand24-tasc-category-2026-01-29.csv
```

### Run Import
```bash
cd /Users/edf/bentham
pnpm --filter @bentham/social-listening tasc:import-brand24 data/brand24-exports/tasc
```

### Verify Import
```bash
pnpm --filter @bentham/social-listening tasc:summary
```

---

## Recommended Alert Setup

### Critical Alerts (immediate notification)

1. **Negative Sentiment Spike**
   - Trigger: 3+ negative mentions in 1 hour
   - Action: Slack notification to customer service

2. **Influencer Mention**
   - Trigger: Mention from account with 10k+ followers
   - Action: Email to marketing team

3. **Viral Content**
   - Trigger: Single mention with 100+ engagements
   - Action: Slack notification to social team

### Daily Digest

- Summary of all mentions
- Sentiment breakdown
- Top authors
- Competitor comparison

---

## Key Metrics to Track

### Brand Health
| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Daily mentions | 50+ | Brand awareness indicator |
| Positive sentiment | >60% | Customer satisfaction |
| Share of voice vs competitors | >15% | Market position |
| Influencer mentions/week | 5+ | Organic reach |

### Engagement Quality
| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Avg reach per mention | 1000+ | Content amplification |
| Response rate to questions | >80% | Customer service |
| User-generated content | 10+/week | Brand advocacy |

---

## Integration with AI Visibility

### Correlation Analysis

Once you have both:
- Brand24 social mentions
- AI visibility results

You can analyze:

1. **Does social buzz drive AI mentions?**
   - Spike in social mentions → does AI start recommending TASC more?

2. **Which platforms correlate?**
   - Reddit discussions → Perplexity recommendations
   - YouTube reviews → ChatGPT awareness

3. **Sentiment alignment**
   - Social sentiment vs AI tone when mentioning TASC

### Query Example
```sql
-- Correlate social mentions with AI visibility
SELECT
  DATE(sm.published_at) as date,
  COUNT(DISTINCT sm.id) as social_mentions,
  AVG(CASE WHEN sm.sentiment = 'positive' THEN 1
           WHEN sm.sentiment = 'negative' THEN -1
           ELSE 0 END) as social_sentiment,
  COUNT(DISTINCT av.id) as ai_queries,
  SUM(CASE WHEN av.brand_mentioned THEN 1 ELSE 0 END) as ai_mentions
FROM social_mentions sm
FULL OUTER JOIN ai_visibility_results av
  ON DATE(sm.published_at) = DATE(av.executed_at)
WHERE sm.published_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(sm.published_at)
ORDER BY date;
```

---

## Cost Estimate

### Brand24 Team Plan ($149/month annual)
- 7 keywords → covers 1 main project
- 5,000 mentions/month → sufficient for TASC volume
- Hourly updates

### Recommended: Pro Plan ($199/month annual)
- 12 keywords → covers brand + competitors
- 25,000 mentions/month → room for growth
- Real-time updates
- AI reports

### Partner Program
If Bentham becomes a Brand24 partner:
- 20-30% recurring commission
- Could offset cost for TASC or offer as value-add

---

## Support Contacts

**Brand24**
- Help Center: help.brand24.com
- Email: support@brand24.com

**Bentham Integration**
- Import issues: Check CSV column mapping in `brand24-importer.ts`
- Database: `tasc-analytics` on Neon

---

## Checklist

- [ ] Create Brand24 account (trial or paid)
- [ ] Set up Project 1: TASC Brand Monitoring
- [ ] Set up Project 2: Competitor Monitoring
- [ ] Set up Project 3: Category Monitoring
- [ ] Configure alerts
- [ ] Wait 24-48 hours for data collection
- [ ] Export first CSV
- [ ] Import to Bentham database
- [ ] Verify data in dashboard
- [ ] Schedule weekly exports (or set up API when available)
