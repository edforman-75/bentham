import * as fs from 'fs';
import XLSX from 'xlsx';

// Load existing workbook
const workbook = XLSX.readFile('studies/huft-analysis.xlsx');

// Load all study data to extract sources
const studies = [
  { num: 1, file: 'studies/study1-india-ip-original.json', surface: 'ChatGPT Web', ip: 'India', prompt: 'Original' },
  { num: 2, file: 'studies/study2-india-ip-indiasuffix.json', surface: 'ChatGPT Web', ip: 'India', prompt: 'India Suffix' },
  { num: 3, file: 'studies/study3-us-ip-indiasuffix.json', surface: 'ChatGPT Web', ip: 'US', prompt: 'India Suffix' },
  { num: 4, file: 'studies/study4-chat-api-us-india-suffix.json', surface: 'Chat API', ip: 'US', prompt: 'India Suffix' },
  { num: 5, file: 'studies/study5-chat-api-india-proxy-india-suffix.json', surface: 'Chat API', ip: 'India', prompt: 'India Suffix' },
  { num: 6, file: 'studies/study6-websearch-api-us-india-suffix.json', surface: 'Web Search API', ip: 'US', prompt: 'India Suffix' },
  { num: 7, file: 'studies/study7-websearch-api-india-proxy-india-suffix.json', surface: 'Web Search API', ip: 'India', prompt: 'India Suffix' },
  { num: 8, file: 'studies/study8-chat-api-us-original.json', surface: 'Chat API', ip: 'US', prompt: 'Original' },
  { num: 9, file: 'studies/study9-websearch-api-us-original.json', surface: 'Web Search API', ip: 'US', prompt: 'Original' },
  { num: 10, file: 'studies/study10-chat-api-india-original.json', surface: 'Chat API', ip: 'India', prompt: 'Original' },
  { num: 11, file: 'studies/study11-websearch-api-india-original.json', surface: 'Web Search API', ip: 'India', prompt: 'Original' },
  { num: 12, file: 'studies/study12-chatgpt-web-us-original.json', surface: 'ChatGPT Web', ip: 'US', prompt: 'Original' },
];

const queries = [
  "Best budget dog food brands",
  "Best treat brands for dogs",
  "Dog food brands high reviews",
  "Dog food recommended by vets",
  "Pet food brand good meat",
  "Gluten-free dog treats",
  "Dog biscuits sensitive stomachs",
  "Vegetarian dog biscuits",
  "Treat brands under Rs1000",
  "Low-calorie chicken treats",
  "Dog treats medium-sized dogs",
  "Heads Up For Tails options",
  "Gluten-free chicken biscuits",
  "Healthy treats for puppies",
  "Crunchy biscuits adult dogs",
  "Comfortable dog beds small dogs",
  "Interactive toys large dogs",
  "Chew toys small dogs",
  "Dog harnesses for puppies",
  "Indian brands wet cat food"
];

// Extract domains from response text
function extractDomains(response: string): string[] {
  const urlRegex = /https?:\/\/([a-zA-Z0-9.-]+)/g;
  const domains = new Set<string>();
  let match;
  while ((match = urlRegex.exec(response)) !== null) {
    domains.add(match[1].replace(/^www\./, ''));
  }
  return Array.from(domains);
}

// Check for HUFT mention
function hasHuft(response: string): boolean {
  return /huft|heads up for tails/i.test(response);
}

// Build source influence data
interface InfluenceRow {
  study: number;
  surface: string;
  ip: string;
  prompt: string;
  query: string;
  queryIndex: number;
  hasHuft: string;
  domains: string;
  hasAmazon: string;
  hasHeadsupfortails: string;
  hasZigly: string;
  hasSupertails: string;
  hasPetsy: string;
}

const influenceData: InfluenceRow[] = [];

// Domain frequency counters
const domainCounts: Map<string, number> = new Map();
const domainWithHuft: Map<string, number> = new Map();
const domainWithoutHuft: Map<string, number> = new Map();

for (const study of studies) {
  const data = JSON.parse(fs.readFileSync(study.file, 'utf-8'));

  for (const r of data.results) {
    const domains = extractDomains(r.response);
    const huftPresent = hasHuft(r.response);

    // Count domains
    for (const domain of domains) {
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      if (huftPresent) {
        domainWithHuft.set(domain, (domainWithHuft.get(domain) || 0) + 1);
      } else {
        domainWithoutHuft.set(domain, (domainWithoutHuft.get(domain) || 0) + 1);
      }
    }

    influenceData.push({
      study: study.num,
      surface: study.surface,
      ip: study.ip,
      prompt: study.prompt,
      query: queries[r.queryIndex - 1],
      queryIndex: r.queryIndex,
      hasHuft: huftPresent ? 'Yes' : 'No',
      domains: domains.join(', '),
      hasAmazon: domains.some(d => d.includes('amazon')) ? 'Yes' : 'No',
      hasHeadsupfortails: domains.some(d => d.includes('headsupfortails')) ? 'Yes' : 'No',
      hasZigly: domains.some(d => d.includes('zigly')) ? 'Yes' : 'No',
      hasSupertails: domains.some(d => d.includes('supertails')) ? 'Yes' : 'No',
      hasPetsy: domains.some(d => d.includes('petsy')) ? 'Yes' : 'No',
    });
  }
}

