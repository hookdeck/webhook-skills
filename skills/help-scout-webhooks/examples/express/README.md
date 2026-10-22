# Help Scout Webhooks - Express Example

Minimal example of receiving Help Scout webhooks with signature verification (`X-HelpScout-Signature`, base64 HMAC-SHA1 of the raw body).

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
   cp .env.example .env
   ```

3. Add the secret key you set in the Help Scout Webhooks app to `.env` as `HELPSCOUT_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

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

- The route uses `express.raw({ type: '*/*' })` so the body stays raw whatever content type Help Scout sends.
- Return 400 for a bad signature. A 410 response makes Help Scout delete the webhook.
