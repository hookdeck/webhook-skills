# Cin7 Core Webhooks - Express Example

Minimal example of receiving Cin7 Core webhooks and authenticating them with the Bearer or custom header configured on the webhook.

Cin7 Core does not sign payloads, so there is no HMAC to verify. The handler compares the configured header with your stored value (the whole value, constant time). The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

> A static shared credential authenticates the sender, not the body, and gives no replay protection. Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Cin7 Core webhook created with `bearerauth` or `ExternalHeaders` (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CIN7_CORE_WEBHOOK_HEADER` to the header name and `CIN7_CORE_WEBHOOK_SECRET` to the exact whole value (e.g. `authorization` and `Bearer <token>`).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/cin7-core`.

## Test

```bash
npm test
```

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/cin7-core \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"EventType":"Sale/Created"}'
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 cin7-core --path /webhooks/cin7-core
```

Put the printed URL in the Cin7 Core webhook.

## How It Works

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `EventType`: `Sale/Created`, `Sale/OrderAuthorised`, `Sale/ShipmentAuthorised`, `Purchase/OrderAuthorised`, `Product/Updated`.
4. It returns `200 {"received": true}`.
