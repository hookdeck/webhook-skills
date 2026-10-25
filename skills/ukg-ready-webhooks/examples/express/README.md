# UKG Ready Webhooks - Express Example

Minimal example of receiving UKG Ready webhook subscriptions and authenticating them with the
`Authorization` header. For **UKG Ready** (formerly Kronos Workforce Ready) only, not UKG Pro.

UKG Ready does not sign payloads. With Bearer Token authentication it is expected to send
`Authorization: Bearer <token>` (if deliveries are rejected, capture one and set the expected
value exactly as received). The handler compares the **whole header value**, including the
`Bearer ` prefix, in constant time. A static credential authenticates the sender, not the body,
and gives no replay protection, so use HTTPS and rotate the token if it leaks.

## Prerequisites

- Node.js 18+
- A UKG Ready account with access to Global Setup > Webhook Subscriptions
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `UKG_READY_AUTHORIZATION` to the full header value, e.g. `Bearer <token>`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/ukg-ready`.

## Test

```bash
npm test
```

The tests send an illustrative payload (UKG Ready shows the real shape only in its app) with
correct, wrong, Basic and missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ukg-ready \
  -H "Content-Type: application/json" \
  -H "Authorization: $UKG_READY_AUTHORIZATION" \
  -d '{"accountId":1001,"email":"ada@example.com"}'
```

## Receive UKG Ready Webhooks Locally

```bash
npx hookdeck-cli listen 3000 ukg-ready --path /webhooks/ukg-ready
```

Use the printed URL as the Endpoint URL of the subscription. Note that **Test Connection** in
UKG Ready only checks reachability and sends no payload.

## How It Works

- `src/index.js`: `verifyUkgReadyRequest()` plus the `POST /webhooks/ukg-ready` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared in full with `UKG_READY_AUTHORIZATION` (constant time). Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. It logs the field names and returns `200 {"received": true}`.
