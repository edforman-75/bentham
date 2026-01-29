#!/usr/bin/env npx tsx
/**
 * Mention.com CLI for creating social listening alerts
 *
 * Usage:
 *   npx tsx mention-cli.ts create-alert --name "TASC Brand" --keywords "TASC Performance,tasc bamboo"
 *   npx tsx mention-cli.ts list-alerts
 *   npx tsx mention-cli.ts export-mentions --alert-id 123456
 *
 * Environment:
 *   MENTION_ACCESS_TOKEN - Your Mention API access token
 *   MENTION_ACCOUNT_ID - Your Mention account ID
 */

const MENTION_API_BASE = 'https://api.mention.net/api/accounts';

interface MentionConfig {
  accessToken: string;
  accountId: string;
}

interface AlertQuery {
  type: 'basic' | 'advanced';
  included_keywords?: string[];
  required_keywords?: string[];
  excluded_keywords?: string[];
  query_string?: string;
}

interface CreateAlertRequest {
  name: string;
  query: AlertQuery;
  languages: string[];
  sources?: string[];
  noise_detection?: boolean;
  blocked_sites?: string[];
}

function getConfig(): MentionConfig {
  const accessToken = process.env.MENTION_ACCESS_TOKEN;
  const accountId = process.env.MENTION_ACCOUNT_ID;

  if (!accessToken) {
    console.error('Error: MENTION_ACCESS_TOKEN environment variable is required');
    console.error('Get your token at: https://web.mention.com/en/settings/account/api');
    process.exit(1);
  }

  if (!accountId) {
    console.error('Error: MENTION_ACCOUNT_ID environment variable is required');
    console.error('Find your account ID in the Mention dashboard URL or API settings');
    process.exit(1);
  }

  return { accessToken, accountId };
}

