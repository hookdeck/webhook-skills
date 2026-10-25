# Pax8 Webhooks - Express Example

Minimal example of receiving Pax8 partner Webhooks API notifications and authenticating them
with the `Authorization` header.

Pax8 does not sign payloads. It sends back, in the `Authorization` header, the value you set
as `authorization` on the webhook, exactly as entered. The handler compares the **whole header
value** (including any `Bearer ` or `Basic ` prefix) with a constant-time comparison. A static
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS
and rotate it if it leaks.

Covers partner Webhooks API webhooks only. Paste the Authorization value exactly as set in Pax8, including any "Bearer " or "Basic " prefix.

## Prerequisites

- Node.js 18+
- A Pax8 partner account and API token to create the webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAX8_AUTHORIZATION` to the full value you set as `authorization` in Pax8.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/pax8`.

## Test

```bash
npm test
```

The tests send illustrative payloads (Pax8's docs do not specify the body) with correct,
wrong and missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/pax8 \
  -H "Content-Type: application/json" \
  -H "Authorization: $PAX8_AUTHORIZATION" \
  -d '{"topic":"SUBSCRIPTION","action":"CREATE","id":"00000000-0000-0000-0000-000000000000"}'
```

## Receive Pax8 Webhooks Locally

```bash
npx hookdeck-cli listen 3000 pax8 --path /webhooks/pax8
```

Use the printed URL as the webhook `url`, then call `POST /webhooks/{id}/topics/SUBSCRIPTION/test`.

## How It Works

- `src/index.js`: `verifyPax8Request()` plus the `POST /webhooks/pax8` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared with `PAX8_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. `topic` and `action` are read defensively (`SUBSCRIPTION`, `INVOICE`, `CLIENT`, `PRODUCT`,
   `QUOTE`, `USER`); anything else is logged as unclassified.
5. It returns `200 {"received": true}` well inside Pax8's 10 second timeout.
