# LiveKit Webhooks - Next.js Example

Minimal example of receiving LiveKit webhooks (LiveKit Cloud or self-hosted
`livekit-server`) with signature verification, using the Next.js App Router.

LiveKit signs each delivery with a **JWT in the `Authorization` header** (bare token, no
`Bearer ` prefix): HS256 with your project **API secret**, `iss` = your **API key**, and a
`sha256` claim holding base64(SHA-256(raw body)). The route reads the raw body with
`await request.text()` and verifies both halves manually with
[`jose`](https://github.com/panva/jose) and Node's `crypto`. The one-line alternative is
`await new WebhookReceiver(apiKey, apiSecret).receive(rawBody, authHeader)` from
`livekit-server-sdk`.

## Prerequisites

- Node.js 20+
- A LiveKit project API key + secret: the key you selected as the webhook's **Signing API
  key** (Cloud), or `webhook.api_key` in `config.yaml` (self-hosted)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env.local`. If either is missing,
   the route rejects every request with 401 rather than skipping verification.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the webhook route is `/webhooks/livekit`.

## Test

```bash
npm test
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 livekit --path /webhooks/livekit
```

Use the printed HTTPS URL as the webhook URL in LiveKit Cloud (**Settings → Webhooks**),
or under `webhook.urls` in your self-hosted `config.yaml`. In Cloud, **Actions → Send a
test event** sends a real signed event.
