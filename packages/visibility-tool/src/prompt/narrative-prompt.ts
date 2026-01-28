/**
 * Narrative Prompt Generator
 * Creates prompts for Claude Code to generate strategic narratives
 */

import { Manifest } from '../manifest-schema.js';
import { StudyResults } from '../report/generator.js';
import { summarizeResults } from '../collectors/jsonld-collector.js';

export interface NarrativePromptOptions {
  audience: 'vp' | 'director' | 'analyst';
  focus: 'strategic' | 'technical' | 'balanced';
  length: 'brief' | 'standard' | 'comprehensive';
}

const DEFAULT_OPTIONS: NarrativePromptOptions = {
  audience: 'vp',
  focus: 'balanced',
  length: 'standard',
};

export function generateNarrativePrompt(
  results: StudyResults,
  options: Partial<NarrativePromptOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { manifest } = results;

  const primaryBrands = manifest.brands.filter(b => b.category === 'primary').map(b => b.name);
  const competitorBrands = manifest.brands.filter(b => b.category === 'competitor').map(b => b.name);

  const jsonldSummary = results.jsonld ? summarizeResults(results.jsonld) : null;

  // Build data context
  let dataContext = '';

  if (jsonldSummary) {
    dataContext += `\n## JSON-LD Schema Quality Results\n`;
    dataContext += `Total Products Analyzed: ${jsonldSummary.total}\n`;
    dataContext += `Overall Average Score: ${jsonldSummary.averageScore}/100\n\n`;
    dataContext += `### By Brand:\n`;

    for (const [brand, data] of Object.entries(jsonldSummary.byBrand)) {
      const isPrimary = primaryBrands.includes(brand);
      dataContext += `- ${brand}${isPrimary ? ' (PRIMARY)' : ''}: ${data.avgScore}/100 (${data.grade}) | `;
      dataContext += `Rating: ${data.withRating}/${data.count} | Price: ${data.withPrice}/${data.count}\n`;
    }

    // Add common issues
    if (results.jsonld) {
      const allIssues: Record<string, number> = {};
      for (const r of results.jsonld) {
        for (const issue of r.scoring.issues) {
          allIssues[issue] = (allIssues[issue] || 0) + 1;
        }
      }

      const topIssues = Object.entries(allIssues)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (topIssues.length > 0) {
        dataContext += `\n### Common Issues Across All Products:\n`;
        for (const [issue, count] of topIssues) {
          dataContext += `- ${issue}: ${count} products affected\n`;
        }
      }
    }
  }

  // Audience-specific instructions
  const audienceInstructions: Record<string, string> = {
    vp: `Write for a VP of Digital/Marketing. Focus on strategic implications, competitive positioning, and business impact. Avoid technical jargon - explain concepts simply. Lead with insights, not data.`,
    director: `Write for a Director-level audience. Balance strategic context with actionable details. Include specific metrics but focus on what they mean for the business.`,
    analyst: `Write for a technical analyst. Include detailed metrics, specific technical recommendations, and implementation guidance. Be precise about schema properties and SEO implications.`,
  };

  // Length instructions
  const lengthInstructions: Record<string, string> = {
    brief: `Keep the report concise - approximately 500-800 words. Focus on the most critical findings and top 3 recommendations.`,
    standard: `Standard report length - approximately 1000-1500 words. Cover all major sections but stay focused.`,
    comprehensive: `Comprehensive report - approximately 2000-2500 words. Provide detailed analysis of each brand and thorough recommendations.`,
  };

  // Focus instructions
  const focusInstructions: Record<string, string> = {
    strategic: `Emphasize market positioning, competitive threats, and business opportunities. Technical details should support strategic arguments.`,
    technical: `Emphasize specific schema improvements, technical implementation details, and SEO mechanics.`,
    balanced: `Balance strategic insights with technical specifics. Each recommendation should have both business rationale and technical guidance.`,
  };

  return `# AI Visibility Study: Strategic Narrative Generation

You are a senior digital strategy consultant preparing a ${opts.audience.toUpperCase()}-level report.

${audienceInstructions[opts.audience]}
${lengthInstructions[opts.length]}
${focusInstructions[opts.focus]}

---

## STUDY CONTEXT

**Study Name:** ${manifest.name}
**Study ID:** ${manifest.id}
**Generated:** ${results.timestamp}

**Primary Brands (Client):** ${primaryBrands.join(', ')}
**Competitor Brands:** ${competitorBrands.join(', ')}
**Segments:** ${[...new Set(manifest.brands.map(b => b.segment))].filter(Boolean).join(', ')}

---

## RAW DATA
${dataContext}

---

## YOUR TASK

Generate a strategic narrative report with the following sections:

### 1. Executive Summary (2-3 paragraphs)
- Overall AI visibility health assessment for ${primaryBrands.join(', ')}
- Key competitive gaps identified
- Top 3 priority actions with expected impact

### 2. Competitive Positioning
- How do ${primaryBrands.join(', ')} rank versus ${competitorBrands.join(', ')}?
- Which competitors are winning and why?
- What are competitors doing that ${primaryBrands[0]} is not?

### 3. Technical Assessment
- JSON-LD schema quality analysis
- Critical missing elements (AggregateRating, price, reviews)
- Impact on AI recommendation engines

### 4. Strategic Recommendations
Provide 5-7 prioritized recommendations, each with:
- Action: What specifically to do
- Rationale: Why it matters for AI visibility
- Impact: Expected improvement (High/Medium/Low)
- Complexity: Implementation effort (Low/Medium/High)

### 5. Risk Assessment
- What happens if no action is taken?
- Competitor trajectory analysis
- Timeline urgency

---

## FORMATTING REQUIREMENTS

- Use clear headers and subheaders
- Include specific data points to support claims (e.g., "${primaryBrands[0]} scored 75/100 vs ${competitorBrands[0]}'s 85/100")
- Use bullet points for lists
- Bold key insights and recommendations
- End with a clear call to action

---

## TONE

- Confident but not arrogant
- Data-driven but accessible
- Actionable, not just observational
- Acknowledge complexity without overwhelming

Generate the report now:`;
}

export function saveNarrativePrompt(
  results: StudyResults,
  outputPath: string,
  options?: Partial<NarrativePromptOptions>
): void {
  const prompt = generateNarrativePrompt(results, options);
  require('fs').writeFileSync(outputPath, prompt);
}
