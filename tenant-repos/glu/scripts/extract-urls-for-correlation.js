import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync('./studies/google/pet-food-100-study-results.json', 'utf-8'));

// Extract all AI Overview source URLs
const aiOverviewUrls = new Set();
const organicUrls = new Set();
const organicOnlyUrls = new Set();

for (const result of data.results) {
  // Collect AI Overview source URLs
  for (const src of result.aiOverviewSources || []) {
    if (src.url) aiOverviewUrls.add(src.url);
  }

  // Collect organic URLs
  for (const org of result.organicResults || []) {
    if (org.url) organicUrls.add(org.url);
  }
}

// Find URLs that appear in organic but NOT in AI Overview
for (const url of organicUrls) {
  if (!aiOverviewUrls.has(url)) {
    organicOnlyUrls.add(url);
  }
}

// Extract domains
function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

// Count by domain
const aiOverviewDomains = {};
for (const url of aiOverviewUrls) {
  const domain = getDomain(url);
  aiOverviewDomains[domain] = (aiOverviewDomains[domain] || 0) + 1;
}

const organicOnlyDomains = {};
for (const url of organicOnlyUrls) {
  const domain = getDomain(url);
  organicOnlyDomains[domain] = (organicOnlyDomains[domain] || 0) + 1;
}

console.log('=== AI Overview Source URLs ===');
console.log('Total unique URLs:', aiOverviewUrls.size);
console.log('\nTop domains cited in AI Overviews:');
const sortedAI = Object.entries(aiOverviewDomains).sort((a, b) => b[1] - a[1]);
for (const [domain, count] of sortedAI.slice(0, 25)) {
  console.log(`  ${count}x ${domain}`);
}

console.log('\n=== Organic-Only URLs (NOT in AI Overview) ===');
console.log('Total unique URLs:', organicOnlyUrls.size);
console.log('\nTop domains in organic only:');
const sortedOrg = Object.entries(organicOnlyDomains).sort((a, b) => b[1] - a[1]);
for (const [domain, count] of sortedOrg.slice(0, 25)) {
  console.log(`  ${count}x ${domain}`);
}

// Output for JSON-LD audit
console.log('\n=== Sample URLs for JSON-LD Audit ===');
console.log('\nAI Overview cited URLs (first 30):');
[...aiOverviewUrls].slice(0, 30).forEach(url => console.log(url));

console.log('\nOrganic-only URLs (first 30):');
[...organicOnlyUrls].slice(0, 30).forEach(url => console.log(url));
