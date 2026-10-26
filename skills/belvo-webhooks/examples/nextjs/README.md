# Belvo Webhooks - Next.js Example

Minimal example of receiving Belvo Payments (Mexico and Brazil) and Aggregation webhooks and
authenticating them with the `Authorization` header.

Belvo does not sign payloads. The only authentication is an optional static credential you set
on the webhook, sent as the `Authorization` header (`Bearer <token>`, or `Basic <base64>` on
Aggregation webhooks). The handler compares the **whole header value**, scheme prefix included,
with a constant-time comparison. A static credential proves who sent the request, not that the
body is intact, and gives no replay protection, so use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Belvo account with a webhook configured (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BELVO_AUTHORIZATION` to the full header value Belvo sends, e.g. `Bearer 1234-...`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/belvo`.

## Test

```bash
npm test
```

The tests send Payments and Aggregation shapes with correct, wrong and missing `Authorization`
headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/belvo \
  -H "Content-Type: application/json" \
  -H "Authorization: $BELVO_AUTHORIZATION" \
  -d '{"eventType":"payment_request_update","eventCode":"payment_request_successful","details":{"id":"3118128a","status":"successful","amount":100.5}}'
```

## Receive Belvo Webhooks Locally

```bash
npx hookdeck-cli listen 3000 belvo --path /webhooks/belvo
```

Use the printed URL as the webhook URL in Belvo.

## How It Works

- `app/webhooks/belvo/route.ts`: the `POST /webhooks/belvo` route
- `lib/verify-belvo.ts`: `verifyBelvoRequest()` and `classify()`

1. The body is read with `request.text()`, so any content type works.
2. `Authorization` is compared in full with `BELVO_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. Payments Mexico bodies carry `eventCode`; Payments Brazil V2 bodies carry `schema_version` and
   `resource`; Brazil V1 and Aggregation bodies carry `webhook_type` and `webhook_code`, with
   `object_id` (Brazil V1) or `link_id` (Aggregation).
   The handler dispatches on whichever is present.
5. It returns `200 {"received": true}`.
