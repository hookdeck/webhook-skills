# Rev AI Webhooks - Express Example

Minimal example of receiving Rev AI (speech-to-text) job webhooks and authenticating them
with the `Authorization` header.

Rev AI does not sign payloads. The credential is the `Authorization` header you set per job
in `notification_config.auth_headers`, with a value of the form `<scheme> <token>`
(for example `Bearer <token>`). The handler compares the **whole header value**, scheme
prefix included, with a constant-time comparison. A static credential authenticates the
sender, not the body, and gives no replay protection: use HTTPS and rotate it if it leaks.

## Prerequisites

- Node.js 18+
- A Rev AI account and access token (to submit jobs)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `REV_AI_AUTHORIZATION` to the full header value you pass when submitting jobs,
   e.g. `Bearer <token>`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/rev-ai`.

## Test

```bash
npm test
```

The tests send the documented `transcribed` and `failed` job payloads with correct, wrong and
missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/rev-ai \
  -H "Content-Type: application/json" \
  -H "Authorization: $REV_AI_AUTHORIZATION" \
  -d '{"job":{"id":"Umx5c6F7pH7r","status":"transcribed","created_on":"2018-05-05T23:23:22.29Z","duration_seconds":356.24}}'
```

## Receive Rev AI Webhooks Locally

```bash
npx hookdeck-cli listen 3000 rev-ai --path /webhooks/rev-ai
```

Use the printed URL as `notification_config.url` when submitting a job.

## How It Works

- `src/index.js`: `verifyRevAiRequest()` plus the `POST /webhooks/rev-ai` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared with `REV_AI_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. `job.status` is `transcribed` (fetch the transcript) or `failed` (see `job.failure`).
5. It returns `200 {"received": true}`. Rev AI retries every 30 minutes for 24 hours
   until it gets a `200`.
