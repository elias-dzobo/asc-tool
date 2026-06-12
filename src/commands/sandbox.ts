/**
 * asc-tool sandbox add — create sandbox test accounts from config.
 */
import chalk from 'chalk';
import ora from 'ora';
import { loadCredentials, loadConfig } from '../config';
import { createClient } from '../client';
import { findSandboxTesterByEmail, createSandboxTester } from '../api/sandbox';

export async function runSandboxAdd(opts: { configPath?: string } = {}): Promise<void> {
  console.log(chalk.bold('\n🧪  Sandbox Tester Setup\n'));

  const creds  = loadCredentials();
  const config = loadConfig(opts.configPath);
  const client = createClient(creds);

  if (!config.sandboxTesters?.length) {
    console.log(chalk.yellow('No sandbox testers defined in asc.config.json'));
    console.log(chalk.gray('Add a "sandboxTesters" array and re-run.'));
    return;
  }

  for (const tester of config.sandboxTesters) {
    const spinner = ora(`Tester: ${tester.email}`).start();
    try {
      const existing = await findSandboxTesterByEmail(client, tester.email);
      if (existing) {
        spinner.succeed(`Already exists: ${chalk.cyan(tester.email)}`);
      } else {
        await createSandboxTester(client, tester);
        spinner.succeed(`Created: ${chalk.cyan(tester.email)}  password: ${chalk.gray(tester.password)}`);
      }
    } catch (err) {
      spinner.fail(`Failed (${tester.email}): ${(err as Error).message}`);
    }
  }

  console.log(chalk.bold('\n✅  Sandbox setup complete\n'));
  console.log(chalk.gray('Use these accounts in Settings → App Store → Sandbox Account on your device.'));
}
