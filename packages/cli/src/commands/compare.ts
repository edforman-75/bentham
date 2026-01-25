/**
 * bentham compare - Compare query results across locations/surfaces
 *
 * Usage:
 *   bentham compare "best dog food" --surface chatgpt-web --locations in-mum,us-nyc
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

export const compareCommand = new Command('compare')
  .description('Compare query results across locations or surfaces')
  .argument('<query>', 'The query text to compare')
  .option('-s, --surfaces <ids>', 'Surface IDs, comma-separated', 'chat-api')
  .option('-l, --locations <ids>', 'Location IDs, comma-separated', 'us-national')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --format <format>', 'Output format: text, json, csv', 'text')
  .action(async (query: string, options) => {
    const spinner = ora();

    const surfaces = options.surfaces.split(',').map((s: string) => s.trim());
    const locations = options.locations.split(',').map((l: string) => l.trim());

    console.log(chalk.bold('\nBentham Compare'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(`Query:     ${chalk.cyan(query)}`);
    console.log(`Surfaces:  ${chalk.yellow(surfaces.join(', '))}`);
    console.log(`Locations: ${chalk.green(locations.join(', '))}`);
    console.log(`Matrix:    ${surfaces.length} × ${locations.length} = ${surfaces.length * locations.length} cells`);
    console.log(chalk.gray('─'.repeat(60)));

    spinner.info('Compare command not yet implemented. Use bentham query for individual queries.');
  });
