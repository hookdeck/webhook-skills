# Setting Up Hookdeck Event Gateway Webhooks

## Prerequisites

- [Hookdeck CLI](https://hookdeck.com/docs/cli) installed
- Hookdeck account (free tier available at [dashboard.hookdeck.com](https://dashboard.hookdeck.com))

```bash
# Install CLI
brew install hookdeck/hookdeck/hookdeck
# Or: npm install -g hookdeck-cli

# Login to your account
hookdeck login
```

## Getting Your Webhook URL

When you create a connection in Hookdeck, each source gets a unique URL:

```
https://events.hookdeck.com/e/src_xxxxxxxxxxxxx
```

Configure this URL in your provider's webhook settings:
- **Stripe**: Dashboard → Developers → Webhooks → Add endpoint
- **Shopify**: App settings → Webhooks → Add webhook
- **GitHub**: Repository Settings → Webhooks → Add webhook

## Creating a Connection

A connection routes events from a **source** (where webhooks come from) to a **destination** (your application).

### Via Dashboard

1. Go to [Hookdeck Dashboard → Connections](https://dashboard.hookdeck.com/connections)
2. Click **+ Connection**
3. Configure source (name: `stripe`, type: select provider)
4. Configure destination (name: `my-api`, type: `HTTP`, URL: your app URL)
5. Click **Create**

### Via CLI

```bash
# Create connection with source verification
hookdeck connection upsert stripe-webhooks \
  --source-name stripe \
  --source-type STRIPE \
  --source-webhook-secret whsec_your_stripe_secret \
  --destination-name my-api \
  --destination-type HTTP \
  --destination-url https://your-app.com/webhooks
```

## Getting Your Webhook Secret

Your webhook secret is used to verify that forwarded requests came from Hookdeck (the `x-hookdeck-signature` header).

### Via Dashboard

1. Go to [Hookdeck Dashboard](https://dashboard.hookdeck.com)
2. Navigate to **Destinations**
3. Click on your destination
4. Find **Webhook Secret** in the settings
5. Click to reveal and copy

### Via CLI

```bash
hookdeck destination get my-api
```

### Setting Environment Variables

```bash
# Add to your .env file
HOOKDECK_WEBHOOK_SECRET=your_webhook_secret_here
```

## Configuring Source Verification

Hookdeck can verify incoming webhooks at the source level, so your app doesn't need to verify the original provider's signature — just the Hookdeck signature.

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
hookdeck connection upsert stripe-webhooks \
  --source-name stripe \
  --source-type STRIPE \
  --source-webhook-secret whsec_your_stripe_secret \
  --destination-name my-api \
  --destination-type CLI
```

When source verification is enabled, Hookdeck verifies the provider's signature before accepting the webhook. Invalid requests are rejected immediately. The `x-hookdeck-verified` header on forwarded requests indicates whether verification passed.

## Full Documentation

- [Hookdeck Connections](https://hookdeck.com/docs/connections)
- [Hookdeck Sources](https://hookdeck.com/docs/sources)
- [Hookdeck Authentication & Verification](https://hookdeck.com/docs/authentication)
- [Hookdeck CLI Reference](https://hookdeck.com/docs/cli)
