# Ably Webhooks - Express Example

Minimal example of receiving Ably webhooks (outbound HTTP integration rules) with signature verification.

## Prerequisites

- Node.js 18+
- An Ably app with a webhook integration rule that has **Sign with key** enabled

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your full Ably API key (`appId.keyId:keyValue`) in `.env` as `ABLY_API_KEY`. It must be the same key you chose in the rule's **Sign with key** setting. The handler uses only the `keyValue` part (after the `:`) as the HMAC key.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/ably`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 ably --path /webhooks/ably
```

Paste the Hookdeck URL into the **URL** field of your Ably integration rule, then use **Test rule** or publish a message to trigger a delivery.

## Test

```bash
npm test
```

Tests generate real `X-Ably-Signature` values (base64 HMAC-SHA256 of the raw body, keyed with `keyValue`) and cover enveloped, batched (`items[]`), msgpack and non-enveloped requests, plus tampered, missing and wrong-key signatures.

## Notes

- The route uses `express.raw({ type: '*/*' })`, so the exact bytes are verified whatever the content type (`application/json`, `application/x-msgpack`, `text/plain`, `application/octet-stream`).
- The signature covers the body only. For non-enveloped events the `x-ably-envelope-*` headers are not signed; use enveloped events if you need to trust that metadata.
- Bad signatures return 400. Ably retries failed `5XX` responses, so return 2xx quickly and defer slow work.
