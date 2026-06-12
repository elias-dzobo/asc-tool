#!/usr/bin/env node
/**
 * asc-tool — App Store Connect automation CLI
 *
 * Usage:
 *   asc-tool auth              Configure API credentials
 *   asc-tool auth show         Show stored credentials
 *   asc-tool config init       Create asc.config.json interactively
 *   asc-tool config show       Print current config
 *   asc-tool setup             Run full project setup (app + IAP + sandbox)
 *   asc-tool setup --dry-run   Preview what would be created
 *   asc-tool setup --skip-app  Only run IAP + sandbox setup
 *   asc-tool status            Audit what's configured vs missing
 *   asc-tool iap setup         Only run subscription setup
 *   asc-tool sandbox add       Only add sandbox testers
 */
import { Command } from 'commander';
import chalk from 'chalk';

import { runAuth, runAuthShow } from './commands/auth';
import { runConfigInit, runConfigShow } from './commands/config';
import { runSetup } from './commands/setup';
import { runStatus } from './commands/status';
import { runIapSetup } from './commands/iap';
import { runSandboxAdd } from './commands/sandbox';

const program = new Command();

program
  .name('asc-tool')
  .description('Automate App Store Connect setup via the REST API')
  .version('1.0.0');

// ── auth ─────────────────────────────────────────────────────────────────────
const auth = program.command('auth').description('Manage API credentials');

auth
  .command('configure', { isDefault: true })
  .description('Configure App Store Connect API key (interactive)')
  .action(() => runAuth().catch(fatalError));

auth
  .command('show')
  .description('Show stored credentials')
  .action(() => runAuthShow().catch(fatalError));

// Make `asc-tool auth` with no subcommand also run configure
auth.action(() => runAuth().catch(fatalError));

// ── config ────────────────────────────────────────────────────────────────────
const config = program.command('config').description('Manage project config (asc.config.json)');

config
  .command('init', { isDefault: true })
  .description('Create asc.config.json interactively')
  .option('-f, --force', 'Overwrite existing config')
  .action(opts => runConfigInit(opts).catch(fatalError));

config
  .command('show')
  .description('Print the current asc.config.json')
  .action(() => { runConfigShow(); });

config.action(() => runConfigInit({}).catch(fatalError));

// ── setup ─────────────────────────────────────────────────────────────────────
program
  .command('setup')
  .description('Full project setup: app + subscriptions + sandbox tester')
  .option('-c, --config <path>', 'Path to asc.config.json')
  .option('--skip-app',    'Skip app creation step')
  .option('--skip-iap',    'Skip subscription/IAP setup step')
  .option('--skip-sandbox','Skip sandbox tester creation step')
  .option('--dry-run',     'Preview what would be created without making changes')
  .action(opts =>
    runSetup({
      configPath:  opts.config,
      skipApp:     opts.skipApp,
      skipIap:     opts.skipIap,
      skipSandbox: opts.skipSandbox,
      dryRun:      opts.dryRun,
    }).catch(fatalError),
  );

// ── iap ───────────────────────────────────────────────────────────────────────
const iap = program.command('iap').description('Manage in-app purchases / subscriptions');

iap
  .command('setup', { isDefault: true })
  .description('Create subscription group + products from asc.config.json')
  .option('-c, --config <path>', 'Path to asc.config.json')
  .action(opts => runIapSetup({ configPath: opts.config }).catch(fatalError));

iap.action(opts => runIapSetup({ configPath: opts.config }).catch(fatalError));

// ── sandbox ───────────────────────────────────────────────────────────────────
const sandbox = program.command('sandbox').description('Manage sandbox test accounts');

sandbox
  .command('add', { isDefault: true })
  .description('Create sandbox testers from asc.config.json')
  .option('-c, --config <path>', 'Path to asc.config.json')
  .action(opts => runSandboxAdd({ configPath: opts.config }).catch(fatalError));

sandbox.action(opts => runSandboxAdd({ configPath: opts.config }).catch(fatalError));

// ── status ────────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Audit what is configured vs missing')
  .option('-c, --config <path>', 'Path to asc.config.json')
  .action(opts => runStatus({ configPath: opts.config }).catch(fatalError));

// ─────────────────────────────────────────────────────────────────────────────

function fatalError(err: Error): void {
  console.error(chalk.red(`\nError: ${err.message}`));
  process.exit(1);
}

program.parse(process.argv);
