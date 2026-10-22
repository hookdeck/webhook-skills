# Rev AI Webhooks - Next.js Example

Minimal example of receiving Rev AI (speech-to-text) job webhooks with the App Router and
authenticating them with the `Authorization` header.

Rev AI does not sign payloads. The credential is the `Authorization` header you set per job
in `notification_config.auth_headers` (`<scheme> <token>`, e.g. `Bearer <token>`). The route
compares the **whole header value**, scheme prefix included, in constant time. A static
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS
and rotate it if it leaks.

## Prerequisites

- Node.js 18+
- A Rev AI account and access token

## Setup

```bash
npm install
cp .env.example .env.local
```

Set `REV_AI_AUTHORIZATION` in `.env.local` to the full header value, e.g. `Bearer <token>`.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST http://localhost:3000/webhooks/rev-ai`.

## Test

```bash
npm test
```

## Receive Rev AI Webhooks Locally

```bash
npx hookdeck-cli listen 3000 rev-ai --path /webhooks/rev-ai
```

Use the printed URL as `notification_config.url` when submitting a job.

## How It Works

- `lib/verify-rev-ai.ts`: `verifyRevAiRequest()` (constant-time compare of the full header)
- `app/webhooks/rev-ai/route.ts`: authenticates first, then reads the raw text and parses JSON,
  so any content type works. Failure returns `401`; a non-object body returns `400`.
- `job.status` is `transcribed` or `failed`; the route returns `200 {"received": true}`.
