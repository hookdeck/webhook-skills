# Soniox Webhooks - Next.js Example

Minimal example of receiving Soniox async transcription webhooks with the App Router and
authenticating them with the header you set per transcription (`webhook_auth_header_name` /
`webhook_auth_header_value`).

Soniox does not sign payloads, so there is no HMAC to verify. The route handler looks up the
configured header (`Headers.get()` is case-insensitive) and compares the whole value with your
secret in constant time. It reads the body with `request.text()`, so any content type works.

> Soniox webhooks are not signed. Send webhook_auth_header_name and webhook_auth_header_value with every async transcription, and enter the same name and value here.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Soniox account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `SONIOX_WEBHOOK_HEADER` to the `webhook_auth_header_name` you use, and
   `SONIOX_WEBHOOK_SECRET` to the exact `webhook_auth_header_value` (including any `Bearer `).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/soniox`.

## Test

```bash
npm test
```

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/soniox \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"id":"548d023b-2b3d-4dc2-a3ef-cca26d05fd9a","status":"completed"}'
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 soniox --path /webhooks/soniox
```

Use the printed URL as `webhook_url` when creating a transcription.

## How It Works

- `lib/verify-soniox.ts`: `verifySonioxRequest()`
- `app/webhooks/soniox/route.ts`: the `POST /webhooks/soniox` handler

1. The configured header is checked before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `status`: `completed` or `error`.
4. It returns `200 {"received": true}`.
