# Anarlog Webhooks - Next.js Example

Minimal example of receiving Anarlog webhooks with signature verification using the App Router.

## Prerequisites

- Node.js 18+
- Anarlog desktop app with a webhook endpoint configured (Settings → Developers → Webhooks) and its `whsec_...` signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Anarlog signing secret to `.env` as `ANARLOG_WEBHOOK_SECRET`. Use the **whole** value including the `whsec_` prefix: Anarlog uses it as a plain HMAC key (this is not Standard Webhooks).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 anarlog --path /webhooks/anarlog
```

Then use the Hookdeck URL as the endpoint URL in Anarlog (Settings → Developers → Webhooks → Add webhook). If you put Hookdeck in front, paste the whole signing secret, including `whsec_`, into the Hookdeck source.

### Trigger Test Events

Click **Test** on the endpoint in Anarlog to send a `webhook.test` delivery. Deliveries only run while the Anarlog desktop app is open.

## Endpoint

- `POST /webhooks/anarlog` - Receives and verifies Anarlog webhook events (`x-anarlog-signature`). Reads the body with `request.text()` so the signature is checked against the raw bytes. Verification lives in `lib/verify.ts`.
