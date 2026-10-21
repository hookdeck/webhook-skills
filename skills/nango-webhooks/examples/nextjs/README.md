# Nango Webhooks - Next.js Example

Minimal example of receiving Nango webhooks in a Next.js App Router route handler, with `X-Nango-Hmac-Sha256` signature verification using the official [`@nangohq/node`](https://www.npmjs.com/package/@nangohq/node) SDK.

## Prerequisites

- Node.js 20+
- A Nango environment's webhook signing key and API key (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. In `.env.local`, set:
   - `NANGO_WEBHOOK_SIGNING_KEY` — **Environment Settings > Webhooks > Signing key** (not the API key)
   - `NANGO_API_KEY` — **Environment Settings > API key** (required by the SDK constructor)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook route is `POST /webhooks/nango` ([app/webhooks/nango/route.ts](app/webhooks/nango/route.ts)).

The route reads the body with `await request.text()` so the signature is checked against the raw bytes before any JSON parsing.

## Test

### Run unit tests

```bash
npm test
```

The tests sign payloads with Nango's algorithm (hex HMAC-SHA256 of the raw body) and cover valid, missing, tampered and wrong-key signatures, the legacy `X-Nango-Signature` header, and the `auth`, `sync`, `forward` and `async_action` webhook types.

### Receive real webhooks with the Hookdeck CLI

```bash
# No account required
npx hookdeck-cli listen 3000 nango --path /webhooks/nango
```

Add the printed URL under **Environment Settings > Webhook URLs** (or as a test connection's `webhook_url_override`), then create a connection or trigger a sync.
