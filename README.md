# asc-tool

Reusable CLI for automating App Store Connect setup via the REST API.  
One config file → full project setup in one command.

## Install

```bash
# Link globally (from this repo)
npm link

# Or once published to npm:
npm install -g asc-tool
```

## Quick start

```bash
# 1. Configure your ASC API credentials (one-time, global)
asc-tool auth

# 2. Create a project config in your app's directory
cd my-app
asc-tool config init

# 3. Run full setup
asc-tool setup

# 4. Check what's configured
asc-tool status
```

## Commands

| Command | Description |
|---|---|
| `asc-tool auth` | Configure API key (interactive, stored in `~/.asc-tool/credentials.json`) |
| `asc-tool auth show` | Show stored credentials |
| `asc-tool config init` | Create `asc.config.json` interactively |
| `asc-tool config show` | Print current config |
| `asc-tool setup` | Full setup: app + subscriptions + sandbox tester |
| `asc-tool setup --dry-run` | Preview without making changes |
| `asc-tool setup --skip-app` | Only run IAP + sandbox |
| `asc-tool setup --skip-iap` | Only create app + sandbox tester |
| `asc-tool iap setup` | Only set up subscriptions |
| `asc-tool sandbox add` | Only create sandbox test accounts |
| `asc-tool status` | Audit what's set up vs missing |

## Getting your API key

1. Go to [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/api)
2. Click **+** to generate a new key — give it **App Manager** role
3. Download the `.p8` file (you can only download it once)
4. Note your **Issuer ID** (top of the page) and **Key ID** (shown in the key list)
5. Run `asc-tool auth` and paste those in

## asc.config.json

```json
{
  "app": {
    "name": "My App",
    "bundleId": "com.example.myapp",
    "sku": "com-example-myapp",
    "primaryLocale": "en-US",
    "category": "UTILITIES",
    "privacyPolicyUrl": "https://example.com/privacy",
    "supportUrl": "https://example.com/support",
    "description": "App description shown in the App Store.",
    "keywords": ["keyword1", "keyword2"]
  },
  "subscriptions": {
    "groupName": "My App Pro",
    "groupReferenceName": "my-app-pro",
    "products": [
      {
        "productId": "myapp_monthly",
        "referenceName": "Monthly",
        "displayName": "My App Pro Monthly",
        "description": "Full access, billed monthly.",
        "duration": "ONE_MONTH",
        "trialDays": 7,
        "priceTier": 5
      },
      {
        "productId": "myapp_annual",
        "referenceName": "Annual",
        "displayName": "My App Pro Annual",
        "description": "Full access, billed annually.",
        "duration": "ONE_YEAR",
        "trialDays": 7,
        "priceTier": 40
      }
    ]
  },
  "sandboxTesters": [
    {
      "firstName": "Test",
      "lastName": "User",
      "email": "sandbox+myapp@yourdomain.com",
      "password": "TestUser123!",
      "territory": "USA"
    }
  ]
}
```

## Price tiers

Apple price tiers map approximately to:

| Tier | USD |
|---|---|
| 1 | $0.99 |
| 2 | $1.99 |
| 3 | $2.99 |
| 5 | $4.99 |
| 10 | $9.99 |
| 20 | $19.99 |
| 40 | $39.99 |
| 70 | $69.99 |

## What it does NOT automate (manual steps)

- **Screenshots** — required before submission, must be done per device size
- **App Review notes** — for subscription apps with special entitlements
- **App Store Connect API key for RevenueCat** — generate a separate key with Developer role and paste into RevenueCat dashboard
- **Signing certificates** — use `eas credentials` for Expo projects

## For future projects

```bash
cd /path/to/new-project
asc-tool config init   # fills in app name, bundle ID, category interactively
# Edit asc.config.json to adjust prices, descriptions, sandbox emails
asc-tool setup         # done
```
