// ─── Credentials ─────────────────────────────────────────────────────────────

export interface AscCredentials {
  keyId: string;        // Key ID from App Store Connect (e.g. "ABC123DEF4")
  issuerId: string;     // Issuer ID from App Store Connect
  privateKeyPath: string; // Path to the downloaded .p8 file
}

// ─── Project config (asc.config.json) ────────────────────────────────────────

export interface AppConfig {
  name: string;           // Display name (e.g. "Ramble")
  bundleId: string;       // e.g. "com.ramble.app"
  sku: string;            // Unique SKU, usually same as bundle ID slug
  primaryLocale: string;  // e.g. "en-US"
  category: string;       // e.g. "HEALTH_AND_FITNESS"
  subtitle?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  description?: string;
  keywords?: string[];
}

export interface SubscriptionProduct {
  productId: string;        // Apple product ID, e.g. "ramble_monthly"
  referenceName: string;    // Internal name shown in ASC, e.g. "Monthly"
  displayName: string;      // Shown to users, e.g. "Ramble Pro Monthly"
  description: string;      // Shown to users
  duration: SubscriptionDuration;
  trialDays?: number;       // 3, 7, 14, 30, 60, 90
  priceTier: number;        // Apple price tier (1 = $0.99, 5 = $4.99, etc.)
}

export type SubscriptionDuration =
  | 'THREE_DAYS'
  | 'ONE_WEEK'
  | 'TWO_WEEKS'
  | 'ONE_MONTH'
  | 'TWO_MONTHS'
  | 'THREE_MONTHS'
  | 'SIX_MONTHS'
  | 'ONE_YEAR';

export interface SubscriptionConfig {
  groupName: string;               // e.g. "Ramble Pro"
  groupReferenceName: string;      // Internal reference
  products: SubscriptionProduct[];
}

export interface SandboxTester {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  territory: string; // e.g. "USA"
}

export interface AscConfig {
  app: AppConfig;
  subscriptions?: SubscriptionConfig;
  sandboxTesters?: SandboxTester[];
}

// ─── ASC API response shapes ──────────────────────────────────────────────────

export interface AscApp {
  id: string;
  attributes: {
    name: string;
    bundleId: string;
    sku: string;
    primaryLocale: string;
  };
}

export interface AscSubscriptionGroup {
  id: string;
  attributes: {
    referenceName: string;
  };
}

export interface AscSubscription {
  id: string;
  attributes: {
    productId: string;
    name: string;           // internal reference name (API field is 'name', not 'referenceName')
    subscriptionPeriod: string;
    state: string;
  };
}
