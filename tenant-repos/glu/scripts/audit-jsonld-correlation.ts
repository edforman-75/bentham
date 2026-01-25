#!/usr/bin/env npx tsx
/**
 * JSON-LD Correlation Audit
 *
 * Audits JSON-LD presence on sites cited in AI Overviews vs organic-only sites
 * to determine if there's a correlation.
 */

import 'dotenv/config';
import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('./studies/google/pet-food-100-study-results.json', 'utf-8'));

interface AuditResult {
  url: string;
  domain: string;
  group: 'ai_overview_cited' | 'organic_only';
  httpStatus: number | null;
  hasJsonLd: boolean;
  jsonLdTypes: string[];
  hasProductSchema: boolean;
  hasFaqSchema: boolean;
  hasOrganizationSchema: boolean;
  hasBreadcrumbSchema: boolean;
  hasAggregateRating: boolean;
  error?: string;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function auditUrl(url: string, group: 'ai_overview_cited' | 'organic_only'): Promise<AuditResult> {
  const domain = getDomain(url);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    clearTimeout(timeout);

    const html = await response.text();

    // Extract JSON-LD
    const jsonLdMatches = [...html.matchAll(/<script[^>]*type=["\']application\/ld\+json["\'][^>]*>([\s\S]*?)<\/script>/gi)];

    let allTypes: string[] = [];
    let hasProduct = false;
    let hasFaq = false;
    let hasOrganization = false;
    let hasBreadcrumb = false;
    let hasRating = false;

    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match[1].trim();
        const parsed = JSON.parse(jsonContent);

        // Handle arrays of schemas
        const schemas = Array.isArray(parsed) ? parsed : [parsed];

        for (const schema of schemas) {
          const schemaType = schema['@type'];
          if (schemaType) {
            const types = Array.isArray(schemaType) ? schemaType : [schemaType];
            allTypes.push(...types);

            if (types.includes('Product')) hasProduct = true;
            if (types.includes('FAQPage')) hasFaq = true;
            if (types.includes('Organization')) hasOrganization = true;
            if (types.includes('BreadcrumbList')) hasBreadcrumb = true;
            if (types.includes('AggregateRating')) hasRating = true;
          }

          // Check nested aggregateRating
          if (schema.aggregateRating) hasRating = true;

          // Check @graph
          if (schema['@graph']) {
            for (const item of schema['@graph']) {
              const itemType = item['@type'];
              if (itemType) {
                const types = Array.isArray(itemType) ? itemType : [itemType];
                allTypes.push(...types);
                if (types.includes('Product')) hasProduct = true;
                if (types.includes('FAQPage')) hasFaq = true;
                if (types.includes('Organization')) hasOrganization = true;
                if (types.includes('BreadcrumbList')) hasBreadcrumb = true;
                if (types.includes('AggregateRating')) hasRating = true;
                if (item.aggregateRating) hasRating = true;
              }
            }
          }
        }
      } catch (e) {
        // Invalid JSON-LD
      }
    }

    return {
      url,
      domain,
      group,
      httpStatus: response.status,
      hasJsonLd: jsonLdMatches.length > 0,
      jsonLdTypes: [...new Set(allTypes)],
      hasProductSchema: hasProduct,
      hasFaqSchema: hasFaq,
      hasOrganizationSchema: hasOrganization,
      hasBreadcrumbSchema: hasBreadcrumb,
      hasAggregateRating: hasRating
    };

  } catch (error) {
    return {
      url,
      domain,
      group,
      httpStatus: null,
      hasJsonLd: false,
      jsonLdTypes: [],
      hasProductSchema: false,
      hasFaqSchema: false,
      hasOrganizationSchema: false,
      hasBreadcrumbSchema: false,
      hasAggregateRating: false,
      error: String(error)
    };
  }
}

async function main() {
  // Collect all URLs
  const aiOverviewUrls = new Map<string, string>(); // domain -> url
  const organicUrls = new Map<string, string>(); // domain -> url

  for (const result of data.results) {
    for (const src of result.aiOverviewSources || []) {
      if (src.url) {
        const domain = getDomain(src.url);
        if (!aiOverviewUrls.has(domain)) {
          aiOverviewUrls.set(domain, src.url);
        }
      }
    }

    for (const org of result.organicResults || []) {
      if (org.url) {
        const domain = getDomain(org.url);
        if (!organicUrls.has(domain)) {
          organicUrls.set(domain, org.url);
        }
      }
    }
  }

  // Find organic-only domains
  const organicOnlyDomains = new Map<string, string>();
  for (const [domain, url] of organicUrls) {
    if (!aiOverviewUrls.has(domain)) {
      organicOnlyDomains.set(domain, url);
    }
  }

  console.log(`\n=== JSON-LD Correlation Audit ===`);
  console.log(`AI Overview cited domains: ${aiOverviewUrls.size}`);
  console.log(`Organic-only domains: ${organicOnlyDomains.size}`);

  // Sample URLs for audit (max 40 from each group for reasonable runtime)
  const aiSample = [...aiOverviewUrls.entries()].slice(0, 40);
  const orgSample = [...organicOnlyDomains.entries()].slice(0, 40);

  console.log(`\nAuditing ${aiSample.length} AI Overview cited sites...`);

  const aiResults: AuditResult[] = [];
  for (let i = 0; i < aiSample.length; i++) {
    const [domain, url] = aiSample[i];
    process.stdout.write(`  [${i + 1}/${aiSample.length}] ${domain}... `);
    const result = await auditUrl(url, 'ai_overview_cited');
    aiResults.push(result);
    console.log(result.hasJsonLd ? `✓ JSON-LD (${result.jsonLdTypes.join(', ')})` : '✗ No JSON-LD');
    await sleep(500);
  }

  console.log(`\nAuditing ${orgSample.length} organic-only sites...`);

  const orgResults: AuditResult[] = [];
  for (let i = 0; i < orgSample.length; i++) {
    const [domain, url] = orgSample[i];
    process.stdout.write(`  [${i + 1}/${orgSample.length}] ${domain}... `);
    const result = await auditUrl(url, 'organic_only');
    orgResults.push(result);
    console.log(result.hasJsonLd ? `✓ JSON-LD (${result.jsonLdTypes.join(', ')})` : '✗ No JSON-LD');
    await sleep(500);
  }

  // Analysis
  const allResults = [...aiResults, ...orgResults];

  // Filter out errors
  const validAI = aiResults.filter(r => r.httpStatus !== null);
  const validOrg = orgResults.filter(r => r.httpStatus !== null);

  const aiWithJsonLd = validAI.filter(r => r.hasJsonLd).length;
  const orgWithJsonLd = validOrg.filter(r => r.hasJsonLd).length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== CORRELATION ANALYSIS RESULTS ===`);
  console.log(`${'='.repeat(60)}`);

  console.log(`\n--- Sample Sizes ---`);
  console.log(`AI Overview cited sites (valid responses): ${validAI.length}`);
  console.log(`Organic-only sites (valid responses): ${validOrg.length}`);

  console.log(`\n--- JSON-LD Presence ---`);
  console.log(`AI Overview cited sites with JSON-LD: ${aiWithJsonLd}/${validAI.length} (${(aiWithJsonLd/validAI.length*100).toFixed(1)}%)`);
  console.log(`Organic-only sites with JSON-LD: ${orgWithJsonLd}/${validOrg.length} (${(orgWithJsonLd/validOrg.length*100).toFixed(1)}%)`);

  // Chi-square calculation
  const a = aiWithJsonLd; // AI cited + has JSON-LD
  const b = validAI.length - aiWithJsonLd; // AI cited + no JSON-LD
  const c = orgWithJsonLd; // organic only + has JSON-LD
  const d = validOrg.length - orgWithJsonLd; // organic only + no JSON-LD

  const n = a + b + c + d;
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const col2 = b + d;

  // Expected values
  const e_a = (row1 * col1) / n;
  const e_b = (row1 * col2) / n;
  const e_c = (row2 * col1) / n;
  const e_d = (row2 * col2) / n;

  // Chi-square statistic
  const chiSquare =
    Math.pow(a - e_a, 2) / e_a +
    Math.pow(b - e_b, 2) / e_b +
    Math.pow(c - e_c, 2) / e_c +
    Math.pow(d - e_d, 2) / e_d;

  // Odds ratio
  const oddsRatio = (a * d) / (b * c);

  console.log(`\n--- Contingency Table ---`);
  console.log(`                    | Has JSON-LD | No JSON-LD | Total`);
  console.log(`--------------------|-------------|------------|-------`);
  console.log(`AI Overview Cited   |     ${a.toString().padStart(3)}     |     ${b.toString().padStart(3)}    |   ${row1}`);
  console.log(`Organic Only        |     ${c.toString().padStart(3)}     |     ${d.toString().padStart(3)}    |   ${row2}`);
  console.log(`--------------------|-------------|------------|-------`);
  console.log(`Total               |     ${col1.toString().padStart(3)}     |     ${col2.toString().padStart(3)}    |   ${n}`);

  console.log(`\n--- Statistical Analysis ---`);
  console.log(`Chi-square statistic: ${chiSquare.toFixed(3)}`);
  console.log(`Degrees of freedom: 1`);

  // Critical values
  const pValue = chiSquare > 3.841 ? '< 0.05' : chiSquare > 2.706 ? '< 0.10' : '> 0.10';
  console.log(`p-value: ${pValue} (critical value at α=0.05 is 3.841)`);

  console.log(`\nOdds Ratio: ${oddsRatio.toFixed(2)}`);
  console.log(`Interpretation: Sites cited in AI Overviews are ${oddsRatio.toFixed(1)}x as likely to have JSON-LD`);

  // Schema type breakdown
  console.log(`\n--- Schema Type Breakdown ---`);

  const schemaTypes = ['hasProductSchema', 'hasFaqSchema', 'hasOrganizationSchema', 'hasBreadcrumbSchema', 'hasAggregateRating'] as const;

  for (const type of schemaTypes) {
    const aiCount = validAI.filter(r => r[type]).length;
    const orgCount = validOrg.filter(r => r[type]).length;
    const typeName = type.replace('has', '').replace('Schema', '');
    console.log(`${typeName.padEnd(20)} | AI Cited: ${aiCount.toString().padStart(2)}/${validAI.length} (${(aiCount/validAI.length*100).toFixed(0)}%) | Organic: ${orgCount.toString().padStart(2)}/${validOrg.length} (${(orgCount/validOrg.length*100).toFixed(0)}%)`);
  }

  // Notable examples
  console.log(`\n--- Notable Examples ---`);
  console.log(`\nAI Overview cited sites WITHOUT JSON-LD:`);
  validAI.filter(r => !r.hasJsonLd).forEach(r => console.log(`  - ${r.domain}`));

  console.log(`\nOrganic-only sites WITH JSON-LD:`);
  validOrg.filter(r => r.hasJsonLd).slice(0, 10).forEach(r => console.log(`  - ${r.domain} (${r.jsonLdTypes.join(', ')})`));

  // Conclusion
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== CONCLUSION ===`);
  console.log(`${'='.repeat(60)}`);

