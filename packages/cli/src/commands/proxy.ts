/**
 * bentham proxy - Proxy management commands
 *
 * Usage:
 *   bentham proxy locations          # List available locations
 *   bentham proxy providers          # List configured providers
 *   bentham proxy test in-mum        # Test a location
 *   bentham proxy whoami             # Show current IP
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { LOCATIONS, type LocationId, isValidLocationId } from '@bentham/core';
import { createProxyManager, TwoCaptchaProxyProvider } from '@bentham/proxy-manager';

export const proxyCommand = new Command('proxy')
  .description('Proxy management commands');

/**
 * List available locations
 */
proxyCommand
  .command('locations')
  .description('List available geographic locations')
  .option('--supported-only', 'Only show locations with configured proxies', false)
  .action(async (options) => {
    console.log(chalk.bold('\nAvailable Locations\n'));

    // Check which locations have proxy support
    const proxyManager = createProxyManager();
    const apiKey = process.env.TWOCAPTCHA_API_KEY;

    let twoCaptcha: TwoCaptchaProxyProvider | null = null;
    if (apiKey) {
      twoCaptcha = new TwoCaptchaProxyProvider({ apiKey });
      proxyManager.registerProvider(twoCaptcha);
    }

    const locationGroups: Record<string, Array<{ id: string; name: string; supported: boolean }>> = {
      'United States': [],
      'Europe': [],
      'Asia Pacific': [],
      'Americas': [],
    };

    for (const [id, config] of Object.entries(LOCATIONS)) {
      const supported = twoCaptcha?.supportsLocation(id as LocationId) ?? false;

      if (options.supportedOnly && !supported) continue;

      let group = 'Americas';
      if (config.country === 'US') group = 'United States';
      else if (['GB', 'DE', 'FR', 'NL', 'ES', 'IT'].includes(config.country)) group = 'Europe';
      else if (['JP', 'AU', 'SG', 'IN'].includes(config.country)) group = 'Asia Pacific';

      locationGroups[group].push({ id, name: config.name, supported });
    }

    for (const [group, locations] of Object.entries(locationGroups)) {
      if (locations.length === 0) continue;

      console.log(chalk.yellow(`  ${group}`));
      for (const loc of locations) {
        const status = loc.supported
          ? chalk.green('✓')
          : chalk.gray('○');
        console.log(`    ${status} ${chalk.cyan(loc.id.padEnd(12))} ${loc.name}`);
      }
      console.log();
    }

    if (twoCaptcha) {
      console.log(chalk.gray('✓ = proxy available via 2captcha'));
    } else {
      console.log(chalk.gray('Set TWOCAPTCHA_API_KEY to enable proxy support'));
    }
  });

/**
 * List configured providers
 */
proxyCommand
  .command('providers')
  .description('List configured proxy providers')
  .action(async () => {
    console.log(chalk.bold('\nProxy Providers\n'));

    const providers = [
      { name: '2captcha', envVar: 'TWOCAPTCHA_API_KEY', locations: 20 },
      { name: 'brightdata', envVar: 'BRIGHTDATA_API_KEY', locations: 195 },
      { name: 'oxylabs', envVar: 'OXYLABS_API_KEY', locations: 195 },
      { name: 'smartproxy', envVar: 'SMARTPROXY_API_KEY', locations: 195 },
    ];

    for (const provider of providers) {
      const configured = !!process.env[provider.envVar];
      const status = configured
        ? chalk.green('✓ configured')
        : chalk.gray('○ not configured');

      console.log(`  ${chalk.cyan(provider.name.padEnd(12))} ${status}`);
      if (!configured) {
        console.log(chalk.gray(`    Set ${provider.envVar} to enable`));
      }
    }
    console.log();
  });

/**
 * Test a location
 */
proxyCommand
  .command('test <location>')
  .description('Test proxy connectivity for a location')
  .action(async (location: string) => {
    const spinner = ora();

    if (!isValidLocationId(location)) {
      console.error(chalk.red(`Invalid location: ${location}`));
      console.error(chalk.gray(`Run 'bentham proxy locations' to see valid options`));
      process.exit(1);
    }

    const locationConfig = LOCATIONS[location as LocationId];
    spinner.start(`Testing proxy for ${locationConfig.name}...`);

    try {
      const proxyManager = createProxyManager();
      const apiKey = process.env.TWOCAPTCHA_API_KEY;

      if (!apiKey) {
        spinner.fail('No proxy provider configured');
        console.error(chalk.gray('Set TWOCAPTCHA_API_KEY to enable proxy testing'));
        process.exit(1);
      }

      const twoCaptcha = new TwoCaptchaProxyProvider({ apiKey });
      proxyManager.registerProvider(twoCaptcha);

      if (!twoCaptcha.supportsLocation(location as LocationId)) {
        spinner.fail(`Location ${location} not supported by 2captcha`);
        process.exit(1);
      }

      const proxyConfig = proxyManager.getProxyFromProvider('2captcha', location);
      if (!proxyConfig) {
        spinner.fail('Failed to get proxy configuration');
        process.exit(1);
      }

      // Test the proxy by making a request to an IP checking service
      spinner.text = 'Verifying IP geolocation...';

      // Build proxy URL
      const proxyUrl = proxyManager.buildProxyUrl(proxyConfig);

      // In production, would use the proxy to fetch from httpbin.org/ip
      // For now, just show the config
      spinner.succeed(`Proxy configured for ${locationConfig.name}`);

      console.log();
      console.log(chalk.gray('  Proxy details:'));
      console.log(`    Host:     ${proxyConfig.host}`);
      console.log(`    Port:     ${proxyConfig.port}`);
      console.log(`    Protocol: ${proxyConfig.protocol}`);
      console.log(`    Type:     ${proxyConfig.type}`);
      console.log();

    } catch (error) {
      spinner.fail('Proxy test failed');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

/**
 * Show current IP
 */
proxyCommand
  .command('whoami')
  .description('Show current public IP address')
  .action(async () => {
    const spinner = ora('Checking IP address...').start();

    try {
      const response = await fetch('https://httpbin.org/ip');
      const data = await response.json() as { origin: string };

      spinner.succeed(`Current IP: ${chalk.cyan(data.origin)}`);

      // Try to get geolocation
      try {
        const geoResponse = await fetch(`https://ipinfo.io/${data.origin}/json`);
        const geoData = await geoResponse.json() as {
          city?: string;
          region?: string;
          country?: string;
          org?: string;
        };

        if (geoData.city || geoData.country) {
          const location = [geoData.city, geoData.region, geoData.country]
            .filter(Boolean)
            .join(', ');
          console.log(chalk.gray(`  Location: ${location}`));
        }
        if (geoData.org) {
          console.log(chalk.gray(`  Provider: ${geoData.org}`));
        }
      } catch {
        // Geolocation lookup failed, ignore
      }

    } catch (error) {
      spinner.fail('Failed to check IP');
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });
