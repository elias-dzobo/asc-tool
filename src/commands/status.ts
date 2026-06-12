/**
 * asc-tool status — audit what's set up vs missing for the current project.
 */
import chalk from 'chalk';
import ora from 'ora';
import { loadCredentials, loadConfig, hasCredentials, configExists } from '../config';
import { createClient } from '../client';
import { findAppByBundleId } from '../api/apps';
import { listSubscriptionGroups, listSubscriptions } from '../api/subscriptions';
import { listSandboxTesters } from '../api/sandbox';

type StatusLine = { label: string; ok: boolean; detail?: string };

function printStatus(lines: StatusLine[]): void {
  for (const line of lines) {
    const icon   = line.ok ? chalk.green('✓') : chalk.red('✗');
    const detail = line.detail ? chalk.gray(` — ${line.detail}`) : '';
    console.log(`  ${icon}  ${line.label}${detail}`);
  }
}

export async function runStatus(opts: { configPath?: string } = {}): Promise<void> {
  console.log(chalk.bold('\n📊  App Store Connect Status\n'));

  const lines: StatusLine[] = [];

  // ── Local setup ──────────────────────────────────────────────────────────────
  lines.push({ label: 'asc-tool credentials', ok: hasCredentials() });
  lines.push({
    label: 'asc.config.json',
    ok: configExists(opts.configPath),
    detail: configExists(opts.configPath) ? process.cwd() : 'run: asc-tool config init',
  });

  console.log(chalk.bold('Local:\n'));
  printStatus(lines);

  if (!hasCredentials() || !configExists(opts.configPath)) {
    console.log(chalk.yellow('\nFix local issues first, then re-run status.'));
    return;
  }

  // ── Remote (ASC API) ─────────────────────────────────────────────────────────
  const creds  = loadCredentials();
  const config = loadConfig(opts.configPath);
  const client = createClient(creds);

  console.log(chalk.bold('\nApp Store Connect:\n'));
  const remoteLines: StatusLine[] = [];

  // 1. App
  const appSpinner = ora({ text: 'Checking app…', isSilent: true }).start();
  let appId: string | null = null;
  try {
    const app = await findAppByBundleId(client, config.app.bundleId);
    appId = app?.id ?? null;
    remoteLines.push({
      label: `App: ${config.app.name}`,
      ok: Boolean(app),
      detail: app ? `ID ${app.id}` : `bundle ID ${config.app.bundleId} not found`,
    });
    appSpinner.stop();
  } catch (err) {
    appSpinner.stop();
    remoteLines.push({ label: 'App', ok: false, detail: (err as Error).message });
  }

  // 2. Subscriptions
  if (config.subscriptions && appId) {
    const subSpinner = ora({ text: 'Checking subscriptions…', isSilent: true }).start();
    try {
      const groups = await listSubscriptionGroups(client, appId);
      const group  = groups.find(
        g => g.attributes.referenceName === config.subscriptions!.groupReferenceName,
      );

      remoteLines.push({
        label: `Subscription group: ${config.subscriptions.groupName}`,
        ok: Boolean(group),
        detail: group ? `ID ${group.id}` : 'not found',
      });

      if (group) {
        const subs = await listSubscriptions(client, group.id);
        const subIds = new Set(subs.map(s => s.attributes.productId));
        for (const product of config.subscriptions.products) {
          remoteLines.push({
            label: `  Product: ${product.productId}`,
            ok: subIds.has(product.productId),
            detail: subIds.has(product.productId)
              ? subs.find(s => s.attributes.productId === product.productId)?.attributes.state
              : 'not found',
          });
        }
      }
      subSpinner.stop();
    } catch (err) {
      subSpinner.stop();
      remoteLines.push({ label: 'Subscriptions', ok: false, detail: (err as Error).message });
    }
  }

  // 3. Sandbox testers
  if (config.sandboxTesters?.length) {
    const sbSpinner = ora({ text: 'Checking sandbox testers…', isSilent: true }).start();
    try {
      const testers = await listSandboxTesters(client);
      const emails  = new Set(testers.map(t => t.attributes.email));
      for (const tester of config.sandboxTesters) {
        remoteLines.push({
          label: `Sandbox tester: ${tester.email}`,
          ok: emails.has(tester.email),
          detail: emails.has(tester.email) ? 'active' : 'not found',
        });
      }
      sbSpinner.stop();
    } catch (err) {
      sbSpinner.stop();
      const msg = (err as Error).message;
      const isPermission = msg.includes('does not exist') || msg.includes('FORBIDDEN') || msg.includes('403');
      remoteLines.push({
        label: 'Sandbox testers',
        ok: true, // treat as non-blocking — API key may lack Account Holder role
        detail: isPermission
          ? 'API key lacks Account Holder role — manage at ASC → Users and Access → Sandbox'
          : msg,
      });
    }
  }

  printStatus(remoteLines);

  const allOk = remoteLines.every(l => l.ok);
  console.log(
    allOk
      ? chalk.green('\n✅  Everything is set up!')
      : chalk.yellow('\n⚠  Some items need attention. Run: asc-tool setup'),
  );
}
