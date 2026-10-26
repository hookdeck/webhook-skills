# ZITADEL Webhooks - Express Example

Minimal example of receiving ZITADEL Actions v2 webhooks (targets with the JSON payload type) with signature verification.

## Prerequisites

- Node.js 18+
- A ZITADEL instance (cloud or self-hosted) with an Actions v2 target using `PAYLOAD_TYPE_JSON`, and its `signingKey`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the target's `signingKey` to `.env` (`ZITADEL_WEBHOOK_SECRET`).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })` and verifies `ZITADEL-Signature` (`t=<unix seconds>,v1=<hex>`): HMAC-SHA256 of `<t>.<raw body>`, keyed with the signing key. It accepts the request if any `v1=` entry matches, and answers `401` otherwise. The timestamp check is off by default because retries and replays keep the original timestamp; set `ZITADEL_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 zitadel --path /webhooks/zitadel
```

Use the Hookdeck URL as the `endpoint` of your ZITADEL target. Only Actions v2 targets with the JSON payload type are supported. JWT and JWE payload types aren't.
