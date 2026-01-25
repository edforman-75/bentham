**To:** Ranjan, [Team]

**Subject:** HUFT AI Visibility Study - Can APIs Measure Web Presence Improvements?

---

Hi Ranjan,

Following up on your research into AI recommendations in the Indian pet products market, we've completed a study that addresses a critical methodological question:

**If HUFT invests in improving their web presence, can we use OpenAI's APIs to measure whether those improvements translate to better AI visibility? Or must we test on the actual ChatGPT Web interface?**

The full report, verbatim responses (240 total), and analysis are attached.

## The Core Finding

**APIs cannot reliably predict ChatGPT Web behavior.**

| Comparison | Correlation | Match Rate |
|------------|-------------|------------|
| ChatGPT Web (India) vs Chat API (India) | 0.35 | 50% |
| ChatGPT Web (India) vs Web Search API (India) | 0.07 | 40% |

The best API predictor achieves only 0.49 correlation with ChatGPT Web results. This means:

* Testing HUFT visibility via APIs will **not** reveal how the brand performs for actual ChatGPT users
* Improvements measured on APIs may not reflect improvements on the consumer web surface
* **The web surface is the valid measurement target**, not APIs

## Why This Matters

HUFT appears in **75% of ChatGPT Web responses** from India, but only **15-35% of API responses**. Same queries, same model family, dramatically different HUFT visibility.

If we used APIs to measure HUFT's AI presence, we would conclude the brand is nearly invisible. But Indian consumers using ChatGPT directly see HUFT recommended frequently.

## Implications for Measurement Strategy

1. **Web presence improvements should be measured on the web surface** - API testing is not a valid proxy
2. **Automated monitoring is harder** - APIs are easy to query programmatically; ChatGPT Web requires browser automation and is subject to rate limits
3. **The surfaces serve different use cases** - ChatGPT Web reflects consumer experience; APIs reflect what third-party applications see

## Secondary Findings

* IP location matters on ChatGPT Web (India IP: 70+ mentions, US IP: 31-50 mentions) but not on APIs
* HUFT has strong AI associations with treats/accessories but weak presence in core dog food recommendations
* When headsupfortails.com is cited as a source, HUFT appears 100% of the time

## Cost Considerations

For context on ongoing monitoring costs (per 1,000 queries):

| Surface | India IP | US IP |
|---------|----------|-------|
| Chat API | $28.50 | $3.50 |
| Web Search API | $60.00 | $35.00 |
| ChatGPT Web | $45.00 | $20.00 |

This 12-study, 240-query analysis cost approximately **$7.68** total. The cheapest option (Chat API at $3.50/1K) unfortunately provides the least valid HUFT visibility measurement. Valid consumer-experience testing via ChatGPT Web requires browser automation and costs $20-45/1K depending on whether India IP proxy is needed.

## Attachments

1. **huft-visibility-study-report.md** - Full study report including detailed methodology (IP addresses, endpoints, automation approach), complete findings, and recommendations

2. **huft-analysis.xlsx** - All underlying data across 6 tabs:
   * Study Configuration - IP addresses, geolocations, endpoints for each of 12 studies
   * Summary - Aggregated scores by surface
   * Verbatims - All 240 responses with individual ratings
   * Source Influence - Query-level source citations
   * Source Summary - Aggregated source statistics by surface
   * Cost Analysis - Per-1000 costs and actual study costs by surface

---

Happy to discuss the measurement implications or explore how to build a valid monitoring approach for HUFT's web presence improvements.

Best,
[Bentham Research]
