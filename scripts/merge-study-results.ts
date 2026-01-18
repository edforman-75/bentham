#!/usr/bin/env npx tsx
/**
 * Merge study results from multiple runs - now with 6 surfaces
 */

import * as fs from 'fs';

const original = JSON.parse(fs.readFileSync('/Users/edf/bentham/studies/todd-achilles-full-study-results.json', 'utf-8'));
const completion = JSON.parse(fs.readFileSync('/Users/edf/bentham/studies/todd-achilles-completion-results.json', 'utf-8'));
const bingCompletion = JSON.parse(fs.readFileSync('/Users/edf/bentham/studies/todd-achilles-bing-only-results.json', 'utf-8'));
const googleSearch = JSON.parse(fs.readFileSync('/Users/edf/bentham/studies/todd-achilles-google-search-results.json', 'utf-8'));

// Create merged result
const merged = {
  studyId: original.studyId,
  studyName: 'Todd Achilles Digital Presence Study - Complete (6 Surfaces)',
  candidate: original.candidate,
  timestamp: new Date().toISOString(),
  summary: {
    totalJobs: 90, // 15 queries x 6 surfaces
    completedJobs: 0,
    failedJobs: 0
  },
  bySurface: {} as Record<string, any>,
  byCategory: {} as Record<string, any>,
  jobs: [] as any[]
};

// Merge surface data - take successful data from each source
// Now includes google-search as the 6th surface
const surfaces = ['chatgpt-web', 'claude-web', 'bing-search', 'google-ai-overview', 'google-search', 'perplexity-web'];

for (const surfaceId of surfaces) {
  const origData = original.bySurface[surfaceId];
  const compData = completion.bySurface[surfaceId];
  const bingData = bingCompletion.bySurface[surfaceId];
  const googleSearchData = googleSearch.bySurface[surfaceId];

  // Use completion data for google-ai-overview and perplexity-web
  if ((surfaceId === 'google-ai-overview' || surfaceId === 'perplexity-web') && compData && compData.complete > 0) {
    merged.bySurface[surfaceId] = compData;
  } else if (surfaceId === 'bing-search' && bingData && bingData.complete > 0) {
    // Use new Bing data
    merged.bySurface[surfaceId] = bingData;
  } else if (surfaceId === 'google-search' && googleSearchData && googleSearchData.complete > 0) {
    // Use Google Search data
    merged.bySurface[surfaceId] = googleSearchData;
  } else if (origData && origData.complete > 0) {
    merged.bySurface[surfaceId] = origData;
  } else {
    merged.bySurface[surfaceId] = origData || compData || bingData || googleSearchData || { total: 0, complete: 0, failed: 0, responses: [] };
  }
}

// Merge jobs - take successful jobs from each source
const origJobsByKey = new Map<string, any>();
for (const job of original.jobs) {
  const key = `${job.surfaceId}|${job.queryIndex}`;
  origJobsByKey.set(key, job);
}

for (const job of completion.jobs) {
  const key = `${job.surfaceId}|${job.queryIndex}`;
  if (job.status === 'complete') {
    origJobsByKey.set(key, job);
  }
}

// Add new Bing jobs
for (const job of bingCompletion.jobs) {
  const key = `${job.surfaceId}|${job.queryIndex}`;
  if (job.status === 'complete') {
    origJobsByKey.set(key, job);
  }
}

// Add Google Search jobs
for (const job of googleSearch.jobs) {
  const key = `${job.surfaceId}|${job.queryIndex}`;
  if (job.status === 'complete') {
    origJobsByKey.set(key, job);
  }
}

merged.jobs = Array.from(origJobsByKey.values()).sort((a, b) => {
  if (a.surfaceId !== b.surfaceId) return a.surfaceId.localeCompare(b.surfaceId);
  return a.queryIndex - b.queryIndex;
});

// Calculate summary
merged.summary.completedJobs = merged.jobs.filter(j => j.status === 'complete').length;
merged.summary.failedJobs = merged.jobs.filter(j => j.status === 'failed').length;

// Calculate by category
const categories = ['Identity', 'Qualification', 'Position', 'Electability', 'Character'];
for (const cat of categories) {
  const catJobs = merged.jobs.filter(j => j.category === cat);
  const completed = catJobs.filter(j => j.status === 'complete');
  const avgLen = completed.length > 0
    ? completed.reduce((sum, j) => sum + (j.responseText?.length || 0), 0) / completed.length
    : 0;
  merged.byCategory[cat] = {
    total: catJobs.length,
    complete: completed.length,
    avgResponseLength: Math.round(avgLen)
  };
}

fs.writeFileSync('/Users/edf/bentham/studies/todd-achilles-complete-results.json', JSON.stringify(merged, null, 2));

console.log('Merged results saved!');
console.log('');
console.log('Total jobs:', merged.summary.totalJobs);
console.log('Completed:', merged.summary.completedJobs);
console.log('Failed:', merged.summary.failedJobs);
console.log('');
console.log('By Surface:');
for (const [id, data] of Object.entries(merged.bySurface)) {
  const d = data as any;
  console.log(`  ${id}: ${d.complete}/${d.total}`);
}
console.log('');
console.log('By Category:');
for (const [cat, data] of Object.entries(merged.byCategory)) {
  const d = data as any;
  console.log(`  ${cat}: ${d.complete}/${d.total} complete, avg ${d.avgResponseLength} chars`);
}
