# Setting Up Hookdeck Event Gateway

## Prerequisites

- [Hookdeck CLI](https://hookdeck.com/docs/cli) installed
- Hookdeck account (free tier available)

```bash
# Install CLI
brew install hookdeck/hookdeck/hookdeck

# Login to your account
hookdeck login
```

## Creating a Connection

A connection routes events from a **source** (where webhooks come from) to a **destination** (your application).

### Via Dashboard

1. Go to [Hookdeck Dashboard → Connections](https://dashboard.hookdeck.com/connections)
2. Click **+ Connection**
3. Configure source:
   - Name: `stripe` (or your provider)
   - Type: Select provider (e.g., `STRIPE`)
4. Configure destination:
   - Name: `my-api`
   - Type: `HTTP`
   - URL: Your production URL (or leave blank for CLI)
5. Click **Create**

### Via CLI

```bash
# Create connection with source verification
hookdeck connection create \
  --name "stripe-to-api" \
  --source-name stripe \
  --source-type STRIPE \
  --destination-name my-api \
  --destination-url https://your-app.com/webhooks/stripe

# Or create without verification for local dev
hookdeck connection create \
  --name "stripe-local" \
  --source-name stripe \
  --destination-name local-api
```

## Configuring Source Verification

Hookdeck can verify incoming webhooks at the source level, ensuring only authentic requests reach your destination.

### Supported Providers

| Provider | Source Type | Secret Required |
|----------|-------------|-----------------|
| Stripe | `STRIPE` | Webhook signing secret (`whsec_...`) |
| Shopify | `SHOPIFY` | API secret |
| GitHub | `GITHUB` | Webhook secret |
| Generic | `WEBHOOK` | Optional HMAC secret |

### Setting Verification Secret

**Via Dashboard:**
1. Go to your connection
2. Click on the source
3. Under **Verification**, select provider type
4. Enter your signing secret

**Via CLI:**
```bash
# Update source with verification
hookdeck source update stripe \
  --type STRIPE \
  --verification-secret whsec_your_stripe_secret
```

## Getting Your Webhook URL

After creating a connection, Hookdeck provides a unique URL for each source:

```
https://events.hookdeck.com/e/src_xxxxxxxxxxxxx
```

Configure this URL in your provider's webhook settings:
- **Stripe**: Dashboard → Developers → Webhooks → Add endpoint
- **Shopify**: App settings → Webhooks → Add webhook
- **GitHub**: Repository Settings → Webhooks → Add webhook

## Connection Structure

```
┌─────────────┐     ┌────────────┐     ┌─────────────────┐
│   Source    │────▶│ Connection │────▶│   Destination   │
│   (Stripe)  │     │  (Rules)   │     │   (Your API)    │
└─────────────┘     └────────────┘     └─────────────────┘
       │                  │
       │                  ├── Retry rules
       │                  ├── Filters
       └── Verification   ├── Transforms
                          └── Delays
```

## Next Steps

After setup:
1. [02-scaffold.md](02-scaffold.md) - Create your webhook handler
2. [03-listen.md](03-listen.md) - Start local development

## Full Documentation

- [Hookdeck Connections](https://hookdeck.com/docs/connections)
- [Hookdeck Sources](https://hookdeck.com/docs/sources)
- [Hookdeck CLI Reference](https://hookdeck.com/docs/cli)