// Create Tab 3: Source Influence Detail
const tab3Data = [
  ['Study', 'Surface', 'IP', 'Prompt', 'Query #', 'Query', 'HUFT Present', 'Amazon.in', 'headsupfortails.com', 'zigly.com', 'supertails.com', 'petsy.in', 'All Domains Cited']
];

for (const row of influenceData) {
  tab3Data.push([
    row.study.toString(),
    row.surface,
    row.ip,
    row.prompt,
    row.queryIndex.toString(),
    row.query,
    row.hasHuft,
    row.hasAmazon,
    row.hasHeadsupfortails,
    row.hasZigly,
    row.hasSupertails,
    row.hasPetsy,
    row.domains
  ]);
}

const ws3 = XLSX.utils.aoa_to_sheet(tab3Data);

// Set column widths
ws3['!cols'] = [
  { wch: 6 },   // Study
  { wch: 15 },  // Surface
  { wch: 6 },   // IP
  { wch: 12 }, // Prompt
  { wch: 8 },   // Query #
  { wch: 35 },  // Query
  { wch: 12 }, // HUFT Present
  { wch: 10 }, // Amazon
  { wch: 18 }, // headsupfortails
  { wch: 10 }, // zigly
  { wch: 12 }, // supertails
  { wch: 10 }, // petsy
  { wch: 80 }, // All Domains
];

XLSX.utils.book_append_sheet(workbook, ws3, 'Source Influence');

// Create Tab 4: Source Summary by Surface
const surfaceSummary: any[] = [
  ['Surface', 'IP', 'Prompt', 'Total Responses', 'Responses with Sources', 'Avg Domains/Response', 'Amazon.in Count', 'headsupfortails.com Count', 'zigly.com Count', 'supertails.com Count', 'HUFT When Amazon Present', 'HUFT When headsupfortails Present']
];

// Group by surface config
const surfaceGroups = new Map<string, InfluenceRow[]>();
for (const row of influenceData) {
  const key = `${row.surface}|${row.ip}|${row.prompt}`;
  if (!surfaceGroups.has(key)) surfaceGroups.set(key, []);
  surfaceGroups.get(key)!.push(row);
}

for (const [key, rows] of surfaceGroups) {
  const [surface, ip, prompt] = key.split('|');
  const withSources = rows.filter(r => r.domains.length > 0).length;
  const totalDomains = rows.reduce((sum, r) => sum + (r.domains ? r.domains.split(', ').filter(d => d).length : 0), 0);
  const amazonCount = rows.filter(r => r.hasAmazon === 'Yes').length;
  const huftCount = rows.filter(r => r.hasHeadsupfortails === 'Yes').length;
  const ziglyCount = rows.filter(r => r.hasZigly === 'Yes').length;
  const supertailsCount = rows.filter(r => r.hasSupertails === 'Yes').length;

  const amazonWithHuft = rows.filter(r => r.hasAmazon === 'Yes' && r.hasHuft === 'Yes').length;
  const huftSiteWithHuft = rows.filter(r => r.hasHeadsupfortails === 'Yes' && r.hasHuft === 'Yes').length;

  surfaceSummary.push([
    surface,
    ip,
    prompt,
    rows.length,
    withSources,
    withSources > 0 ? (totalDomains / rows.length).toFixed(1) : '0',
    amazonCount,
    huftCount,
    ziglyCount,
    supertailsCount,
    amazonCount > 0 ? `${amazonWithHuft}/${amazonCount} (${Math.round(amazonWithHuft/amazonCount*100)}%)` : 'N/A',
    huftCount > 0 ? `${huftSiteWithHuft}/${huftCount} (${Math.round(huftSiteWithHuft/huftCount*100)}%)` : 'N/A'
  ]);
}

const ws4 = XLSX.utils.aoa_to_sheet(surfaceSummary);
ws4['!cols'] = [
  { wch: 15 }, { wch: 6 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 18 },
  { wch: 15 }, { wch: 22 }, { wch: 15 }, { wch: 18 }, { wch: 22 }, { wch: 28 }
];

XLSX.utils.book_append_sheet(workbook, ws4, 'Source Summary');

// Save
XLSX.writeFile(workbook, 'studies/huft-analysis.xlsx');

console.log('Added Tab 3 (Source Influence) and Tab 4 (Source Summary) to Excel file');

// Print top domains
console.log('\n=== Top Domains by Frequency ===');
const sortedDomains = Array.from(domainCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

for (const [domain, count] of sortedDomains) {
  const withHuft = domainWithHuft.get(domain) || 0;
  const pct = Math.round(withHuft / count * 100);
  console.log(`${domain}: ${count} appearances, ${withHuft} with HUFT (${pct}%)`);
}
