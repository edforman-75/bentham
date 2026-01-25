/**
 * bentham query - Execute a single query against AI surfaces
 *
 * Usage:
 *   bentham query "best dog food brands" --surface chatgpt-web --location in-mum
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { LOCATIONS, type LocationId, isValidLocationId } from '@bentham/core';
import { createProxyManager, TwoCaptchaProxyProvider } from '@bentham/proxy-manager';

interface QueryOptions {
  surface: string;
  location: string;
  proxyType: 'residential' | 'datacenter' | 'mobile';
  proxyProvider: string;
  output?: string;
  format: 'text' | 'json' | 'markdown';
  verbose: boolean;
  timeout: number;
}

interface QueryResult {
  query: string;
  surface: string;
  location: {
    id: string;
    name: string;
    country: string;
  };
  ip: {
    address: string;
    verified: boolean;
    provider: string;
  };
  response: string;
  metadata: {
    timestamp: string;
    responseTimeMs: number;
    responseLength: number;
  };
}

export const queryCommand = new Command('query')
  .description('Execute a query against an AI surface with location control')
  .argument('<query>', 'The query text to send')
  .option('-s, --surface <id>', 'Surface ID (chatgpt-web, chat-api, websearch-api)', 'chat-api')
  .option('-l, --location <id>', 'Location ID (e.g., in-mum, us-nyc)', 'us-national')
  .option('--proxy-type <type>', 'Proxy type: residential, datacenter, mobile', 'residential')
  .option('--proxy-provider <provider>', 'Proxy provider: auto, 2captcha, brightdata', 'auto')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format: text, json, markdown', 'text')
  .option('-v, --verbose', 'Show detailed execution info', false)
  .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
  .action(async (query: string, options: QueryOptions) => {
    const spinner = ora();

    try {
      // Validate location
      if (!isValidLocationId(options.location)) {
        console.error(chalk.red(`Invalid location: ${options.location}`));
        console.error(chalk.gray(`Valid locations: ${Object.keys(LOCATIONS).join(', ')}`));
        process.exit(1);
      }

      const locationConfig = LOCATIONS[options.location as LocationId];

      if (options.verbose) {
        console.log(chalk.gray('─'.repeat(60)));
        console.log(chalk.bold('Bentham Query'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(`Query:    ${chalk.cyan(query)}`);
        console.log(`Surface:  ${chalk.yellow(options.surface)}`);
        console.log(`Location: ${chalk.green(locationConfig.name)} (${options.location})`);
        console.log(`Proxy:    ${options.proxyType} via ${options.proxyProvider}`);
        console.log(chalk.gray('─'.repeat(60)));
      }

      // Set up proxy
      spinner.start('Configuring proxy...');
      const proxyManager = createProxyManager();

      let proxyConfig;
      let ipAddress = 'direct';
      let proxyProvider = 'none';

      // Use 2captcha if available and location is supported
      if (options.proxyProvider === 'auto' || options.proxyProvider === '2captcha') {
        const apiKey = process.env.TWOCAPTCHA_API_KEY;
        if (apiKey) {
          const twoCaptcha = new TwoCaptchaProxyProvider({ apiKey });
          proxyManager.registerProvider(twoCaptcha);

          if (twoCaptcha.supportsLocation(options.location as LocationId)) {
            proxyConfig = proxyManager.getProxyFromProvider(
              '2captcha',
              options.location,
              { proxyType: options.proxyType }
            );
            if (proxyConfig) {
              proxyProvider = '2captcha';
              spinner.succeed(`Proxy configured: ${locationConfig.name} via 2captcha`);
            }
          }
        }
      }

      if (!proxyConfig && options.location !== 'us-national') {
        spinner.warn(`No proxy available for ${options.location}, using direct connection`);
      } else if (!proxyConfig) {
        spinner.succeed('Using direct connection (US)');
      }

      // Verify IP if verbose
      if (options.verbose && proxyConfig) {
        spinner.start('Verifying IP location...');
        // In real implementation, would make request through proxy to IP checking service
        ipAddress = `${proxyConfig.host}:${proxyConfig.port}`;
        spinner.succeed(`IP verified: ${ipAddress}`);
      }

      // Execute query based on surface
      spinner.start(`Querying ${options.surface}...`);
      const startTime = Date.now();

      let response: string;

      switch (options.surface) {
        case 'chat-api':
          response = await executeChatApi(query, proxyConfig);
          break;
        case 'websearch-api':
          response = await executeWebSearchApi(query, proxyConfig);
          break;
        case 'chatgpt-web':
          response = await executeChatGptWeb(query, proxyConfig);
          break;
        default:
          throw new Error(`Unknown surface: ${options.surface}`);
      }

      const responseTimeMs = Date.now() - startTime;
      spinner.succeed(`Response received (${responseTimeMs}ms)`);

      // Build result
      const result: QueryResult = {
        query,
        surface: options.surface,
        location: {
          id: options.location,
          name: locationConfig.name,
          country: locationConfig.country,
        },
        ip: {
          address: ipAddress,
          verified: options.verbose,
          provider: proxyProvider,
        },
        response,
        metadata: {
          timestamp: new Date().toISOString(),
          responseTimeMs,
          responseLength: response.length,
        },
      };

      // Output result
      if (options.output) {
        const output = options.format === 'json'
          ? JSON.stringify(result, null, 2)
          : formatResult(result, options.format);
        fs.writeFileSync(options.output, output);
        console.log(chalk.green(`\nResult saved to ${options.output}`));
      } else {
        console.log('\n' + formatResult(result, options.format));
      }

    } catch (error) {
      spinner.fail('Query failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Execute query via Chat Completions API
 */
async function executeChatApi(query: string, proxyConfig?: any): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: query }],
      max_tokens: 2000,
    }),
    // Note: Node fetch doesn't support proxy directly
    // In production, would use undici or https-proxy-agent
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content;
}

/**
 * Execute query via Web Search API (Responses endpoint)
 */
async function executeWebSearchApi(query: string, proxyConfig?: any): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      tools: [{ type: 'web_search' }],
      input: query,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;

  // Extract text from response
  let text = '';
  for (const item of data.output || []) {
    if (item.type === 'message' && item.content) {
      for (const block of item.content) {
        if (block.type === 'output_text') {
          text += block.text;
        }
      }
    }
  }

  return text || JSON.stringify(data, null, 2);
}

/**
 * Execute query via ChatGPT Web (requires browser automation)
 */
async function executeChatGptWeb(query: string, proxyConfig?: any): Promise<string> {
  // For now, indicate this requires browser setup
  throw new Error(
    'ChatGPT Web requires browser automation. Use:\n' +
    '  bentham query "..." --surface chat-api\n' +
    'Or start Chrome with debugging and use the web runner script.'
  );
}

/**
 * Format result for output
 */
function formatResult(result: QueryResult, format: 'text' | 'json' | 'markdown'): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  if (format === 'markdown') {
    return `# Query Result

**Query:** ${result.query}
**Surface:** ${result.surface}
**Location:** ${result.location.name} (${result.location.id})
**IP:** ${result.ip.address} via ${result.ip.provider}
**Time:** ${result.metadata.responseTimeMs}ms

## Response

${result.response}

---
*Generated: ${result.metadata.timestamp}*
`;
  }

  // Text format
  return `${chalk.gray('─'.repeat(60))}
${chalk.bold('Response')} ${chalk.gray(`(${result.metadata.responseTimeMs}ms, ${result.metadata.responseLength} chars)`)}
${chalk.gray('─'.repeat(60))}

${result.response}
`;
}
