# Fiber AI Webhooks - Next.js Example

Minimal example of receiving Fiber AI webhooks (delivered through Svix) with
signature verification using the official [`svix`](https://www.npmjs.com/package/svix) library,
as a Next.js App Router route handler.

## Prerequisites

- Node.js 18+
- A Fiber AI account with a webhook endpoint and its `whsec_` signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your signing secret to `.env.local` (`FIBER_AI_WEBHOOK_SECRET`)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The endpoint is `POST /webhooks/fiber-ai`.

## Test

```bash
npm test
```

Tests sign payloads with the same algorithm Fiber AI uses
(`HMAC-SHA256` over `{svix-id}.{svix-timestamp}.{raw body}`).

To send a real signed delivery, use the `sendTestWebhookEvent` API operation or
the "Send Example" button in the Fiber webhook portal.

## Notes

- The handler reads `request.text()` so any content type verifies against the raw bytes.
- The `svix` library always enforces a 5-minute timestamp window. Hookdeck retries and
  replays resend the original timestamp, so late retries fail verification; see
  `../../references/verification.md` for a manual verifier where the window can be dropped.

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 fiber-ai --path /webhooks/fiber-ai
```

Use the printed URL as the endpoint URL in Fiber AI (it must be HTTPS).
