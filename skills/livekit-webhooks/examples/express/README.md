# LiveKit Webhooks - Express Example

Minimal example of receiving LiveKit webhooks (LiveKit Cloud or self-hosted
`livekit-server`) with signature verification.

LiveKit signs each delivery with a **JWT in the `Authorization` header** (bare token, no
`Bearer ` prefix): HS256 with your project **API secret**, `iss` = your **API key**, and a
`sha256` claim holding base64(SHA-256(raw body)). This example verifies both halves
manually with [`jose`](https://github.com/panva/jose) and Node's `crypto`, so the steps
are visible. The one-line alternative is the official receiver:
`await new WebhookReceiver(apiKey, apiSecret).receive(rawBody, req.get('Authorization'))`
from `livekit-server-sdk`.

> **Content-Type gotcha:** LiveKit sends `Content-Type: application/webhook+json`.
> `express.json()` and the default `express.raw()` only match `application/json`, leave
> the body empty, and every delivery fails verification. This example binds
> `express.raw({ type: 'application/webhook+json' })` to the webhook route.

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
   cp .env.example .env
   ```

3. Set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env`. If either is missing, the
   handler rejects every request with 401 rather than skipping verification.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

The tests mint HS256 tokens the way LiveKit's sender does (iss, nbf, 5-minute exp,
`sha256` claim) and cover all 12 documented events, the three `agent_job_*` protocol
events, expired tokens, missing `exp`, missing `sha256`, wrong `iss`, pinned algorithm,
tampered and re-serialised bodies, and the `application/json` content-type trap.

To send a real signed event from LiveKit Cloud: **Settings → Webhooks → (your webhook) →
Actions → Send a test event**.

## Endpoints

- `POST /webhooks/livekit` - Receives and verifies LiveKit webhooks
- `GET /health` - Health check

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 livekit --path /webhooks/livekit
```

Use the printed HTTPS URL as the webhook URL in LiveKit Cloud, or under `webhook.urls` in
your self-hosted `config.yaml`.
