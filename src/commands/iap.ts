/**
 * asc-tool iap setup — standalone IAP/subscription setup command.
 */
import chalk from 'chalk';
import ora from 'ora';
import { loadCredentials, loadConfig } from '../config';
import { createClient } from '../client';
import { findAppByBundleId } from '../api/apps';
import { setupSubscriptions } from '../api/subscriptions';

export async function runIapSetup(opts: { configPath?: string } = {}): Promise<void> {
  console.log(chalk.bold('\n💳  Subscription Setup\n'));

  const creds  = loadCredentials();
  const config = loadConfig(opts.configPath);
  const client = createClient(creds);

  if (!config.subscriptions) {
    console.log(chalk.yellow('No subscriptions defined in asc.config.json'));
    console.log(chalk.gray('Add a "subscriptions" block and re-run.'));
    return;
  }

  // Find the app
  const appSpinner = ora(`Finding app: ${config.app.bundleId}`).start();
  const app = await findAppByBundleId(client, config.app.bundleId);
  if (!app) {
    appSpinner.fail(`App not found: ${config.app.bundleId}`);
    console.log(chalk.yellow('Run: asc-tool setup --skip-iap first to create the app.'));
    process.exit(1);
  }
  appSpinner.succeed(`App: ${app.attributes.name} (${app.id})`);

  // Setup subscriptions
  const subSpinner = ora(`Setting up subscription group: ${config.subscriptions.groupName}`).start();
  try {
    const result = await setupSubscriptions(client, app.id, config.subscriptions);

    const parts: string[] = [];
    if (result.created.length) parts.push(chalk.green(`created: ${result.created.join(', ')}`));
    if (result.skipped.length) parts.push(chalk.gray(`skipped: ${result.skipped.join(', ')}`));

    subSpinner.succeed(`Subscriptions — ${parts.join(' | ')}`);
    console.log(chalk.bold('\n✅  IAP setup complete\n'));
    console.log(chalk.gray('Next: attach these product IDs to your RevenueCat packages.'));
  } catch (err) {
    subSpinner.fail(`Failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
