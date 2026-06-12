/**
 * /v1/subscriptionGroups + /v1/subscriptions
 * Handles auto-renewable subscription creation end-to-end.
 */
import type { AscClient } from '../client';
import type {
  AscSubscription,
  AscSubscriptionGroup,
  SubscriptionConfig,
  SubscriptionProduct,
} from '../types';

// ─── Subscription Groups ──────────────────────────────────────────────────────

export async function listSubscriptionGroups(
  client: AscClient,
  appId: string,
): Promise<AscSubscriptionGroup[]> {
  const res = await client.get<{ data: AscSubscriptionGroup[] }>(
    `/apps/${appId}/subscriptionGroups`,
    { params: { limit: 50 } },
  );
  return res.data.data;
}

export async function findSubscriptionGroupByName(
  client: AscClient,
  appId: string,
  referenceName: string,
): Promise<AscSubscriptionGroup | null> {
  const groups = await listSubscriptionGroups(client, appId);
  return groups.find(g => g.attributes.referenceName === referenceName) ?? null;
}

export async function createSubscriptionGroup(
  client: AscClient,
  appId: string,
  referenceName: string,
): Promise<AscSubscriptionGroup> {
  const res = await client.post<{ data: AscSubscriptionGroup }>(
    '/subscriptionGroups',
    {
      data: {
        type: 'subscriptionGroups',
        attributes: { referenceName },
        relationships: {
          app: { data: { type: 'apps', id: appId } },
        },
      },
    },
  );
  return res.data.data;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function listSubscriptions(
  client: AscClient,
  groupId: string,
): Promise<AscSubscription[]> {
  const res = await client.get<{ data: AscSubscription[] }>(
    `/subscriptionGroups/${groupId}/subscriptions`,
    { params: { limit: 50 } },
  );
  return res.data.data;
}

export async function findSubscriptionByProductId(
  client: AscClient,
  groupId: string,
  productId: string,
): Promise<AscSubscription | null> {
  const subs = await listSubscriptions(client, groupId);
  return subs.find(s => s.attributes.productId === productId) ?? null;
}

export async function createSubscription(
  client: AscClient,
  groupId: string,
  product: SubscriptionProduct,
): Promise<AscSubscription> {
  const res = await client.post<{ data: AscSubscription }>(
    '/subscriptions',
    {
      data: {
        type: 'subscriptions',
        attributes: {
          productId: product.productId,
          name: product.referenceName,
          subscriptionPeriod: product.duration,
          reviewNote: '',
          groupLevel: 1,
        },
        relationships: {
          group: { data: { type: 'subscriptionGroups', id: groupId } },
        },
      },
    },
  );
  const sub = res.data.data;

  // Add localized display name + description
  await addSubscriptionLocalization(client, sub.id, product);

  // Set intro offer (free trial) if configured
  if (product.trialDays) {
    await addFreeTrial(client, sub.id, product.trialDays, product.duration);
  }

  // Set price
  await setSubscriptionPrice(client, sub.id, product.priceTier);

  return sub;
}

// ─── Localization ─────────────────────────────────────────────────────────────

export async function addSubscriptionLocalization(
  client: AscClient,
  subscriptionId: string,
  product: SubscriptionProduct,
): Promise<void> {
  await client.post('/subscriptionLocalizations', {
    data: {
      type: 'subscriptionLocalizations',
      attributes: {
        locale: 'en-US',
        name: product.displayName,
        description: product.description,
      },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subscriptionId } },
      },
    },
  });
}

// ─── Free Trial ───────────────────────────────────────────────────────────────

const TRIAL_DURATION_MAP: Record<number, string> = {
  3:  'THREE_DAYS',
  7:  'ONE_WEEK',
  14: 'TWO_WEEKS',
  30: 'ONE_MONTH',
  60: 'TWO_MONTHS',
  90: 'THREE_MONTHS',
};

export async function addFreeTrial(
  client: AscClient,
  subscriptionId: string,
  trialDays: number,
  _subscriptionPeriod: string,
): Promise<void> {
  const duration = TRIAL_DURATION_MAP[trialDays] ?? 'ONE_WEEK';
  await client.post('/subscriptionIntroductoryOffers', {
    data: {
      type: 'subscriptionIntroductoryOffers',
      attributes: {
        offerMode: 'FREE_TRIAL',
        duration,
      },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subscriptionId } },
      },
    },
  });
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export async function setSubscriptionPrice(
  client: AscClient,
  subscriptionId: string,
  priceTier: number,
): Promise<void> {
  // Get available price points for this subscription
  const ppRes = await client.get<{
    data: Array<{ id: string; attributes: { customerPrice: string; proceeds: string } }>;
  }>(`/subscriptions/${subscriptionId}/pricePoints`, {
    params: { 'filter[territory]': 'USA', limit: 200 },
  });

  // Apple price tiers roughly: tier 1 = $0.99, tier 5 = $4.99, etc.
  // We sort by customerPrice and pick the index closest to the desired tier
  const points = ppRes.data.data.sort(
    (a, b) =>
      parseFloat(a.attributes.customerPrice) - parseFloat(b.attributes.customerPrice),
  );

  const targetIndex = Math.min(priceTier - 1, points.length - 1);
  const pricePoint = points[targetIndex];
  if (!pricePoint) return;

  await client.post('/subscriptionPrices', {
    data: {
      type: 'subscriptionPrices',
      attributes: { startDate: null, preserveCurrentPrice: false },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subscriptionId } },
        subscriptionPricePoint: {
          data: { type: 'subscriptionPricePoints', id: pricePoint.id },
        },
      },
    },
  });
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface SetupSubscriptionsResult {
  groupId: string;
  groupName: string;
  created: string[];
  skipped: string[];
}

export async function setupSubscriptions(
  client: AscClient,
  appId: string,
  config: SubscriptionConfig,
): Promise<SetupSubscriptionsResult> {
  // 1. Get or create subscription group
  let group = await findSubscriptionGroupByName(
    client,
    appId,
    config.groupReferenceName,
  );

  if (!group) {
    group = await createSubscriptionGroup(
      client,
      appId,
      config.groupReferenceName,
    );
  }

  // 2. Create each product if it doesn't exist
  const created: string[] = [];
  const skipped: string[] = [];

  for (const product of config.products) {
    const existing = await findSubscriptionByProductId(
      client,
      group.id,
      product.productId,
    );

    if (existing) {
      // Patch metadata on existing subscription (idempotent — skips if already set)
      try { await addSubscriptionLocalization(client, existing.id, product); } catch { /* already set */ }
      if (product.trialDays) {
        try { await addFreeTrial(client, existing.id, product.trialDays, product.duration); } catch { /* already set */ }
      }
      try { await setSubscriptionPrice(client, existing.id, product.priceTier); } catch { /* already set */ }
      skipped.push(product.productId);
    } else {
      await createSubscription(client, group.id, product);
      created.push(product.productId);
    }
  }

  return {
    groupId: group.id,
    groupName: config.groupName,
    created,
    skipped,
  };
}
