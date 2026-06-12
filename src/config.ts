/**
 * Config management — reads asc.config.json from the current working directory
 * and ~/.asc-tool/credentials.json for API credentials.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AscConfig, AscCredentials } from './types';

const CREDENTIALS_DIR  = path.join(os.homedir(), '.asc-tool');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');
const CONFIG_FILE      = 'asc.config.json';

// ─── Credentials (global, stored in home dir) ─────────────────────────────────

export function saveCredentials(creds: AscCredentials): void {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  // Restrict permissions — contains sensitive key path
  fs.chmodSync(CREDENTIALS_FILE, 0o600);
}

export function loadCredentials(): AscCredentials {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    throw new Error(
      `No credentials found. Run:\n\n  asc-tool auth\n\nto configure your App Store Connect API key.`
    );
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8')) as AscCredentials;
}

export function hasCredentials(): boolean {
  return fs.existsSync(CREDENTIALS_FILE);
}

// ─── Project config (per project) ─────────────────────────────────────────────

export function loadConfig(configPath?: string): AscConfig {
  const filePath = configPath ?? path.resolve(process.cwd(), CONFIG_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No ${CONFIG_FILE} found in ${process.cwd()}.\n` +
      `Run:\n\n  asc-tool config init\n\nto create one interactively.`
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as AscConfig;
}

export function saveConfig(config: AscConfig, configPath?: string): void {
  const filePath = configPath ?? path.resolve(process.cwd(), CONFIG_FILE);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
}

export function configExists(configPath?: string): boolean {
  const filePath = configPath ?? path.resolve(process.cwd(), CONFIG_FILE);
  return fs.existsSync(filePath);
}

// ─── Template generator ───────────────────────────────────────────────────────

export function generateConfigTemplate(opts: {
  name: string;
  bundleId: string;
  sku?: string;
}): AscConfig {
  return {
    app: {
      name: opts.name,
      bundleId: opts.bundleId,
      sku: opts.sku ?? opts.bundleId.replace(/\./g, '-'),
      primaryLocale: 'en-US',
      category: 'UTILITIES',
      privacyPolicyUrl: `https://your-domain.com/privacy`,
      supportUrl: `https://your-domain.com/support`,
      description: `${opts.name} — your app description here.`,
      keywords: [],
    },
    subscriptions: {
      groupName: `${opts.name} Pro`,
      groupReferenceName: `${opts.name.toLowerCase().replace(/\s+/g, '-')}-pro`,
      products: [
        {
          productId: `${opts.bundleId.split('.').pop()}_monthly`,
          referenceName: 'Monthly',
          displayName: `${opts.name} Pro Monthly`,
          description: 'Full access, billed monthly.',
          duration: 'ONE_MONTH',
          trialDays: 7,
          priceTier: 5,
        },
        {
          productId: `${opts.bundleId.split('.').pop()}_annual`,
          referenceName: 'Annual',
          displayName: `${opts.name} Pro Annual`,
          description: 'Full access, billed annually. Best value.',
          duration: 'ONE_YEAR',
          trialDays: 7,
          priceTier: 40,
        },
      ],
    },
    sandboxTesters: [
      {
        firstName: 'Test',
        lastName: 'User',
        email: `test+${opts.bundleId.split('.').pop()}@yourdomain.com`,
        password: 'TestUser123!',
        territory: 'USA',
      },
    ],
  };
}