async function apiRequest(
  config: MentionConfig,
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<unknown> {
  const url = `${MENTION_API_BASE}/${config.accountId}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }

  return response.json();
}

async function createAlert(
  config: MentionConfig,
  name: string,
  includedKeywords: string[],
  options: {
    requiredKeywords?: string[];
    excludedKeywords?: string[];
    languages?: string[];
    sources?: string[];
  } = {}
): Promise<void> {
  const request: CreateAlertRequest = {
    name,
    query: {
      type: 'basic',
      included_keywords: includedKeywords,
      required_keywords: options.requiredKeywords,
      excluded_keywords: options.excludedKeywords,
    },
    languages: options.languages || ['en'],
    sources: options.sources || ['web', 'twitter', 'facebook', 'instagram', 'reddit', 'youtube'],
    noise_detection: true,
  };

  console.log('Creating alert:', name);
  console.log('Keywords:', includedKeywords.join(', '));
  if (options.excludedKeywords?.length) {
    console.log('Excluded:', options.excludedKeywords.join(', '));
  }

  const result = await apiRequest(config, '/alerts', 'POST', request);
  console.log('\nAlert created successfully!');
  console.log(JSON.stringify(result, null, 2));
}

async function listAlerts(config: MentionConfig): Promise<void> {
  const result = await apiRequest(config, '/alerts') as { alerts: Array<{ id: string; name: string; query: AlertQuery }> };

  console.log('Your Mention Alerts:\n');
  for (const alert of result.alerts || []) {
    console.log(`  [${alert.id}] ${alert.name}`);
    if (alert.query.included_keywords) {
      console.log(`      Keywords: ${alert.query.included_keywords.join(', ')}`);
    }
  }
}

async function exportMentions(
  config: MentionConfig,
  alertId: string,
  options: { limit?: number; since?: string } = {}
): Promise<void> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.since) params.set('since_id', options.since);

  const endpoint = `/alerts/${alertId}/mentions?${params}`;
  const result = await apiRequest(config, endpoint) as { mentions: unknown[] };

  console.log(JSON.stringify(result.mentions, null, 2));
}

// TASC-specific presets
const TASC_PRESETS = {
  brand: {
    name: 'TASC Performance - Brand Mentions',
    keywords: [
      'TASC Performance',
      'tasc performance',
      'tascperformance',
      '@tascperformance',
      '#tascperformance',
      '#tasclife',
      'BamCo fabric',
      'tasc bamboo',
      'tasc polo',
      'tasc shirt',
      'tasc joggers',
    ],
    excluded: ['task', 'task performance', 'TASC test', 'tasc score'],
  },
  competitors: {
    name: 'TASC Competitors',
    keywords: [
      'lululemon',
      '@lululemon',
      '#lululemon',
      'vuori',
      '@vuori',
      '#vuori',
      'rhone apparel',
      '@rhone',
      'free fly apparel',
      'free fly bamboo',
      '@freeflyapparel',
      'cariloha',
      '@cariloha',
      'cariloha bamboo',
    ],
    excluded: ['rhone river', 'free fly fishing'],
  },
};

async function createTascAlerts(config: MentionConfig): Promise<void> {
  console.log('Creating TASC Performance alerts...\n');

  // Brand alert
  await createAlert(config, TASC_PRESETS.brand.name, TASC_PRESETS.brand.keywords, {
    excludedKeywords: TASC_PRESETS.brand.excluded,
    languages: ['en'],
  });

  console.log('\n---\n');

  // Competitors alert
  await createAlert(config, TASC_PRESETS.competitors.name, TASC_PRESETS.competitors.keywords, {
    excludedKeywords: TASC_PRESETS.competitors.excluded,
    languages: ['en'],
  });

  console.log('\nAll TASC alerts created!');
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Mention.com CLI for Social Listening

Usage:
  mention-cli <command> [options]

Commands:
  create-alert     Create a new monitoring alert
  list-alerts      List all alerts in your account
  export-mentions  Export mentions from an alert
  tasc-setup       Create pre-configured TASC Performance alerts

Options for create-alert:
  --name, -n       Alert name (required)
  --keywords, -k   Comma-separated keywords (required)
  --excluded, -e   Comma-separated excluded keywords
  --languages, -l  Comma-separated language codes (default: en)

Options for export-mentions:
  --alert-id, -a   Alert ID (required)
  --limit          Max mentions to return (default: 100)

Environment Variables:
  MENTION_ACCESS_TOKEN   Your Mention API token (required)
  MENTION_ACCOUNT_ID     Your Mention account ID (required)

Examples:
  # Set up all TASC alerts at once
  mention-cli tasc-setup

  # Create a custom alert
  mention-cli create-alert -n "My Brand" -k "brand name,@brandhandle" -e "unrelated term"

  # List existing alerts
  mention-cli list-alerts

  # Export mentions
  mention-cli export-mentions -a 123456 --limit 500
`);
    return;
  }

  const config = getConfig();

  switch (command) {
    case 'create-alert': {
      const nameIdx = args.findIndex(a => a === '--name' || a === '-n');
      const keywordsIdx = args.findIndex(a => a === '--keywords' || a === '-k');
      const excludedIdx = args.findIndex(a => a === '--excluded' || a === '-e');
      const languagesIdx = args.findIndex(a => a === '--languages' || a === '-l');

      const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
      const keywords = keywordsIdx >= 0 ? args[keywordsIdx + 1]?.split(',').map(k => k.trim()) : undefined;
      const excluded = excludedIdx >= 0 ? args[excludedIdx + 1]?.split(',').map(k => k.trim()) : undefined;
      const languages = languagesIdx >= 0 ? args[languagesIdx + 1]?.split(',').map(l => l.trim()) : ['en'];

      if (!name || !keywords?.length) {
        console.error('Error: --name and --keywords are required');
        process.exit(1);
      }

      await createAlert(config, name, keywords, { excludedKeywords: excluded, languages });
      break;
    }

    case 'list-alerts':
      await listAlerts(config);
      break;

    case 'export-mentions': {
      const alertIdx = args.findIndex(a => a === '--alert-id' || a === '-a');
      const limitIdx = args.findIndex(a => a === '--limit');

      const alertId = alertIdx >= 0 ? args[alertIdx + 1] : undefined;
      const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 100;

      if (!alertId) {
        console.error('Error: --alert-id is required');
        process.exit(1);
      }

      await exportMentions(config, alertId, { limit });
      break;
    }

    case 'tasc-setup':
      await createTascAlerts(config);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run with --help for usage');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
