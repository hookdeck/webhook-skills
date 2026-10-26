# Redo Webhooks - Next.js Example

Minimal example of receiving Redo return webhooks (`return.created`, `return.updated` and
backfill events) with the App Router and authenticating them with the `Authorization` header.

Redo does not sign payloads. Every delivery carries `Authorization: Bearer <your-subscriber-secret>`,
the secret you supplied when creating the subscription. The route compares the **whole header
value**, including the `Bearer ` prefix, in constant time, before reading the body. A static
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS and
rotate the secret if it leaks.

## Prerequisites

- Node.js 18+
- A Redo account with API access (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `REDO_AUTHORIZATION` to the full header value, e.g. `Bearer your-subscriber-secret`.
   Paste the full Authorization header value Redo sends: "Bearer " followed by your subscription secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/redo`.

## Test

```bash
npm test
```

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/redo \
  -H "Content-Type: application/json" \
  -H "Authorization: $REDO_AUTHORIZATION" \
  -d '{"type":"created","at":"2023-08-18T12:00:00Z","return":{"id":"64df65d4c5a4ca3eff4b4e43","status":"pending"}}'
```

## Receive Redo Webhooks Locally

```bash
npx hookdeck-cli listen 3000 redo --path /webhooks/redo
```

Use the printed URL as the `url` when creating the Redo webhook subscription.

## How It Works

- `lib/verify-redo.ts`: `verifyRedoRequest()` and `classify()`
- `app/webhooks/redo/route.ts`: the `POST` route

1. `Authorization` is compared with `REDO_AUTHORIZATION` before the body is read. Failure returns `401`.
2. The body is read as raw text (any content type) and must be a JSON object (`400` otherwise).
3. The payload `type` (`created`, `updated`, `backfill`) maps to `return.created`,
   `return.updated` or a backfill.
4. It returns `200 {"received": true}`.
