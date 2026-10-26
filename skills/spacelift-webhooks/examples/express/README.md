# Spacelift Webhooks - Express Example

Minimal example of receiving Spacelift webhooks with signature verification.

Spacelift signs the raw body with HMAC-SHA256 and sends it in `X-Signature-256` as `sha256=<hex>`. The handler verifies it in constant time, then tells `run` and `internal_error` messages apart.

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
   cp .env.example .env
   ```

3. Set `SPACELIFT_WEBHOOK_SECRET` to the secret you entered on the Spacelift webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `GET`, `POST`, `PUT`, `PATCH` and `DELETE` at `/webhooks/spacelift` (Spacelift doesn't name its method; Hookdeck's Spacelift source pre-selects POST without managing it, so allow any other method on the source too).

## Test

```bash
npm test
```

The tests sign payloads from Spacelift's docs with the real algorithm and cover valid, bare and uppercase digests, tampering, wrong secret, missing and malformed headers, every method, an empty GET body, and out-of-order `stateVersion`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 spacelift --path /webhooks/spacelift
```

Use the printed URL as the webhook endpoint in Spacelift.

## How It Works

- `src/index.js`: `verifySpaceliftSignature()` and the `/webhooks/spacelift` route

1. The body is read raw (`express.raw({ type: '*/*' })`), so any content type works and the exact bytes are verified. A missing body is zero bytes.
2. `X-Signature-256` is validated (64 hex chars, optional `sha256=`), then compared in constant time. Failure returns `401`.
3. Only then is the JSON parsed (`400` if invalid).
4. The payload shape picks the message: `run` (has `state`, `stateVersion`, `run`) or `internal_error` (has `title`, `body`). Stale `stateVersion`s are ignored.