  if (chiSquare > 3.841) {
    console.log(`\nStatistically significant correlation found (p < 0.05)`);
    if (oddsRatio > 1.5) {
      console.log(`Sites with JSON-LD are MORE likely to be cited in AI Overviews.`);
    } else if (oddsRatio < 0.67) {
      console.log(`Sites with JSON-LD are LESS likely to be cited in AI Overviews.`);
    }
  } else {
    console.log(`\nNo statistically significant correlation found (p > 0.05)`);
    console.log(`JSON-LD presence does not appear to strongly predict AI Overview citation.`);
  }

  // Save results
  const output = {
    auditDate: new Date().toISOString(),
    sampleSizes: {
      aiOverviewCited: validAI.length,
      organicOnly: validOrg.length
    },
    jsonLdPresence: {
      aiOverviewCited: { with: aiWithJsonLd, without: validAI.length - aiWithJsonLd, percentage: (aiWithJsonLd/validAI.length*100).toFixed(1) },
      organicOnly: { with: orgWithJsonLd, without: validOrg.length - orgWithJsonLd, percentage: (orgWithJsonLd/validOrg.length*100).toFixed(1) }
    },
    statistics: {
      chiSquare: chiSquare.toFixed(3),
      degreesOfFreedom: 1,
      pValue,
      oddsRatio: oddsRatio.toFixed(2)
    },
    detailedResults: allResults
  };

  fs.writeFileSync('./studies/google/jsonld-correlation-audit.json', JSON.stringify(output, null, 2));
  console.log(`\nDetailed results saved to: studies/google/jsonld-correlation-audit.json`);
}

main().catch(console.error);
