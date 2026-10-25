# Nexthink Webhooks - Next.js Example

Minimal example of receiving Nexthink outbound-connector webhooks and authenticating them with
the `Authorization` header (App Router).

Nexthink does not sign payloads. The credential is the `Authorization` header built from the
**Bearer token** connector credential (`Authorization: Bearer <token>`). The handler compares the
**whole header value**, including the `Bearer ` prefix, with a constant-time comparison. A static
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS and
rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Nexthink instance with Integrations enabled and a Bearer token connector credential
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `NEXTHINK_AUTHORIZATION` to the full header value, e.g. `Bearer your-token`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. `app/webhooks/nexthink/route.ts` exports `POST`, `PUT` and
`PATCH` handlers (the webhook's Method dropdown).

## Test

```bash
npm test
```

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/nexthink \
  -H "Content-Type: application/json" \
  -H "Authorization: $NEXTHINK_AUTHORIZATION" \
  -d '{"event":"alert triggered","monitor":"High CPU (illustrative)"}'
```

## Receive Nexthink Webhooks Locally

```bash
npx hookdeck-cli listen 3000 nexthink --path /webhooks/nexthink
```

Use the printed URL as the connector credential's URL. Hookdeck's Nexthink source pre-selects
POST without managing the method: allow PUT or PATCH on the source if your webhook uses them.

## How It Works

- `lib/verify-nexthink.ts`: `verifyNexthinkRequest()`
- `app/webhooks/nexthink/route.ts`: the `POST`, `PUT` and `PATCH` handlers

1. `Authorization` is compared with `NEXTHINK_AUTHORIZATION` before the body is read. Failure
   returns `401`.
2. The body is read as raw text, so any content type works. An empty body is fine; a non-empty
   body must be valid JSON (`400` otherwise).
3. Nexthink adds no event field. The example dispatches on `event` from an illustrative payload
   template (`alert triggered`, `alert recovered`) that you write yourself.
4. It returns `200 {"received": true}`.
