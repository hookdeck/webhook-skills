# Help Scout Webhooks - Next.js Example

Minimal example of receiving Help Scout webhooks with signature verification (`X-HelpScout-Signature`, base64 HMAC-SHA1 of the raw body) using the Next.js App Router.

## Prerequisites

- Node.js 18+
- Help Scout account with access to Workspace > Apps > Webhooks

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the secret key you set in the Help Scout Webhooks app to `.env.local` as `HELPSCOUT_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook endpoint is `POST /webhooks/help-scout`.

## Test

Run the automated tests (they sign payloads with the real algorithm, including the test vector from the Help Scout docs):

```bash
npm test
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 help-scout --path /webhooks/help-scout
```

Use the URL it prints as the callback URL in the Help Scout Webhooks app, then trigger an event such as creating a conversation.

## Notes

- The route reads `request.text()` so the signed bytes stay untouched. Never use `request.json()` before verifying.
- Verification lives in `lib/verify.ts` so route files only export HTTP handlers.
- Return 400 for a bad signature. A 410 response makes Help Scout delete the webhook.
