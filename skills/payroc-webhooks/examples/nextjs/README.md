# Payroc Webhooks - Next.js Example

Minimal example of receiving Payroc event subscription webhooks and authenticating them with the
`Payroc-Secret` header.

Covers event subscriptions only, not Hosted Payments Page callbacks.

Payroc does not sign payloads, so there is no HMAC to verify. The handler compares the whole
`Payroc-Secret` header value with your subscription secret in constant time. That authenticates
the sender, not the body, and gives no replay protection, so use HTTPS, dedupe on the event `id`
and rotate the secret if it leaks. The route reads the body with `request.text()`, so any
content type works.

## Prerequisites

- Node.js 20+
- A Payroc event subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAYROC_WEBHOOK_SECRET` to the `secret` of your subscription's notification.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/payroc`.

## Test

```bash
npm test
```

The tests send the documented events with correct, wrong and missing secrets. No Payroc account is
needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/payroc \
  -H "Content-Type: application/json" \
  -H "Payroc-Secret: $PAYROC_WEBHOOK_SECRET" \
  -d '{"specversion":"1.0","type":"processingAccount.status.changed","version":"1.0.0","source":"payroc","id":"123e4567-e89b-12d3-a456-426614174000","time":"2024-07-02T15:30:00.000Z","datacontenttype":"application/json","data":{"processingAccountId":"38765","status":"entered"}}'
```

## Receive Webhooks Locally

Payroc can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 payroc --path /webhooks/payroc
```

Use the printed URL as the notification URL of your subscription.

## How It Works

- `lib/verify-payroc.ts`: `verifyPayrocRequest()`
- `app/webhooks/payroc/route.ts`: the `POST /webhooks/payroc` route

1. The `Payroc-Secret` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A repeated CloudEvent `id` is acknowledged without reprocessing.
4. The handler dispatches on `type`: `processingAccount.status.changed`,
   `processingAccount.riskStatus.changed`, `processingAccount.signature.signed`,
   `terminalOrder.status.changed`.
5. It returns exactly `200 {"received": true}`. Payroc retries any other status five times.
