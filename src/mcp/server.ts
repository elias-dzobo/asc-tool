#!/usr/bin/env node
/**
 * asc-tool MCP server — exposes App Store Connect operations as MCP tools
 * so Claude can drive ASC setup directly in conversation.
 *
 * Transport: stdio (standard for Claude Code MCP servers)
 *
 * Add to ~/.claude/claude_desktop_config.json (or project .claude/settings.json):
 * {
 *   "mcpServers": {
 *     "asc-tool": {
 *       "command": "node",
 *       "args": ["/path/to/asc-tool/dist/mcp/server.js"]
 *     }
 *   }
 * }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadCredentials, loadConfig, hasCredentials, configExists, saveCredentials, generateConfigTemplate, saveConfig } from '../config';
import { createClient } from '../client';
import { findAppByBundleId, createApp, updateAppInfo, updateStoreListing } from '../api/apps';
import { setupSubscriptions, listSubscriptionGroups, listSubscriptions } from '../api/subscriptions';
import { findSandboxTesterByEmail, createSandboxTester, listSandboxTesters } from '../api/sandbox';

const server = new McpServer({
  name: 'asc-tool',
  version: '1.0.0',
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function getClient() {
  const creds = loadCredentials();
  return createClient(creds);
}

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

function err(message: string): { content: [{ type: 'text'; text: string }]; isError: true } {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

// ─── Tool: asc_status ────────────────────────────────────────────────────────
server.tool(
  'asc_status',
  'Check what is configured in App Store Connect for the current project. Returns a status report of app, subscriptions, and sandbox testers.',
  {
    config_path: z.string().optional().describe('Path to asc.config.json (defaults to cwd)'),
  },
  async ({ config_path }) => {
    try {
      const report: Record<string, unknown> = {};

      report['credentials'] = hasCredentials() ? 'configured' : 'MISSING — run asc_configure_auth';
      report['config_file'] = configExists(config_path) ? 'found' : 'MISSING — run asc_init_config';

      if (!hasCredentials() || !configExists(config_path)) {
        return ok(report);
      }

      const config = loadConfig(config_path);
      const client = getClient();

      // App
      const app = await findAppByBundleId(client, config.app.bundleId);
      report['app'] = app
        ? { status: 'exists', id: app.id, name: app.attributes.name }
        : { status: 'MISSING', bundleId: config.app.bundleId };

      // Subscriptions
      if (config.subscriptions && app) {
        const groups = await listSubscriptionGroups(client, app.id);
        const group  = groups.find(g => g.attributes.referenceName === config.subscriptions!.groupReferenceName);

        if (group) {
          const subs = await listSubscriptions(client, group.id);
          const subMap = Object.fromEntries(subs.map(s => [s.attributes.productId, s.attributes.state]));
          report['subscription_group'] = { status: 'exists', id: group.id, products: subMap };
        } else {
          report['subscription_group'] = { status: 'MISSING', name: config.subscriptions.groupName };
        }
      }

      // Sandbox testers
      if (config.sandboxTesters?.length) {
        const testers = await listSandboxTesters(client);
        const emails  = new Set(testers.map(t => t.attributes.email));
        report['sandbox_testers'] = config.sandboxTesters.map(t => ({
          email: t.email,
          status: emails.has(t.email) ? 'exists' : 'MISSING',
        }));
      }

      return ok(report);
    } catch (e) {
      return err((e as Error).message);
    }
  },
);

// ─── Tool: asc_configure_auth ─────────────────────────────────────────────────
server.tool(
  'asc_configure_auth',
  'Save App Store Connect API credentials (Key ID, Issuer ID, path to .p8 file). Credentials are stored globally in ~/.asc-tool/credentials.json and reused across all projects.',
  {
    key_id:           z.string().describe('Key ID from App Store Connect (e.g. 2X9R4HXF34)'),
    issuer_id:        z.string().describe('Issuer ID from App Store Connect (UUID format)'),
    private_key_path: z.string().describe('Absolute path to the downloaded .p8 private key file'),
  },
  async ({ key_id, issuer_id, private_key_path }) => {
    try {
      const creds = {
        keyId: key_id,
        issuerId: issuer_id,
        privateKeyPath: private_key_path.replace('~', process.env.HOME ?? ''),
      };

      // Validate by making a real API call
      const client = createClient(creds);
      await client.get('/apps', { params: { limit: 1 } });

      saveCredentials(creds);
      return ok('Credentials saved and validated successfully. You can now use all asc_* tools.');
    } catch (e) {
      return err(`Credential validation failed: ${(e as Error).message}\nCheck your Key ID, Issuer ID, and that the .p8 file exists at the given path.`);
    }
  },
);

// ─── Tool: asc_init_config ────────────────────────────────────────────────────
server.tool(
  'asc_init_config',
  'Generate an asc.config.json file for a new project. Creates a fully populated config with app details and subscription products ready to be customised.',
  {
    name:        z.string().describe('App display name (e.g. "Ramble")'),
    bundle_id:   z.string().describe('Bundle ID (e.g. "com.ramble.app")'),
    category:    z.string().optional().default('UTILITIES').describe('App Store category (e.g. HEALTH_AND_FITNESS, EDUCATION, UTILITIES, PRODUCTIVITY)'),
    config_path: z.string().optional().describe('Where to write asc.config.json (defaults to ./asc.config.json)'),
  },
  async ({ name, bundle_id, category, config_path }) => {
    try {
      const config = generateConfigTemplate({ name, bundleId: bundle_id });
      config.app.category = category ?? 'UTILITIES';
      saveConfig(config, config_path);
      return ok({
        message: `Created asc.config.json for ${name} (${bundle_id})`,
        path: config_path ?? `${process.cwd()}/asc.config.json`,
        next_step: 'Review and customise the config, then call asc_setup to create everything.',
        config,
      });
    } catch (e) {
      return err((e as Error).message);
    }
  },
);

// ─── Tool: asc_setup_app ─────────────────────────────────────────────────────
server.tool(
  'asc_setup_app',
  'Confirm the app exists in App Store Connect and update its metadata (category, store listing). NOTE: The ASC REST API does not support creating new apps — apps must first be created manually at appstoreconnect.apple.com → New App. The bundle ID must also be registered at developer.apple.com first.',
  {
    config_path: z.string().optional().describe('Path to asc.config.json'),
  },
  async ({ config_path }) => {
    try {
      const config = loadConfig(config_path);
      const client = getClient();

      let app = await findAppByBundleId(client, config.app.bundleId);
      let created = false;

      if (!app) {
        app = await createApp(client, config.app);
        created = true;
      }

      // Update metadata (non-fatal if it fails)
      const metaResults: string[] = [];
      try {
        await updateAppInfo(client, app.id, config.app);
        metaResults.push('category updated');
      } catch (e) {
        metaResults.push(`category skipped: ${(e as Error).message}`);
      }
      try {
        await updateStoreListing(client, app.id, config.app);
        metaResults.push('store listing updated');
      } catch (e) {
        metaResults.push(`store listing skipped: ${(e as Error).message}`);
      }

      return ok({
        status: created ? 'created' : 'already_exists',
        app_id: app.id,
        name: app.attributes.name,
        bundle_id: app.attributes.bundleId,
        metadata: metaResults,
      });
    } catch (e) {
      return err((e as Error).message);
    }
  },
);

// ─── Tool: asc_setup_iap ─────────────────────────────────────────────────────
server.tool(
  'asc_setup_iap',
  'Create the subscription group and auto-renewable subscription products defined in asc.config.json. Skips products that already exist.',
  {
    config_path: z.string().optional().describe('Path to asc.config.json'),
  },
  async ({ config_path }) => {
    try {
      const config = loadConfig(config_path);
      const client = getClient();

      if (!config.subscriptions) {
        return ok('No subscriptions defined in asc.config.json — nothing to do.');
      }

      const app = await findAppByBundleId(client, config.app.bundleId);
      if (!app) {
        return err(`App ${config.app.bundleId} not found in App Store Connect. Run asc_setup_app first.`);
      }

      const result = await setupSubscriptions(client, app.id, config.subscriptions);

      return ok({
        group_id:   result.groupId,
        group_name: result.groupName,
        created:    result.created,
        skipped:    result.skipped,
        message: result.created.length
          ? `Created ${result.created.length} product(s). Attach these to your RevenueCat packages.`
          : 'All products already exist.',
      });
    } catch (e) {
      return err((e as Error).message);
    }
  },
);

// ─── Tool: asc_setup_sandbox ─────────────────────────────────────────────────
server.tool(
  'asc_setup_sandbox',
  'Create sandbox test accounts from asc.config.json. Use these accounts on a physical device to test in-app purchases without being charged.',
  {
    config_path: z.string().optional().describe('Path to asc.config.json'),
  },
  async ({ config_path }) => {
    try {
      const config = loadConfig(config_path);
      const client = getClient();

      if (!config.sandboxTesters?.length) {
        return ok('No sandbox testers defined in asc.config.json — nothing to do.');
      }

      const results = [];
      for (const tester of config.sandboxTesters) {
        const existing = await findSandboxTesterByEmail(client, tester.email);
        if (existing) {
          results.push({ email: tester.email, status: 'already_exists' });
        } else {
          await createSandboxTester(client, tester);
          results.push({ email: tester.email, status: 'created', password: tester.password });
        }
      }

      return ok({
        testers: results,
        instructions: 'On your device: Settings → App Store → Sandbox Account → sign in with the test email above.',
      });
    } catch (e) {
      return err((e as Error).message);
    }
  },
);

// ─── Tool: asc_setup_all ─────────────────────────────────────────────────────
server.tool(
  'asc_setup_all',
  'Run the full App Store Connect setup in one call: create app, subscription group + products, and sandbox test accounts. Safe to re-run — skips anything that already exists.',
  {
    config_path: z.string().optional().describe('Path to asc.config.json'),
    dry_run:     z.boolean().optional().default(false).describe('If true, report what would be done without making changes'),
  },
  async ({ config_path, dry_run }) => {
    try {
      const config = loadConfig(config_path);
      const client = getClient();
      const summary: Record<string, unknown> = { dry_run: dry_run ?? false };

      if (dry_run) {
        summary['would_create_app']           = config.app.name;
        summary['would_create_subscriptions'] = config.subscriptions?.products.map(p => p.productId) ?? [];
        summary['would_create_sandbox']       = config.sandboxTesters?.map(t => t.email) ?? [];
        return ok(summary);
      }

      // 1. App
      let app = await findAppByBundleId(client, config.app.bundleId);
      if (!app) {
        app = await createApp(client, config.app);
        summary['app'] = { status: 'created', id: app.id };
      } else {
        summary['app'] = { status: 'exists', id: app.id };
      }

      try { await updateAppInfo(client, app.id, config.app); } catch { /* non-fatal */ }
      try { await updateStoreListing(client, app.id, config.app); } catch { /* non-fatal */ }

      // 2. Subscriptions
      if (config.subscriptions) {
        const iapResult = await setupSubscriptions(client, app.id, config.subscriptions);
        summary['subscriptions'] = iapResult;
      }

      // 3. Sandbox testers
      if (config.sandboxTesters?.length) {
        const sandboxResults = [];
        for (const tester of config.sandboxTesters) {
          const existing = await findSandboxTesterByEmail(client, tester.email);
          if (existing) {
            sandboxResults.push({ email: tester.email, status: 'exists' });
          } else {
            await createSandboxTester(client, tester);
            sandboxResults.push({ email: tester.email, status: 'created' });
          }
        }
        summary['sandbox_testers'] = sandboxResults;
      }

      summary['next_steps'] = [
        'Add screenshots in App Store Connect before submitting',
        'Generate a separate ASC API key for RevenueCat (Developer role) and paste into RevenueCat dashboard',
        'Run: eas build --platform ios',
      ];

      return ok(summary);
    } catch (e) {
      return err((e as Error).message);
    }
  },
);

// ─── Tool: asc_list_apps ─────────────────────────────────────────────────────
server.tool(
  'asc_list_apps',
  'List all apps in your App Store Connect account.',
  {},
  async () => {
    try {
      const { listApps } = await import('../api/apps');
      const client = getClient();
      const apps   = await listApps(client);
      return ok(apps.map(a => ({
        id:          a.id,
        name:        a.attributes.name,
        bundleId:    a.attributes.bundleId,
        sku:         a.attributes.sku,
      })));
    } catch (e) {
      return err((e as Error).message);
    }
  },
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => {
  process.stderr.write(`MCP server fatal error: ${e.message}\n`);
  process.exit(1);
});
