#!/usr/bin/env node
/**
 * Bentham CLI
 *
 * Run AI surface queries with location control
 */

import { Command } from 'commander';
import { config } from 'dotenv';
import { queryCommand } from './commands/query.js';
import { proxyCommand } from './commands/proxy.js';
import { compareCommand } from './commands/compare.js';

// Load environment variables
config();

const program = new Command();

program
  .name('bentham')
  .description('Run AI surface queries with location control')
  .version('0.1.0');

// Register commands
program.addCommand(queryCommand);
program.addCommand(proxyCommand);
program.addCommand(compareCommand);

program.parse();
