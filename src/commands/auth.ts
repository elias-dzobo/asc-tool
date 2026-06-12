/**
 * asc-tool auth
 * Interactively configure App Store Connect API credentials.
 * Saved to ~/.asc-tool/credentials.json
 */
import prompts from 'prompts';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { saveCredentials, hasCredentials, loadCredentials } from '../config';
import { generateToken } from '../auth';
import { createClient } from '../client';

export async function runAuth(): Promise<void> {
  console.log(chalk.bold('\n🔑  App Store Connect API Credentials\n'));
  console.log(chalk.gray(
    'Get these from App Store Connect → Users and Access → Integrations → App Store Connect API\n' +
    'You need a key with App Manager role or higher.\n'
  ));

  if (hasCredentials()) {
    const existing = loadCredentials();
    console.log(chalk.yellow(`Existing credentials found (Key ID: ${existing.keyId})`));
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'Overwrite?',
      initial: false,
    });
    if (!overwrite) { console.log('Keeping existing credentials.'); return; }
  }

  const answers = await prompts([
    {
      type: 'text',
      name: 'issuerId',
      message: 'Issuer ID',
      hint: 'e.g. 57246542-96fe-1a63-e053-0824d011072a',
      validate: v => v.length > 0 || 'Required',
    },
    {
      type: 'text',
      name: 'keyId',
      message: 'Key ID',
      hint: 'e.g. 2X9R4HXF34',
      validate: v => v.length > 0 || 'Required',
    },
    {
      type: 'text',
      name: 'privateKeyPath',
      message: 'Path to .p8 private key file',
      hint: 'e.g. ~/Downloads/AuthKey_2X9R4HXF34.p8',
      initial: `${process.env.HOME}/Downloads/`,
      validate: (v: string) => {
        const resolved = v.replace('~', process.env.HOME ?? '');
        return fs.existsSync(resolved) || `File not found: ${resolved}`;
      },
    },
  ], { onCancel: () => process.exit(0) });

  const creds = {
    issuerId: answers.issuerId as string,
    keyId: answers.keyId as string,
    privateKeyPath: (answers.privateKeyPath as string).replace('~', process.env.HOME ?? ''),
  };

  // Test the credentials before saving
  process.stdout.write(chalk.gray('Testing credentials… '));
  try {
    const client = createClient(creds);
    await client.get('/apps', { params: { limit: 1 } });
    console.log(chalk.green('✓ Valid'));
  } catch (err) {
    console.log(chalk.red('✗ Failed'));
    console.error(chalk.red(`\nCredential test failed: ${(err as Error).message}`));
    console.log(chalk.yellow('\nCredentials NOT saved. Check your Key ID, Issuer ID, and .p8 file.'));
    return;
  }

  saveCredentials(creds);
  console.log(chalk.green(`\n✓ Credentials saved to ~/.asc-tool/credentials.json`));
}

export async function runAuthShow(): Promise<void> {
  if (!hasCredentials()) {
    console.log(chalk.yellow('No credentials configured. Run: asc-tool auth'));
    return;
  }
  const creds = loadCredentials();
  console.log(chalk.bold('\nStored credentials:'));
  console.log(`  Issuer ID:  ${creds.issuerId}`);
  console.log(`  Key ID:     ${creds.keyId}`);
  console.log(`  Key file:   ${creds.privateKeyPath}`);
  console.log(`  File exists: ${fs.existsSync(creds.privateKeyPath) ? chalk.green('yes') : chalk.red('NO — file missing!')}`);
}
