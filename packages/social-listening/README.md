# @bentham/social-listening

Social listening integrations for Bentham. Provides adapters for Brand24 and other social listening platforms.

## Overview

This package enables monitoring and analysis of brand mentions across social media, news, blogs, forums, and other online sources. It integrates with Brand24 for data collection and stores results in a Neon database for correlation with AI visibility data.

## Quick Start

```bash
# Install dependencies
pnpm install

# Import Brand24 CSV exports
pnpm tasc:import-brand24 /path/to/csv/directory

# Import AI visibility results
pnpm tasc:import-visibility /path/to/results

# Generate report
pnpm tasc:report

# Check database summary
pnpm tasc:summary
```

## Installation

```bash
pnpm add @bentham/social-listening
```

## API Reference

### Brand24 Importer

```typescript
import { parseBrand24Csv, importBrand24File } from '@bentham/social-listening';

// Parse a Brand24 CSV export
const mentions = parseBrand24Csv('/path/to/export.csv');

// Import with keyword association
const socialMentions = importBrand24File('/path/to/export.csv', keywordId);
```

### Database Operations

```typescript
import { SocialListeningDatabase, createGluDatabase } from '@bentham/social-listening';

// Create database connection (glu-analytics includes TASC data)
const db = createGluDatabase();

// Insert mentions
await db.insertMentions(mentions);

// Get brand statistics
const stats = await db.getMentionStats('TASC');

// Get competitor comparison
const comparison = await db.getCompetitorComparison();
```

### TASC Study

```typescript
import { importBrand24ForTasc, importVisibilityResults, generateTascReport } from '@bentham/social-listening';

// Import Brand24 data for TASC
const result = await importBrand24ForTasc('/path/to/exports');

// Import visibility results
const visibility = await importVisibilityResults('/path/to/results');

// Generate comprehensive report
const report = await generateTascReport();
```

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check
pnpm typecheck
```

## Dependencies

- `@neondatabase/serverless` - Database connectivity
- `csv-parse` - CSV parsing for Brand24 exports

## Database Schema

### Tables

- `keywords` - Tracked keywords and competitors
- `social_mentions` - Brand24 mention data
- `ai_visibility_results` - AI surface query results
- `visibility_snapshots` - Daily visibility summaries

### Views

- `mention_stats` - Aggregated mention statistics by keyword
- `visibility_by_surface` - Visibility rates per AI surface
- `competitor_comparison` - Share of voice comparison
- `daily_mention_trend` - Mention volume over time

## Environment Variables

```bash
GLU_DATABASE_URL=postgresql://...  # Neon connection string (glu-analytics)
# or
DATABASE_URL=postgresql://...      # Alternative env var name
```
