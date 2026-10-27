# Spacelift Webhooks - Next.js Example

Minimal example of receiving Spacelift webhooks with signature verification (App Router).

Spacelift signs the raw body with HMAC-SHA256 and sends it in `X-Signature-256` as `sha256=<hex>`.

Set a secret on the Spacelift webhook. Without one, deliveries are unsigned and fail verification.

## Prerequisites

- Node.js 18+
- A Spacelift webhook with a secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `SPACELIFT_WEBHOOK_SECRET` to the secret you entered on the Spacelift webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route at `/webhooks/spacelift` handles `GET`, `POST`, `PUT`, `PATCH` and `DELETE` (Spacelift doesn't name its method; Hookdeck's Spacelift source pre-selects POST without managing it, so allow any other method on the source too).

## Test

```bash
npm test
```

The tests sign payloads from Spacelift's docs with the real algorithm and cover valid, bare and uppercase digests, tampering, wrong secret, missing and malformed headers, every method and an empty GET body.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 spacelift --path /webhooks/spacelift
```

Use the printed URL as the webhook endpoint in Spacelift.

## How It Works

- `lib/verify-spacelift.ts`: `verifySpaceliftSignature()` and `classify()`
- `app/webhooks/spacelift/route.ts`: the route handler

1. The body is read as bytes with `await request.arrayBuffer()` (any content type; empty is fine) and verified before parsing.
2. `X-Signature-256` is validated (64 hex chars, optional `sha256=`) and compared in constant time. Failure returns `401`.
3. The payload shape picks the message: `run` or `internal_error`. Stale `stateVersion`s are ignored.
