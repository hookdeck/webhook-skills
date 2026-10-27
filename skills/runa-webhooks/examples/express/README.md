# Runa Webhooks - Express Example

Minimal example of receiving Runa webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Runa delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- A Runa account with a webhook endpoint in the Svix portal and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint's signing secret to `.env` as `RUNA_WEBHOOK_SECRET` (the full
   `whsec_...` value from the endpoint's page in the webhook portal).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/runa
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 runa --path /webhooks/runa
```

1. In your Runa account, open the [API section](https://app.runa.io/api-keys) and click
   **View webhook** to open the portal.
2. Click **Add new endpoint**, enter the tunnel URL and select one event type
   (`order.completion` or `product.update`).
3. Copy the endpoint's signing secret into `.env`.
4. Use the endpoint's **Testing** tab and **Send Example** to deliver a test event. Webhooks
   aren't available in Runa's playground environment.

## Event Handling

The body is a bare resource with **no event-type field**: each endpoint subscribes to a single
event type, and this handler identifies the event from the payload shape. Anything else is
acknowledged with `200`.

- `order.completion`: `status` is `COMPLETED` (full order summary) or `FAILED` (only `{ id, status }`)
- `product.update`: `{ product_code, old_state, new_state, timestamp }`

Delivery order isn't guaranteed, so for `product.update` the example keeps the newest
`timestamp` per `product_code` and ignores older events (in memory; use your database).
Deduplicate order handling on the order `id` plus `status`.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
