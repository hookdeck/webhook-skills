# Setting Up Alchemy Webhooks

## Prerequisites

- An [Alchemy](https://dashboard.alchemy.com/) account and an **App** on the chain/network you want to
  monitor (e.g. Ethereum Mainnet).
- Your application's public webhook endpoint URL (or a Hookdeck / tunnel URL for local development).

## Option A: Configure in the Dashboard (Webhooks page)

1. Go to the Alchemy Dashboard → **Webhooks** page.
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

1. Open the webhook you just created on the **Webhooks** page.
2. Copy the **signing key** from the **top-right** of the webhook's detail page.
3. Store it as `ALCHEMY_SIGNING_KEY` in your environment.

> Each webhook has its own key. If you create multiple webhooks, verify each delivery with the key that
> matches its `webhookId`.

## Option B: Configure via the Notify API

The Notify API creates and manages webhooks programmatically. It requires your team's **Auth Token**,
sent as `X-Alchemy-Token`, which is **distinct from the per-webhook signing key**. Find it on the
Webhooks page of the Alchemy dashboard.

```bash
curl --request POST \
  --url https://dashboard.alchemy.com/api/create-webhook \
  --header 'Content-Type: application/json' \
  --header "X-Alchemy-Token: $ALCHEMY_AUTH_TOKEN" \
  --data '{
    "network": "ETH_MAINNET",
    "webhook_type": "ADDRESS_ACTIVITY",
    "webhook_url": "https://your-app.com/webhooks/alchemy",
    "addresses": ["0xYourAddress"]
  }'
```

Send `nft_filters` instead of `addresses` for `NFT_ACTIVITY`, or `graphql_query` for `GRAPHQL`. The
response's `data.signing_key` is the key that signs that webhook's deliveries; `GET /api/team-webhooks`
returns it for every webhook too.

> **Note:** the JavaScript `alchemy-sdk` (`NotifyNamespace`) that older examples use is deprecated and
> its repository is archived. It never had a signature-verification helper either — verify the
> `X-Alchemy-Signature` header yourself, as in [verification.md](verification.md).

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

  Then set the resulting URL as the webhook's target on the dashboard's Webhooks page.
