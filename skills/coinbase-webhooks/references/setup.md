# Setting Up Coinbase (CDP) Webhooks

## Prerequisites

- A CDP account at [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
- A **Secret API Key**: Portal → API Keys → Secret API Keys → Create API key
- An **HTTPS** endpoint URL. For local development, use a tunnel (see below).

CDP subscriptions are created through the CLI, REST API or SDK.

## How Do I Create a Subscription With the CDP CLI?

```bash
npm install -g @coinbase/cdp-cli
cdp env live --key-file ./cdp_api_key.json
```

Create a subscription. This example watches `Transfer` events on one contract on Base:

```bash
cdp data webhooks subscriptions create \
  description="USD Base Coin Transfers" \
  'eventTypes:=["onchain.activity.detected"]' \
  target.url=https://your-webhook-url.com \
  target.method=POST \
  labels.network=base-mainnet \
  labels.contract_address=0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca \
  labels.event_name=Transfer \
  isEnabled:=true
```

`target.headers` adds custom headers to every delivery, which is useful for routing.

## Where Do I Get the Signing Secret?

The secret is returned **once**, in the create response:

```json
"metadata": { "secret": "<SECRET_FOR_WEBHOOK_VERIFICATION>" }
```

Capture it immediately and store it as `COINBASE_WEBHOOK_SECRET`. Use the string as-is:
there's no `whsec_` prefix to strip and no base64 decoding. If you lose it, create a new
subscription.

## How Do I Subscribe to Wallet Events With the SDK?

TypeScript (`@coinbase/cdp-sdk`):

```typescript
const subscription = await cdp.webhooks.createSubscription({
  description: 'Monitor wallet transactions',
  eventTypes: ['wallet.transaction.pending', 'wallet.transaction.confirmed', 'wallet.transaction.failed'],
  targetUrl: 'https://example.com/webhooks/coinbase',
  isEnabled: true,
});
console.log(subscription.secret); // store as COINBASE_WEBHOOK_SECRET
```

Python (`cdp`): `cdp.webhooks.create_subscription(CreateWebhookSubscriptionOptions(...))`.

## How Do I Manage and Debug Subscriptions?

```bash
cdp data webhooks subscriptions list
cdp data webhooks subscriptions get <ID>
cdp data webhooks subscriptions update <ID> ...
cdp data webhooks subscriptions delete <ID>
cdp data webhooks subscriptions events <ID>
```

- **`update` is a full replace.** It "requires all fields, even ones you aren't changing".
- **`events <ID>`** lists delivery attempts: status, retry count and HTTP response. You can
  filter by `eventId`, `minCreatedAt`, `maxCreatedAt` and `eventTypeNames`. It returns the
  50 most recent attempts, newest first. Start debugging here.
- A subscription can be **auto-disabled** after sustained delivery failures. Fix the endpoint,
  then re-enable it with `update` (`isEnabled:=true`). Run a scheduled check that critical
  subscriptions still have `isEnabled: true`.
- Upgrading a v1 webhook that watched N contract addresses creates N separate v2
  subscriptions, one per address.

There's no handshake or challenge step. A new subscription starts delivering immediately,
and your endpoint only needs to return 2xx.

## How Do I Receive Webhooks Locally?

Point `target.url` at a Hookdeck CLI tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 coinbase --path /webhooks/coinbase   # Express / Next.js
npx hookdeck-cli listen 8000 coinbase --path /webhooks/coinbase   # FastAPI
```

If you use the Hookdeck Event Gateway in production, configure the source as source type
**Coinbase**, with the subscription secret as the webhook secret key.
