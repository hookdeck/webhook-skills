# Setting Up Alchemy Webhooks

## Prerequisites

- An [Alchemy](https://dashboard.alchemy.com/) account and an **App** on the chain/network you want to
  monitor (e.g. Ethereum Mainnet).
- Your application's public webhook endpoint URL (or a Hookdeck / tunnel URL for local development).

## Option A: Configure in the Dashboard (Notify tab)

1. Go to the Alchemy Dashboard → **Notify** tab.
2. Click **Create Webhook** and choose a type:
   - **Address Activity** (`ADDRESS_ACTIVITY`)
   - **NFT Activity** (`NFT_ACTIVITY`)
   - **Custom Webhook** (`GRAPHQL`)

   These are the three categories the current docs list, and the three values the Notify API accepts
   for `webhook_type`. **Mined Transaction**, **Dropped Transaction**, and **NFT Metadata Updates**
   were previously offered here but are deprecated as of 2026-08-30 — see
   [overview.md](overview.md#deprecated-types).
3. Select the **chain and network** — webhooks are scoped per network.
4. Enter your **Webhook URL** (e.g. `https://your-app.com/webhooks/alchemy`).
5. For address/NFT webhooks, add the addresses or contracts to track.
6. Create the webhook.

## Get Your Signing Key

The signing key is **per-webhook** (not per-app):

1. Open the webhook you just created in the **Notify** tab.
2. Copy the **signing key** from the **top-right** of the webhook's detail page.
3. Store it as `ALCHEMY_SIGNING_KEY` in your environment.

> Each webhook has its own key. If you create multiple webhooks, verify each delivery with the key that
> matches its `webhookId`.

## Option B: Configure via the Notify API / alchemy-sdk

The Notify API (and the `alchemy-sdk` `NotifyNamespace`) let you create and manage webhooks
programmatically. This requires your app's **Auth Token** (`X-Alchemy-Token`), which is **distinct from
the per-webhook signing key**.

Find the Auth Token in the Dashboard → **Notify** tab (top-right, "AUTH TOKEN").

```javascript
// npm install alchemy-sdk@^3.6.5
const { Alchemy, Network, WebhookType } = require('alchemy-sdk');

const alchemy = new Alchemy({
  authToken: process.env.ALCHEMY_AUTH_TOKEN, // NOT the signing key
});

// Create an Address Activity webhook
const webhook = await alchemy.notify.createWebhook(
  'https://your-app.com/webhooks/alchemy',
  WebhookType.ADDRESS_ACTIVITY,
  {
    addresses: ['0xd6b8b7...'],
    network: Network.ETH_MAINNET,
  }
);

// Read the signing key for a webhook (use it to verify that webhook's deliveries)
const signingKey = await alchemy.notify.getSigningKey(webhook.id);
console.log('Signing key:', signingKey);
```

> **Important:** `alchemy-sdk` manages webhook CRUD and can fetch the signing key, but it does **not**
> provide a signature-verification helper. You must verify the `X-Alchemy-Signature` header yourself —
> see [verification.md](verification.md).

## Register Your Endpoint

- Use a path like `/webhooks/alchemy` in your app.
- Return a `2xx` status quickly; do heavy work asynchronously so you don't hit delivery timeouts.
- Optionally restrict inbound traffic to Alchemy's egress IPs: `54.236.136.17` and `34.237.24.169`.

## Test Your Webhook

- In the Dashboard, use the **"Test Webhook"** button on the webhook's detail page to send a sample
  payload signed with the real signing key.
- For local development, tunnel with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 alchemy --path /webhooks/alchemy
  ```

  Then set the resulting URL as the webhook's target in the Notify dashboard.
