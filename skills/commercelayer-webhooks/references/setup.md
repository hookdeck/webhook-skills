# Setting Up Commerce Layer Webhooks

## Prerequisites

- A Commerce Layer organization with **admin** access.
- API credentials (an **integration** application with `client_id` / `client_secret`)
  able to manage webhooks. See [Commerce Layer authentication](https://docs.commercelayer.io/core/authentication).
- Your application's public webhook endpoint URL (or a Hookdeck/ngrok tunnel while
  developing — see below).

## Create a Webhook

Webhooks are created via the Core API (`POST /api/webhooks`). You provide a `topic`, a
`callback_url`, and optionally `include_resources`. The **create response returns a
`shared_secret`** — this is the value you use to verify signatures. Store it securely;
it is shown when the webhook is created.

### Using the Commerce Layer Node SDK

```javascript
import { CommerceLayer } from '@commercelayer/sdk';

const client = CommerceLayer({
  organization: process.env.COMMERCELAYER_ORGANIZATION, // your org slug
  accessToken: process.env.COMMERCELAYER_ACCESS_TOKEN,  // integration token
  apiVersion: '2017-08', // required from @commercelayer/sdk 8; '2026-05' is the latest
});

const webhook = await client.webhooks.create({
  topic: 'orders.place',
  callback_url: 'https://your-app.com/webhooks/commercelayer',
  include_resources: ['line_items', 'customer'], // optional related resources
});

// Save this — you'll set it as COMMERCELAYER_SHARED_SECRET
console.log('shared_secret:', webhook.shared_secret);
```

> The `@commercelayer/sdk` package manages webhooks (create/list/update) but does **not**
> provide a signature-verification helper. Verify signatures manually with HMAC-SHA256 —
> see [verification.md](verification.md).

### Using cURL

```bash
curl -X POST https://<your-org>.commercelayer.io/api/webhooks \
  -H "Authorization: Bearer $COMMERCELAYER_ACCESS_TOKEN" \
  -H "Content-Type: application/vnd.api+json" \
  -H "Accept: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "webhooks",
      "attributes": {
        "topic": "orders.place",
        "callback_url": "https://your-app.com/webhooks/commercelayer",
        "include_resources": ["line_items", "customer"]
      }
    }
  }'
```

The `shared_secret` is returned in the response `data.attributes.shared_secret`.

## Configure Your Endpoint

1. Set the returned `shared_secret` in your app's environment:

   ```bash
   COMMERCELAYER_SHARED_SECRET=the_value_from_the_create_response
   ```

2. Deploy a handler that:
   - Reads the **raw** request body.
   - Verifies `X-CommerceLayer-Signature` (base64 HMAC-SHA256 of the raw body).
   - Returns a **2xx** within **5 seconds**.

   See the runnable examples in [examples/express/](../examples/express/),
   [examples/nextjs/](../examples/nextjs/), and [examples/fastapi/](../examples/fastapi/).

## One Topic per Webhook

Each webhook subscribes to a single `topic`. To handle multiple events, create multiple
webhooks (they can all point at the same `callback_url` — dispatch on the
`X-CommerceLayer-Topic` header inside your handler).

## Reliability, Retries & the Circuit Breaker

- Endpoint must respond **2xx within 5 seconds**.
- Failed deliveries retry **up to 10 times**.
- After **5** failures, org owner/admins are notified.
- After **30 consecutive failures**, the circuit breaker trips (`circuit_state`,
  `circuit_failure_count`) and the webhook is disabled. Fix your endpoint, then **reset**
  the webhook (update it via the API / dashboard) to resume delivery.

Because of the 5-second limit, acknowledge fast and do heavy work asynchronously.

## Local Development

Use the Hookdeck CLI to receive Commerce Layer webhooks on your machine — no account
required (it creates a guest account and a public tunnel):

```bash
npx hookdeck-cli listen 3000 commercelayer --path /webhooks/commercelayer
```

Set the tunnel URL Hookdeck prints as your webhook's `callback_url`, then trigger an
event (e.g. place a test order) to see it arrive.
