# Podium Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Podium](https://podium.com) webhooks with signature verification (hex HMAC-SHA256 over `{podium-timestamp}.{raw body}`).

## Prerequisites

- Node.js 18+
- A Podium location or organization, and a webhook created with a `secret` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the `secret` you set when creating the Podium webhook in `PODIUM_WEBHOOK_SECRET`. Webhooks created without a secret are unsigned and fail verification.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route ([app/webhooks/podium/route.ts](app/webhooks/podium/route.ts)) exports GET, POST, PUT, PATCH and DELETE handlers because Podium's docs don't name the HTTP method. It reads `await request.arrayBuffer()`, so the exact bytes are verified and a missing body counts as empty.

## Test

```bash
npm test
```

The tests call the route handlers directly and sign payloads the way Podium does (`hex(HMAC-SHA256(secret, "{timestamp}.{raw body}"))`). They cover the seven handled events, every method, an empty GET body, raw (non-re-serialised) bodies, tampering, a wrong or hex-decoded secret, missing or malformed headers, and the opt-in timestamp tolerance (`PODIUM_WEBHOOK_TOLERANCE_SECONDS`, off by default).

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 podium --path /webhooks/podium
```

Use the printed URL as the webhook `url` when you create the Podium webhook (with a `secret`).

## Notes

- `podium-timestamp` is Unix milliseconds. There is no timestamp window by default, because Hookdeck retries and replays resend the original timestamp; set `PODIUM_WEBHOOK_TOLERANCE_SECONDS` to opt in.
- Events are dispatched on `metadata.event_type` (body: `{ data, metadata: { event_type, version } }`). Respond within 5 seconds.
