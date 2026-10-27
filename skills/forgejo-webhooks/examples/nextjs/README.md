# Forgejo Webhooks - Next.js Example

Minimal example of receiving Forgejo webhooks with signature verification (`X-Forgejo-Signature`, HMAC-SHA256).

## Prerequisites

- Node.js 18+
- A Forgejo (or Codeberg) repository, organization, or instance where you can add webhooks, and the webhook **Secret**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Forgejo webhook Secret to `.env` as `FORGEJO_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/forgejo`.

The route reads the raw bytes with `await request.arrayBuffer()`, so the exact bytes are verified for any content type, and parses JSON only after the signature check. It dispatches on the `X-Forgejo-Event-Type` header.

## Test

Run the unit tests (they generate real signatures):

```bash
npm test
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 forgejo --path /webhooks/forgejo
```

Then add the Hookdeck URL as the Target URL under **Settings → Webhooks → Add webhook → Forgejo**, and use these settings:

> Set a secret on the Forgejo webhook. Without one, deliveries are unsigned and fail verification. Set the webhook's HTTP method to POST and its content type to application/json. Form-encoded and GET deliveries sign the JSON payload rather than the request body and fail verification.

Use **Test Delivery** to send a `push` event.
