/**
 * asc-tool config init — interactive project config generator.
 * Creates asc.config.json in the current working directory.
 */
import prompts from 'prompts';
import chalk from 'chalk';
import { saveConfig, configExists, generateConfigTemplate } from '../config';

export async function runConfigInit(opts: { force?: boolean }): Promise<void> {
  console.log(chalk.bold('\n📋  Create asc.config.json\n'));

  if (configExists() && !opts.force) {
    console.log(chalk.yellow('asc.config.json already exists in this directory.'));
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'Overwrite?',
      initial: false,
    });
    if (!overwrite) { console.log('Keeping existing config.'); return; }
  }

  const answers = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'App name',
      hint: 'e.g. Ramble',
      validate: (v: string) => v.length > 0 || 'Required',
    },
    {
      type: 'text',
      name: 'bundleId',
      message: 'Bundle ID',
      hint: 'e.g. com.ramble.app',
      validate: (v: string) =>
        /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*){1,}$/.test(v) ||
        'Must be a valid reverse-domain identifier',
    },
    {
      type: 'text',
      name: 'category',
      message: 'Primary category',
      hint: 'HEALTH_AND_FITNESS / EDUCATION / UTILITIES / PRODUCTIVITY / ...',
      initial: 'UTILITIES',
    },
    {
      type: 'confirm',
      name: 'addSubs',
      message: 'Add subscription products?',
      initial: true,
    },
  ], { onCancel: () => process.exit(0) });

  const config = generateConfigTemplate({
    name: answers.name as string,
    bundleId: answers.bundleId as string,
  });

  config.app.category = answers.category as string;

  if (!answers.addSubs) {
    delete config.subscriptions;
  }

  saveConfig(config);

  console.log(chalk.green(`\n✓ Created asc.config.json`));
  console.log(chalk.gray('\nEdit it to customise descriptions, pricing tiers, etc.'));
  console.log(chalk.gray('Then run:\n'));
  console.log(`  ${chalk.bold('asc-tool setup')}   — run full setup (app + IAP + sandbox tester)`);
}

export function runConfigShow(): void {
  const { loadConfig } = require('../config');
  try {
    const config = loadConfig();
    console.log(chalk.bold('\nasc.config.json:\n'));
    console.log(JSON.stringify(config, null, 2));
  } catch (err) {
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
}
