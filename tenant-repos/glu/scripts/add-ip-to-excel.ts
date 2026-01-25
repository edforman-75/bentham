import XLSX from 'xlsx';

// Load existing workbook
const workbook = XLSX.readFile('studies/huft-analysis.xlsx');

// IP and location data for each study
const studyMetadata = [
  { study: 1, surface: 'ChatGPT Web', ip: 'India', prompt: 'Original', ipAddress: '103.x.x.x (Cherry Proxy Mumbai)', location: 'Mumbai, Maharashtra, India' },
  { study: 2, surface: 'ChatGPT Web', ip: 'India', prompt: 'India Suffix', ipAddress: '103.x.x.x (Cherry Proxy Mumbai)', location: 'Mumbai, Maharashtra, India' },
  { study: 3, surface: 'ChatGPT Web', ip: 'US', prompt: 'India Suffix', ipAddress: '184.183.124.126 (Cox Communications)', location: 'Sun Valley, Idaho, USA' },
  { study: 4, surface: 'Chat API', ip: 'US', prompt: 'India Suffix', ipAddress: '184.183.124.126 (Cox Communications)', location: 'Sun Valley, Idaho, USA' },
  { study: 5, surface: 'Chat API', ip: 'India', prompt: 'India Suffix', ipAddress: '103.x.x.x (Cherry Proxy Mumbai)', location: 'Mumbai, Maharashtra, India' },
  { study: 6, surface: 'Web Search API', ip: 'US', prompt: 'India Suffix', ipAddress: '184.183.124.126 (Cox Communications)', location: 'Sun Valley, Idaho, USA' },
  { study: 7, surface: 'Web Search API', ip: 'India', prompt: 'India Suffix', ipAddress: '103.x.x.x (Cherry Proxy Mumbai)', location: 'Mumbai, Maharashtra, India' },
  { study: 8, surface: 'Chat API', ip: 'US', prompt: 'Original', ipAddress: '184.183.124.126 (Cox Communications)', location: 'Sun Valley, Idaho, USA' },
  { study: 9, surface: 'Web Search API', ip: 'US', prompt: 'Original', ipAddress: '184.183.124.126 (Cox Communications)', location: 'Sun Valley, Idaho, USA' },
  { study: 10, surface: 'Chat API', ip: 'India', prompt: 'Original', ipAddress: '103.x.x.x (Cherry Proxy Mumbai)', location: 'Mumbai, Maharashtra, India' },
  { study: 11, surface: 'Web Search API', ip: 'India', prompt: 'Original', ipAddress: '103.x.x.x (Cherry Proxy Mumbai)', location: 'Mumbai, Maharashtra, India' },
  { study: 12, surface: 'ChatGPT Web', ip: 'US', prompt: 'Original', ipAddress: '184.183.124.126 (Cox Communications)', location: 'Sun Valley, Idaho, USA' },
];

// Create new Tab: Study Configuration
const configData = [
  ['Study #', 'Surface', 'IP Region', 'Prompt Type', 'IP Address / Provider', 'Geolocation', 'Date Conducted', 'Model/Endpoint']
];

for (const s of studyMetadata) {
  let endpoint = '';
  if (s.surface === 'ChatGPT Web') {
    endpoint = 'chatgpt.com (browser automation via Playwright)';
  } else if (s.surface === 'Chat API') {
    endpoint = 'api.openai.com/v1/chat/completions (gpt-4o)';
  } else if (s.surface === 'Web Search API') {
    endpoint = 'api.openai.com/v1/responses (gpt-4o + web_search tool)';
  }

  configData.push([
    s.study.toString(),
    s.surface,
    s.ip,
    s.prompt,
    s.ipAddress,
    s.location,
    'January 23-24, 2026',
    endpoint
  ]);
}

const wsConfig = XLSX.utils.aoa_to_sheet(configData);
wsConfig['!cols'] = [
  { wch: 8 },   // Study #
  { wch: 15 },  // Surface
  { wch: 10 },  // IP Region
  { wch: 12 },  // Prompt Type
  { wch: 35 },  // IP Address
  { wch: 30 },  // Geolocation
  { wch: 18 },  // Date
  { wch: 50 },  // Model/Endpoint
];

// Insert as first sheet (after removing if exists)
if (workbook.SheetNames.includes('Study Configuration')) {
  const idx = workbook.SheetNames.indexOf('Study Configuration');
  workbook.SheetNames.splice(idx, 1);
  delete workbook.Sheets['Study Configuration'];
}

// Add at beginning
workbook.SheetNames.unshift('Study Configuration');
workbook.Sheets['Study Configuration'] = wsConfig;

// Save
XLSX.writeFile(workbook, 'studies/huft-analysis.xlsx');

console.log('Added "Study Configuration" tab with IP addresses and locations');
console.log('Tab order:', workbook.SheetNames);
