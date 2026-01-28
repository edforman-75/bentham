# Bentham Development TODO

## Performance Improvements
- [ ] **Run API surfaces in parallel whenever possible** - When collecting from multiple surfaces (Gemini, SerpAPI, OpenAI, etc.), run them concurrently rather than sequentially to reduce total study time
- [ ] **Run SerpAPI surfaces in parallel** - Bing Search and Google Organic can run concurrently via separate SerpAPI calls (currently sequential in run-natural-balance-bing-google-organic.ts)

## Study Execution
- [ ] Auto-detect and load API keys from .env file
- [ ] Standardize environment variable names (SERPAPI_KEY vs SERPAPI_API_KEY)
- [ ] Add retry logic for failed queries
- [ ] Resume capability for all surface types (currently only ChatGPT Web has this)

## Surface Options
- [ ] **Make both OpenAI APIs standard options** - Support both Chat Completions API and Responses API as selectable surfaces (user can choose which to include in studies)
- [ ] **Add Bing surfaces** - Bing Chat API, Bing Search with/without AI
- [ ] **Add Google Search surfaces** - Regular Google Search results vs Google AI Overview (currently via SerpAPI, consider direct scraping)

## Infrastructure
- [ ] Combine results from all surfaces into unified report
- [ ] Auto-generate comparison reports (API vs Web layer analysis)
