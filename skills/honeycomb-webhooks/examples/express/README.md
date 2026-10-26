# Honeycomb Webhooks - Express Example

Minimal example of receiving Honeycomb webhooks (Triggers, SLO burn alerts, Anomaly Detection) and
authenticating them with the `X-Honeycomb-Webhook-Token` header.

Honeycomb does not sign payloads, so there is no HMAC to verify. It sends the webhook's Shared
Secret as plain text in `X-Honeycomb-Webhook-Token`; the handler compares the whole value with
`HONEYCOMB_WEBHOOK_SECRET` in constant time. A static shared credential authenticates the sender,
not the body, and gives no replay protection, so use HTTPS and rotate the secret if it leaks.

The route accepts GET, POST, PUT, PATCH and DELETE (Honeycomb's docs don't name the method),
reads the body with `express.raw({ type: '*/*' })` so any content type works, and checks the
secret before parsing. An empty body is fine.

## Prerequisites

- Node.js 18+
- A Honeycomb webhook integration with a Shared Secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HONEYCOMB_WEBHOOK_SECRET` to the Shared Secret you entered on the Honeycomb webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/honeycomb`.

## Test

```bash
npm test
```

The tests cover every accepted method with correct, wrong and missing secrets, empty and invalid
bodies, alert classification and duplicate delivery IDs. No Honeycomb account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/honeycomb \
  -H "Content-Type: application/json" \
  -H "X-Honeycomb-Webhook-Token: $HONEYCOMB_WEBHOOK_SECRET" \
  -H "X-Honeycomb-Webhook-Delivery-ID: test-1" \
  -d '{"name":"Slow checkout requests","status":"TRIGGERED"}'
```

(That payload is illustrative: the real default payload isn't documented field by field.)

## Receive Webhooks Locally

Honeycomb can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 honeycomb --path /webhooks/honeycomb
```

Put the printed URL in the Honeycomb webhook integration.

## How It Works

- `src/index.js`: `verifyHoneycombRequest()`, `classifyAlert()` and the `/webhooks/honeycomb` routes

1. The `X-Honeycomb-Webhook-Token` header is checked first, for every method. Failure returns `401`.
2. A repeated `X-Honeycomb-Webhook-Delivery-ID` is acknowledged without reprocessing.
3. An empty body is accepted; otherwise the body must be a JSON object (`400` otherwise).
4. The handler classifies the alert as `trigger`, `slo_burn_alert`, `anomaly` or `unknown` from the
   fields present, because custom templates can change the payload.
5. It returns `200 {"received": true}`. Honeycomb expects a response within 15 seconds.
