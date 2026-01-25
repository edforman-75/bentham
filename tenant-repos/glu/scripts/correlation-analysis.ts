import * as fs from 'fs';

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

function analyzeResponse(response: string) {
  const huftMatches = (response.match(/huft|heads up for tails/gi) || []);
  const mentionCount = huftMatches.length;
  const mentionRating = Math.min(10, mentionCount * 2);

  const lower = response.toLowerCase();
  const first300 = lower.substring(0, 300);
  const first500 = lower.substring(0, 500);
  const first1000 = lower.substring(0, 1000);
  let prominenceRating = 0;
  if (first300.includes('huft') || first300.includes('heads up for tails')) {
    prominenceRating = 10;
  } else if (first500.includes('huft') || first500.includes('heads up for tails')) {
    prominenceRating = 8;
  } else if (first1000.includes('huft') || first1000.includes('heads up for tails')) {
    prominenceRating = 5;
  } else if (mentionCount > 0) {
    prominenceRating = 2;
  }

  const overallScore = mentionRating + prominenceRating;
  const hasHuft = mentionCount > 0 ? 1 : 0;

  return { mentionCount, mentionRating, prominenceRating, overallScore, hasHuft };
}

// Build matrix: studyNum -> queryIndex -> scores
const matrix: Map<number, Map<number, any>> = new Map();

for (const study of studies) {
  const data = JSON.parse(fs.readFileSync(study.file, 'utf-8'));
  const queryMap = new Map();

  for (const r of data.results) {
    const analysis = analyzeResponse(r.response);
    queryMap.set(r.queryIndex, analysis);
  }
  matrix.set(study.num, queryMap);
}

// Calculate Pearson correlation
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
}

// Get Study 2 scores
const study2Scores = matrix.get(2)!;
const study2Mention: number[] = [];
const study2Overall: number[] = [];
const study2HasHuft: number[] = [];

for (let q = 1; q <= 20; q++) {
  const s = study2Scores.get(q);
  study2Mention.push(s.mentionRating);
  study2Overall.push(s.overallScore);
  study2HasHuft.push(s.hasHuft);
}

console.log('='.repeat(90));
console.log('CORRELATION ANALYSIS: Can any surface predict Study 2 (ChatGPT Web - India IP - India Suffix)?');
console.log('='.repeat(90));
console.log('');

// Calculate correlations with each other study
const correlations: any[] = [];

for (const study of studies) {
  if (study.num === 2) continue;

  const scores = matrix.get(study.num)!;
  const mention: number[] = [];
  const overall: number[] = [];
  const hasHuft: number[] = [];

  for (let q = 1; q <= 20; q++) {
    const s = scores.get(q);
    mention.push(s.mentionRating);
    overall.push(s.overallScore);
    hasHuft.push(s.hasHuft);
  }

  const corrMention = pearsonCorrelation(study2Mention, mention);
  const corrOverall = pearsonCorrelation(study2Overall, overall);
  const corrHasHuft = pearsonCorrelation(study2HasHuft, hasHuft);

  correlations.push({
    num: study.num,
    surface: study.surface,
    ip: study.ip,
    prompt: study.prompt,
    corrMention: Math.round(corrMention * 100) / 100,
    corrOverall: Math.round(corrOverall * 100) / 100,
    corrHasHuft: Math.round(corrHasHuft * 100) / 100,
    avgCorr: Math.round((corrMention + corrOverall + corrHasHuft) / 3 * 100) / 100
  });
}

// Sort by average correlation
correlations.sort((a, b) => b.avgCorr - a.avgCorr);

console.log('CORRELATIONS WITH STUDY 2 (sorted by average correlation):');
console.log('-'.repeat(90));
console.log('Study | Surface        | IP    | Prompt       | Mention | Overall | HasHUFT | Avg Corr');
console.log('-'.repeat(90));

for (const c of correlations) {
  console.log(
    String(c.num).padEnd(5) + ' | ' +
    c.surface.padEnd(14) + ' | ' +
    c.ip.padEnd(5) + ' | ' +
    c.prompt.padEnd(12) + ' | ' +
    String(c.corrMention).padStart(7) + ' | ' +
    String(c.corrOverall).padStart(7) + ' | ' +
    String(c.corrHasHuft).padStart(7) + ' | ' +
    String(c.avgCorr).padStart(8)
  );
}

console.log('');
console.log('='.repeat(90));
console.log('INTERPRETATION:');
console.log('='.repeat(90));
console.log('');
console.log('Correlation strength: 0.7+ = strong, 0.4-0.7 = moderate, <0.4 = weak');
console.log('');

const bestPredictor = correlations[0];
const bestAPI = correlations.find(c => c.surface !== 'ChatGPT Web');

console.log('Best overall predictor: Study ' + bestPredictor.num + ' (' + bestPredictor.surface + ' - ' + bestPredictor.ip + ' - ' + bestPredictor.prompt + ')');
console.log('  Average correlation: ' + bestPredictor.avgCorr);
console.log('');
if (bestAPI) {
  console.log('Best API predictor: Study ' + bestAPI.num + ' (' + bestAPI.surface + ' - ' + bestAPI.ip + ' - ' + bestAPI.prompt + ')');
  console.log('  Average correlation: ' + bestAPI.avgCorr);
}

// Query-by-query analysis
console.log('');
console.log('='.repeat(90));
console.log('QUERY-BY-QUERY: Which queries show HUFT in Study 2 vs each surface?');
console.log('='.repeat(90));
console.log('');

// Create a matrix showing HUFT presence across all studies for each query
console.log('Query | S1  S2  S3  S4  S5  S6  S7  S8  S9  S10 S11 S12 | Description');
console.log('-'.repeat(100));

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

for (let q = 1; q <= 20; q++) {
  let row = String(q).padStart(2) + '    |';
  for (const study of studies) {
    const scores = matrix.get(study.num)!;
    const s = scores.get(q);
    row += s.hasHuft ? '  Y ' : '  - ';
  }
  row += '| ' + queries[q-1];
  console.log(row);
}

console.log('');
console.log('Legend: Y = HUFT mentioned, - = No HUFT mention');
console.log('');

// Calculate match rates for APIs vs Study 2
console.log('='.repeat(90));
console.log('MATCH RATES: How often does each surface agree with Study 2 on HUFT presence?');
console.log('='.repeat(90));
console.log('');

for (const study of studies) {
  if (study.num === 2) continue;

  const scores = matrix.get(study.num)!;
  let matches = 0;
  let bothYes = 0;
  let bothNo = 0;
  let s2YesOtherNo = 0;
  let s2NoOtherYes = 0;

  for (let q = 1; q <= 20; q++) {
    const s2 = study2Scores.get(q);
    const other = scores.get(q);

    if (s2.hasHuft === other.hasHuft) {
      matches++;
      if (s2.hasHuft) bothYes++;
      else bothNo++;
    } else if (s2.hasHuft && !other.hasHuft) {
      s2YesOtherNo++;
    } else {
      s2NoOtherYes++;
    }
  }

  console.log('Study ' + study.num + ' (' + study.surface + ' - ' + study.ip + ' - ' + study.prompt + ')');
  console.log('  Match rate: ' + matches + '/20 (' + Math.round(matches/20*100) + '%)');
  console.log('  Both mention HUFT: ' + bothYes + ' | Both no HUFT: ' + bothNo);
  console.log('  Study 2 has HUFT but this doesnt: ' + s2YesOtherNo + ' | This has HUFT but Study 2 doesnt: ' + s2NoOtherYes);
  console.log('');
}
