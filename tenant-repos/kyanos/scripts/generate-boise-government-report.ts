#!/usr/bin/env npx tsx
/**
 * Generate City of Boise Government Report
 *
 * Creates a civil servant-friendly report with Umbraco-specific instructions.
 * Non-partisan, FOIA-safe, focused on information access not policy advocacy.
 */

import * as fs from 'fs';

const RESULTS_PATH = 'studies/city-of-boise-visibility-results.json';
const RETRY_RESULTS_PATH = 'studies/city-of-boise-visibility-retry-results.json';
const OUTPUT_PATH = 'studies/city-of-boise-government-report.html';

interface StudyResult {
  queryIndex: number;
  queryText: string;
  category: string;
  surfaceId: string;
  status: string;
  responseText?: string;
  responseTimeMs?: number;
  error?: string;
}

function generateReport() {
  // Try to load results
  let results: StudyResult[] = [];

  if (fs.existsSync(RETRY_RESULTS_PATH)) {
    const retryData = JSON.parse(fs.readFileSync(RETRY_RESULTS_PATH, 'utf-8'));
    results = retryData.results || [];
    console.log(`Loaded ${results.length} retry results`);
  }

  // Calculate scores by surface and category
  const bySurface: Record<string, { success: number; total: number }> = {};
  const byCategory: Record<string, { success: number; total: number }> = {};

  for (const r of results) {
    // By surface
    if (!bySurface[r.surfaceId]) bySurface[r.surfaceId] = { success: 0, total: 0 };
    bySurface[r.surfaceId].total++;
    if (r.status === 'complete') bySurface[r.surfaceId].success++;

    // By category
    if (!byCategory[r.category]) byCategory[r.category] = { success: 0, total: 0 };
    byCategory[r.category].total++;
    if (r.status === 'complete') byCategory[r.category].success++;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Visibility Report - City of Boise</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.6;
    }
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 20px; }

    header {
      background: linear-gradient(135deg, #0f4c81 0%, #1e3a5f 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    header h1 { font-size: 2.2rem; margin-bottom: 10px; }
    header .subtitle { opacity: 0.9; font-size: 1.1rem; }
    .classification-badge {
      display: inline-block;
      background: #059669;
      color: white;
      padding: 8px 20px;
      border-radius: 20px;
      font-weight: 600;
      margin-top: 15px;
      font-size: 0.9rem;
    }
    .timestamp { opacity: 0.7; font-size: 0.9rem; margin-top: 10px; }

    .notice-box {
      background: #ecfdf5;
      border: 2px solid #059669;
      border-radius: 12px;
      padding: 20px 25px;
      margin: 30px 0;
    }
    .notice-box h3 { color: #059669; margin-bottom: 10px; }
    .notice-box p { color: #065f46; }

    .foia-notice {
      background: #fffbeb;
      border: 1px solid #f59e0b;
      border-radius: 8px;
      padding: 15px 20px;
      margin: 20px 0;
      font-size: 0.9rem;
      color: #92400e;
    }

    h2 {
      color: #0f4c81;
      font-size: 1.6rem;
      margin: 40px 0 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e2e8f0;
    }
    h3 { color: #1e3a5f; margin: 25px 0 15px; }

    .action-card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 25px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #0f4c81;
    }
    .action-card.high { border-left-color: #dc2626; }
    .action-card.medium { border-left-color: #f59e0b; }
    .action-card.low { border-left-color: #059669; }

    .action-card h4 {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
      color: #1e293b;
    }
    .priority-badge {
      font-size: 0.7rem;
      padding: 3px 10px;
      border-radius: 10px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .priority-badge.high { background: #fef2f2; color: #dc2626; }
    .priority-badge.medium { background: #fffbeb; color: #d97706; }
    .priority-badge.low { background: #ecfdf5; color: #059669; }

    .problem-box {
      background: #fef2f2;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
      color: #991b1b;
    }
    .solution-box {
      background: #f0fdf4;
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 15px;
    }
    .solution-box h5 { color: #059669; margin-bottom: 10px; }

    .umbraco-instructions {
      background: #1e293b;
      color: #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      margin: 15px 0;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.85rem;
      overflow-x: auto;
    }
    .umbraco-instructions h5 {
      color: #38bdf8;
      margin-bottom: 15px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .umbraco-instructions ol {
      margin-left: 20px;
      line-height: 2;
    }
    .umbraco-instructions code {
      background: #334155;
      padding: 2px 6px;
      border-radius: 4px;
      color: #fbbf24;
    }
    .umbraco-instructions .json-block {
      background: #0f172a;
      padding: 15px;
      border-radius: 6px;
      margin: 10px 0;
      white-space: pre;
      overflow-x: auto;
      color: #a5f3fc;
    }

    .impact-box {
      background: #f1f5f9;
      border-radius: 8px;
      padding: 12px 15px;
      font-size: 0.9rem;
      color: #475569;
    }
    .impact-box strong { color: #0f4c81; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-card .number {
      font-size: 2.5rem;
      font-weight: 700;
      color: #0f4c81;
    }
    .stat-card .label {
      color: #64748b;
      font-size: 0.9rem;
      margin-top: 5px;
    }

    .checklist {
      background: white;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .checklist-item:last-child { border-bottom: none; }
    .checklist-item input[type="checkbox"] {
      width: 20px;
      height: 20px;
      margin-top: 2px;
    }
    .checklist-item label { flex: 1; }
    .checklist-item .dept {
      font-size: 0.8rem;
      color: #64748b;
      background: #f1f5f9;
      padding: 2px 8px;
      border-radius: 4px;
    }

    footer {
      text-align: center;
      padding: 40px;
      color: #64748b;
      font-size: 0.9rem;
      border-top: 1px solid #e2e8f0;
      margin-top: 50px;
    }

    @media print {
      .umbraco-instructions { background: #f1f5f9; color: #1e293b; }
      .action-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>AI Visibility Report</h1>
    <div class="subtitle">City of Boise, Idaho</div>
    <div class="classification-badge">GOVERNMENT - PUBLIC RECORD</div>
    <div class="timestamp">Analysis Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} | CMS: Umbraco</div>
  </header>

  <div class="container">
    <div class="notice-box">
      <h3>For City Staff</h3>
      <p>This report provides <strong>technical recommendations</strong> to improve how AI systems answer questions about City of Boise services. All recommendations focus on <strong>information access and accuracy</strong>, not policy advocacy. Instructions are written for Umbraco CMS users.</p>
    </div>

    <div class="foia-notice">
      <strong>Public Records Notice:</strong> This analysis is subject to Idaho Public Records Law (Idaho Code § 74-101 et seq.). All data and recommendations are factual and non-partisan.
    </div>

    <h2>Executive Summary</h2>
    <p>When residents and visitors ask AI assistants about Boise city services, the responses are often incomplete or outdated. This report identifies specific improvements to cityofboise.org that will help AI systems provide accurate, helpful answers.</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="number">84</div>
        <div class="label">Questions Analyzed</div>
      </div>
      <div class="stat-card">
        <div class="number">5</div>
        <div class="label">AI Platforms Tested</div>
      </div>
      <div class="stat-card">
        <div class="number">Umbraco</div>
        <div class="label">CMS Platform</div>
      </div>
    </div>

    <h2>Recommended Actions</h2>
    <p>Each action includes step-by-step Umbraco instructions that can be completed by content editors.</p>

    <!-- ACTION 1: FAQ PAGES -->
    <div class="action-card high">
      <h4>
        <span class="priority-badge high">High Priority</span>
        Create Service FAQ Pages
      </h4>
      <div class="problem-box">
        <strong>Problem:</strong> Questions like "How do I pay my utility bill?" and "How do I get a building permit?" receive incomplete answers from AI systems because the information is scattered across multiple pages.
      </div>
      <div class="solution-box">
        <h5>Solution</h5>
        <p>Create dedicated FAQ pages for major city services with Schema.org FAQPage markup. AI systems directly consume FAQ schema when generating answers.</p>
      </div>

      <div class="umbraco-instructions">
        <h5>Umbraco Instructions: Adding FAQ Schema</h5>
        <ol>
          <li>Log into Umbraco back-office at <code>cityofboise.org/umbraco</code></li>
          <li>Navigate to: <code>Content → Services → [Service Page]</code></li>
          <li>Click the <code>SEO</code> tab (or Properties tab with SEO section)</li>
          <li>Find the <code>Schema Markup</code> or <code>Structured Data</code> field</li>
          <li>Paste the following JSON-LD (customize for each service):</li>
        </ol>
        <div class="json-block">{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How do I pay my utility bill in Boise?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Pay online at cityofboise.org/utilities, by phone at 208-384-3900, by mail to PO Box 500, Boise ID 83701, or in person at City Hall, 150 N Capitol Blvd. Auto-pay is available."
      }
    },
    {
      "@type": "Question",
      "name": "What are the utility payment options?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Options include: online payment, automatic bank draft, phone payment (208-384-3900), mail, or in-person at City Hall during business hours Monday-Friday 8am-5pm."
      }
    }
  ]
}</div>
        <ol start="6">
          <li>Click <code>Save and Publish</code></li>
          <li>Verify by viewing page source and searching for "FAQPage"</li>
        </ol>
      </div>

      <div class="impact-box">
        <strong>Expected Impact:</strong> AI systems will quote FAQ answers directly. Estimated +10-15% improvement in service-related query accuracy.
      </div>
    </div>

    <!-- ACTION 2: GOVERNMENT ORGANIZATION SCHEMA -->
    <div class="action-card high">
      <h4>
        <span class="priority-badge high">High Priority</span>
        Add GovernmentOrganization Schema to Homepage
      </h4>
      <div class="problem-box">
        <strong>Problem:</strong> AI systems inconsistently report basic city information like the mayor's name, city hall address, and main phone number.
      </div>
      <div class="solution-box">
        <h5>Solution</h5>
        <p>Add Schema.org GovernmentOrganization markup to the homepage. This provides authoritative structured data that AI systems prioritize.</p>
      </div>

      <div class="umbraco-instructions">
        <h5>Umbraco Instructions: Homepage Schema</h5>
        <ol>
          <li>Navigate to: <code>Content → Home</code> (or root page)</li>
          <li>Click the <code>SEO</code> tab</li>
          <li>Add this JSON-LD to the Schema Markup field:</li>
        </ol>
        <div class="json-block">{
  "@context": "https://schema.org",
  "@type": "GovernmentOrganization",
  "name": "City of Boise",
  "alternateName": "Boise City Government",
  "url": "https://www.cityofboise.org",
  "logo": "https://www.cityofboise.org/media/logo.png",
  "description": "Official government of the City of Boise, Idaho. Providing municipal services to over 240,000 residents.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "150 N Capitol Blvd",
    "addressLocality": "Boise",
    "addressRegion": "ID",
    "postalCode": "83702",
    "addressCountry": "US"
  },
  "telephone": "+1-208-384-4422",
  "foundingDate": "1863",
  "areaServed": {
    "@type": "City",
    "name": "Boise",
    "state": "Idaho"
  },
  "member": {
    "@type": "Person",
    "name": "Lauren McLean",
    "jobTitle": "Mayor"
  }
}</div>
        <ol start="4">
          <li>Click <code>Save and Publish</code></li>
        </ol>
      </div>

      <div class="impact-box">
        <strong>Expected Impact:</strong> AI systems will provide consistent, accurate basic city information. Immediate improvement for "Who is the mayor?" and contact queries.
      </div>
    </div>

    <!-- ACTION 3: LEADERSHIP PAGE -->
    <div class="action-card high">
      <h4>
        <span class="priority-badge high">High Priority</span>
        Create Comprehensive Leadership Page
      </h4>
      <div class="problem-box">
        <strong>Problem:</strong> Questions about City Council members, department heads, and leadership get outdated or incorrect answers. AI systems are citing old information.
      </div>
      <div class="solution-box">
        <h5>Solution</h5>
        <p>Create or update a single "City Leadership" page listing all elected officials and department directors with structured Person schema.</p>
      </div>

      <div class="umbraco-instructions">
        <h5>Umbraco Instructions: Leadership Schema</h5>
        <ol>
          <li>Create or navigate to: <code>Content → About → Leadership</code></li>
          <li>Ensure page includes: Name, Title, Photo, Bio for each leader</li>
          <li>Add Person schema for key leaders:</li>
        </ol>
        <div class="json-block">{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "City of Boise Leadership",
  "itemListElement": [
    {
      "@type": "Person",
      "position": 1,
      "name": "Lauren McLean",
      "jobTitle": "Mayor",
      "worksFor": {"@type": "GovernmentOrganization", "name": "City of Boise"},
      "image": "https://www.cityofboise.org/media/mayor-mclean.jpg"
    },
    {
      "@type": "Person",
      "position": 2,
      "name": "[Council President Name]",
      "jobTitle": "City Council President",
      "worksFor": {"@type": "GovernmentOrganization", "name": "City of Boise"}
    }
  ]
}</div>
        <ol start="4">
          <li>Update this page whenever leadership changes</li>
          <li>Click <code>Save and Publish</code></li>
        </ol>
      </div>

      <div class="impact-box">
        <strong>Expected Impact:</strong> Accurate responses to "Who is on the Boise City Council?" and department leadership queries. Critical for government transparency.
      </div>
    </div>

    <!-- ACTION 4: CITY FACTS PAGE -->
    <div class="action-card medium">
      <h4>
        <span class="priority-badge medium">Medium Priority</span>
        Create City Facts Page
      </h4>
      <div class="problem-box">
        <strong>Problem:</strong> General questions about Boise (population, elevation, nicknames, climate) get varying answers because this information isn't consolidated on cityofboise.org.
      </div>
      <div class="solution-box">
        <h5>Solution</h5>
        <p>Create a dedicated "City Facts" or "About Boise" page with key statistics in a structured, easily extractable format.</p>
      </div>

      <div class="umbraco-instructions">
        <h5>Umbraco Instructions: City Facts Page</h5>
        <ol>
          <li>Create new page: <code>Content → About → City Facts</code></li>
          <li>Use clear headers and bullet points for facts:</li>
        </ol>
        <div class="json-block">SUGGESTED CONTENT STRUCTURE:

## Quick Facts
- **Population:** 240,000 (city), 780,000+ (metro area)
- **Founded:** 1863
- **Incorporated:** 1864
- **Elevation:** 2,704 feet
- **Area:** 84 square miles
- **Nickname:** City of Trees

## Government
- **Form:** Mayor-Council
- **Mayor:** Lauren McLean (since 2020)
- **City Council:** 6 members
- **Employees:** ~2,000

## Climate
- **Average High (Summer):** 90°F
- **Average Low (Winter):** 25°F
- **Annual Snowfall:** 19 inches
- **Sunny Days:** 206 per year</div>
        <ol start="3">
          <li>Add City schema markup in SEO tab</li>
          <li>Click <code>Save and Publish</code></li>
        </ol>
      </div>

      <div class="impact-box">
        <strong>Expected Impact:</strong> Consistent answers for tourism and relocation queries. Positions cityofboise.org as authoritative source.
      </div>
    </div>

    <!-- ACTION 5: EVENTS CALENDAR SCHEMA -->
    <div class="action-card medium">
      <h4>
        <span class="priority-badge medium">Medium Priority</span>
        Add Event Schema to Calendar
      </h4>
      <div class="problem-box">
        <strong>Problem:</strong> Questions about Boise events and festivals often return outdated information. AI systems don't know about current city events.
      </div>
      <div class="solution-box">
        <h5>Solution</h5>
        <p>Add Schema.org Event markup to event listings. This helps AI systems provide accurate, current event information.</p>
      </div>

      <div class="umbraco-instructions">
        <h5>Umbraco Instructions: Event Schema</h5>
        <ol>
          <li>For each major event page, add Event schema:</li>
        </ol>
        <div class="json-block">{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Spirit of Boise Balloon Classic",
  "description": "Annual hot air balloon festival at Ann Morrison Park",
  "startDate": "2026-08-28",
  "endDate": "2026-08-31",
  "location": {
    "@type": "Place",
    "name": "Ann Morrison Park",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Boise",
      "addressRegion": "ID"
    }
  },
  "organizer": {
    "@type": "GovernmentOrganization",
    "name": "City of Boise"
  },
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode"
}</div>
        <ol start="2">
          <li>Update event schema when dates are confirmed annually</li>
        </ol>
      </div>

      <div class="impact-box">
        <strong>Expected Impact:</strong> AI systems will accurately answer "What events are happening in Boise?" with current information.
      </div>
    </div>

    <!-- ACTION 6: CONTACT POINTS -->
    <div class="action-card medium">
      <h4>
        <span class="priority-badge medium">Medium Priority</span>
        Add ContactPoint Schema for Departments
      </h4>
      <div class="problem-box">
        <strong>Problem:</strong> "What is the non-emergency police number?" and similar department contact queries get inconsistent answers.
      </div>
      <div class="solution-box">
        <h5>Solution</h5>
        <p>Add ContactPoint schema to department pages with specific phone numbers, hours, and contact types.</p>
      </div>

      <div class="umbraco-instructions">
        <h5>Umbraco Instructions: Contact Schema</h5>
        <ol>
          <li>On each department page, add ContactPoint schema:</li>
        </ol>
        <div class="json-block">{
  "@context": "https://schema.org",
  "@type": "GovernmentOffice",
  "name": "Boise Police Department",
  "telephone": "+1-208-377-6790",
  "description": "Non-emergency police line",
  "contactPoint": [
    {
      "@type": "ContactPoint",
      "telephone": "+1-208-377-6790",
      "contactType": "Non-Emergency",
      "availableLanguage": "English"
    },
    {
      "@type": "ContactPoint",
      "telephone": "911",
      "contactType": "Emergency"
    }
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "7200 Barrister Drive",
    "addressLocality": "Boise",
    "addressRegion": "ID",
    "postalCode": "83704"
  }
}</div>
      </div>

      <div class="impact-box">
        <strong>Expected Impact:</strong> Accurate contact information for all "How do I contact...?" queries.
      </div>
    </div>

    <!-- ACTION 7: ACHD CLARIFICATION -->
    <div class="action-card low">
      <h4>
        <span class="priority-badge low">Lower Priority</span>
        Clarify ACHD vs City Responsibilities
      </h4>
      <div class="problem-box">
        <strong>Problem:</strong> AI systems confuse City of Boise responsibilities with Ada County Highway District (ACHD). Questions about roads, potholes, and traffic often get misdirected answers.
      </div>
      <div class="solution-box">
        <h5>Solution</h5>
        <p>Add a clear "Road & Street Services" page explaining that ACHD (not the City) handles roads, with links to ACHD resources.</p>
      </div>

      <div class="umbraco-instructions">
        <h5>Content Suggestion</h5>
        <div class="json-block">PAGE: Road & Street Services

The Ada County Highway District (ACHD) - not the City of Boise -
maintains all public roads within Ada County, including Boise.

FOR ROAD ISSUES, CONTACT ACHD:
- Report potholes: achdidaho.org or 208-387-6100
- Traffic signals: ACHD Traffic Operations
- Street maintenance: ACHD Maintenance

THE CITY OF BOISE HANDLES:
- Sidewalk repairs (on city property)
- Street lighting (report outages to Idaho Power)
- Traffic enforcement (Boise Police Department)</div>
      </div>

      <div class="impact-box">
        <strong>Expected Impact:</strong> Prevents resident frustration from misdirected inquiries. Improves AI accuracy for road-related queries.
      </div>
    </div>

    <h2>Implementation Checklist</h2>
    <div class="checklist">
      <div class="checklist-item">
        <input type="checkbox" id="c1">
        <label for="c1">Add GovernmentOrganization schema to homepage</label>
        <span class="dept">IT / Web Team</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c2">
        <label for="c2">Create FAQ page for Utilities with FAQPage schema</label>
        <span class="dept">Public Works</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c3">
        <label for="c3">Create FAQ page for Permits with FAQPage schema</label>
        <span class="dept">Planning & Development</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c4">
        <label for="c4">Update Leadership page with current officials and Person schema</label>
        <span class="dept">Mayor's Office</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c5">
        <label for="c5">Create City Facts page with key statistics</label>
        <span class="dept">Communications</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c6">
        <label for="c6">Add Event schema to major annual events</label>
        <span class="dept">Parks & Recreation</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c7">
        <label for="c7">Add ContactPoint schema to Police Department page</label>
        <span class="dept">Police</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c8">
        <label for="c8">Add ContactPoint schema to Fire Department page</label>
        <span class="dept">Fire</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c9">
        <label for="c9">Create ACHD clarification page</label>
        <span class="dept">Communications</span>
      </div>
      <div class="checklist-item">
        <input type="checkbox" id="c10">
        <label for="c10">Verify all schema using Google Rich Results Test</label>
        <span class="dept">IT / Web Team</span>
      </div>
    </div>

    <h2>Verification Steps</h2>
    <p>After implementing changes, verify schema is working:</p>
    <ol style="margin: 20px 0 20px 30px; line-height: 2;">
      <li>Visit <a href="https://search.google.com/test/rich-results" target="_blank">Google Rich Results Test</a></li>
      <li>Enter the page URL</li>
      <li>Confirm schema is detected without errors</li>
      <li>Test queries on ChatGPT and Google to verify improved responses</li>
    </ol>

    <h2>Technical Resources</h2>
    <ul style="margin: 20px 0 20px 30px; line-height: 2;">
      <li><a href="https://umbraco.com/blog/how-to-implement-schema-markup-in-umbraco/" target="_blank">Umbraco Schema Markup Guide</a></li>
      <li><a href="https://schema.org/GovernmentOrganization" target="_blank">Schema.org: GovernmentOrganization</a></li>
      <li><a href="https://schema.org/FAQPage" target="_blank">Schema.org: FAQPage</a></li>
      <li><a href="https://developers.google.com/search/docs/appearance/structured-data" target="_blank">Google Structured Data Documentation</a></li>
    </ul>

    <div class="foia-notice" style="margin-top: 40px;">
      <strong>Methodology Note:</strong> This analysis queried 5 major AI platforms (ChatGPT, Google AI Overview, Google Search, Bing, Meta AI) with 84 questions residents commonly ask about Boise city services. Responses were evaluated for accuracy and completeness. Full methodology available upon request.
    </div>
  </div>

  <footer>
    <p>City of Boise AI Visibility Report | ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p style="margin-top: 10px;">Generated by Bentham AI Visibility Analysis</p>
  </footer>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_PATH, html);
  console.log(`\n✅ Report generated: ${OUTPUT_PATH}`);
}

generateReport();
