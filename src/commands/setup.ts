/**
 * asc-tool setup — full project setup orchestrator.
 * Runs: app → subscriptions → sandbox tester, skipping steps that already exist.
 */
import chalk from 'chalk';
import ora from 'ora';
import { loadCredentials, loadConfig } from '../config';
import { createClient } from '../client';
import { findAppByBundleId, createApp, updateAppInfo, updateStoreListing } from '../api/apps';
import { setupSubscriptions } from '../api/subscriptions';
import { findSandboxTesterByEmail, createSandboxTester } from '../api/sandbox';

export interface SetupOptions {
  configPath?: string;
  skipApp?: boolean;
  skipIap?: boolean;
  skipSandbox?: boolean;
  dryRun?: boolean;
}

export async function runSetup(opts: SetupOptions = {}): Promise<void> {
  console.log(chalk.bold('\n🚀  App Store Connect Setup\n'));

  const creds  = loadCredentials();
  const config = loadConfig(opts.configPath);
  const client = createClient(creds);

  if (opts.dryRun) {
    console.log(chalk.yellow('DRY RUN — no changes will be made\n'));
  }

  const results: Record<string, string> = {};

  // ── Always resolve app ID (needed for IAP setup even when --skip-app) ────────
  {
    const spinner = ora(`Looking up app: ${config.app.bundleId}`).start();
    try {
      const app = await findAppByBundleId(client, config.app.bundleId);
      if (app) {
        results['appId'] = app.id;
        spinner.succeed(`App found — ID: ${chalk.cyan(app.id)}`);
      } else {
        spinner.warn(`App not found in ASC — bundle ID ${config.app.bundleId} not registered`);
      }
    } catch (err) {
      spinner.fail(`App lookup failed: ${(err as Error).message}`);
    }
  }

  // ── 1. App metadata ──────────────────────────────────────────────────────────
  if (!opts.skipApp && results['appId']) {
    const appId = results['appId'];
    const metaSpinner = ora('Updating app metadata').start();
    try {
      await updateAppInfo(client, appId, config.app);
      await updateStoreListing(client, appId, config.app);
      metaSpinner.succeed('App metadata updated');
    } catch (err) {
      metaSpinner.warn(`Metadata update skipped: ${(err as Error).message}`);
    }
  }

  // ── 2. Subscriptions ─────────────────────────────────────────────────────────
  if (!opts.skipIap && config.subscriptions) {
    const appId = results['appId'];
    if (!appId) {
      console.log(chalk.yellow('⚠  Skipping IAP — no app ID (did --skip-app run without an existing app?)'));
    } else {
      const spinner = ora(`Subscriptions: ${config.subscriptions.groupName}`).start();
      try {
        if (opts.dryRun) {
          spinner.succeed(
            `Would create group "${config.subscriptions.groupName}" with ` +
            `${config.subscriptions.products.length} products`
          );
        } else {
          const res = await setupSubscriptions(client, appId, config.subscriptions);
          const parts: string[] = [];
          if (res.created.length) parts.push(chalk.green(`created: ${res.created.join(', ')}`));
          if (res.skipped.length) parts.push(chalk.gray(`skipped: ${res.skipped.join(', ')}`));
          spinner.succeed(`Subscriptions — ${parts.join(' | ')}`);
        }
      } catch (err) {
        spinner.fail(`IAP setup failed: ${(err as Error).message}`);
      }
    }
  } else if (!config.subscriptions) {
    console.log(chalk.gray('  (no subscriptions configured in asc.config.json)'));
  }

  // ── 3. Sandbox testers ───────────────────────────────────────────────────────
  if (!opts.skipSandbox && config.sandboxTesters?.length) {
    for (const tester of config.sandboxTesters) {
      const spinner = ora(`Sandbox tester: ${tester.email}`).start();
      try {
        if (opts.dryRun) {
          spinner.succeed(`Would create sandbox tester: ${tester.email}`);
          continue;
        }
        const existing = await findSandboxTesterByEmail(client, tester.email);
        if (existing) {
          spinner.succeed(`Sandbox tester exists: ${chalk.cyan(tester.email)}`);
        } else {
          await createSandboxTester(client, tester);
          spinner.succeed(`Sandbox tester created: ${chalk.cyan(tester.email)}`);
        }
      } catch (err) {
        const msg = (err as Error).message;
        const isPermission = msg.includes('does not exist') || msg.includes('FORBIDDEN') || msg.includes('403');
        if (isPermission) {
          spinner.warn(
            `Sandbox tester skipped — API key lacks Account Holder/Admin role.\n` +
            `  ℹ  Add manually: App Store Connect → Users and Access → Sandbox → Testers\n` +
            `     Email: ${tester.email}  Password: ${tester.password}`
          );
        } else {
          spinner.fail(`Sandbox tester failed: ${msg}`);
        }
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(chalk.bold('\n✅  Setup complete\n'));

  if (results['appId']) {
    console.log(chalk.gray(`App Store Connect → https://appstoreconnect.apple.com/apps/${results['appId']}`));
  }

  console.log(chalk.gray('\nNext steps:'));
  console.log(chalk.gray('  1. Add app screenshots in App Store Connect'));
  console.log(chalk.gray('  2. Attach your RevenueCat products to the subscriptions'));
  console.log(chalk.gray('  3. Run: eas build --platform ios'));
}
