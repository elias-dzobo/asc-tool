/**
 * /v1/apps — create and query apps.
 */
import type { AscClient } from '../client';
import type { AppConfig, AscApp } from '../types';

export async function listApps(client: AscClient): Promise<AscApp[]> {
  const res = await client.get<{ data: AscApp[] }>('/apps', {
    params: { 'fields[apps]': 'name,bundleId,sku,primaryLocale', limit: 200 },
  });
  return res.data.data;
}

export async function findAppByBundleId(
  client: AscClient,
  bundleId: string,
): Promise<AscApp | null> {
  const apps = await listApps(client);
  return apps.find(a => a.attributes.bundleId === bundleId) ?? null;
}

export async function createApp(
  client: AscClient,
  config: AppConfig,
): Promise<AscApp> {
  // Apps are tied to a registered bundle ID on the Apple Developer portal.
  // That bundle ID must already exist (EAS credentials / Xcode / dev portal).
  const res = await client.post<{ data: AscApp }>('/apps', {
    data: {
      type: 'apps',
      attributes: {
        name: config.name,
        bundleId: config.bundleId,
        sku: config.sku,
        primaryLocale: config.primaryLocale,
      },
    },
  });
  return res.data.data;
}

export async function updateAppInfo(
  client: AscClient,
  appId: string,
  config: AppConfig,
): Promise<void> {
  // 1. Get the appInfo record for this app
  const infoRes = await client.get<{ data: Array<{ id: string }> }>(
    `/apps/${appId}/appInfos`,
  );
  const infoId = infoRes.data.data[0]?.id;
  if (!infoId) throw new Error('No appInfo record found for app');

  // 2. Patch category
  await client.patch(`/appInfos/${infoId}`, {
    data: {
      type: 'appInfos',
      id: infoId,
      relationships: {
        primaryCategory: {
          data: { type: 'appCategories', id: config.category },
        },
      },
    },
  });

  // 3. Get the appInfoLocalization for primary locale and update copy
  const locRes = await client.get<{ data: Array<{ id: string }> }>(
    `/appInfos/${infoId}/appInfoLocalizations`,
    { params: { 'filter[locale]': config.primaryLocale } },
  );
  const locId = locRes.data.data[0]?.id;

  if (locId && (config.privacyPolicyUrl || config.supportUrl)) {
    await client.patch(`/appInfoLocalizations/${locId}`, {
      data: {
        type: 'appInfoLocalizations',
        id: locId,
        attributes: {
          ...(config.privacyPolicyUrl && { privacyPolicyUrl: config.privacyPolicyUrl }),
          ...(config.supportUrl && { supportUrl: config.supportUrl }),
        },
      },
    });
  }
}

export async function updateStoreListing(
  client: AscClient,
  appId: string,
  config: AppConfig,
  version = '1.0.0',
): Promise<void> {
  // Get or create an "PREPARE_FOR_SUBMISSION" app store version
  const versionsRes = await client.get<{
    data: Array<{ id: string; attributes: { versionString: string; appStoreState: string } }>;
  }>(`/apps/${appId}/appStoreVersions`, {
    params: { 'filter[platform]': 'IOS' },
  });

  let versionId = versionsRes.data.data.find(
    v => v.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION',
  )?.id;

  if (!versionId) {
    const createRes = await client.post<{ data: { id: string } }>(
      '/appStoreVersions',
      {
        data: {
          type: 'appStoreVersions',
          attributes: {
            platform: 'IOS',
            versionString: version,
          },
          relationships: {
            app: { data: { type: 'apps', id: appId } },
          },
        },
      },
    );
    versionId = createRes.data.data.id;
  }

  // Get localization
  const locRes = await client.get<{ data: Array<{ id: string }> }>(
    `/appStoreVersions/${versionId}/appStoreVersionLocalizations`,
    { params: { 'filter[locale]': config.primaryLocale } },
  );

  const locId = locRes.data.data[0]?.id;
  const attrs: Record<string, unknown> = {};
  if (config.description)        attrs['description'] = config.description;
  if (config.keywords?.length)   attrs['keywords'] = config.keywords.join(', ');
  if (config.supportUrl)         attrs['supportUrl'] = config.supportUrl;

  if (Object.keys(attrs).length === 0) return;

  if (locId) {
    await client.patch(`/appStoreVersionLocalizations/${locId}`, {
      data: { type: 'appStoreVersionLocalizations', id: locId, attributes: attrs },
    });
  } else {
    await client.post('/appStoreVersionLocalizations', {
      data: {
        type: 'appStoreVersionLocalizations',
        attributes: { locale: config.primaryLocale, ...attrs },
        relationships: {
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
        },
      },
    });
  }
}
