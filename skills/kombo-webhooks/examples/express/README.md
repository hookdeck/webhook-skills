# Kombo Webhooks - Express Example

Minimal example of receiving Kombo webhooks with signature verification (`X-Kombo-Signature`, unpadded base64url HMAC-SHA256).

## Prerequisites

- Node.js 18+
- Kombo account with a Kombo Webhook Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Kombo Webhook Secret to `.env` (Kombo dashboard > Configuration > Webhooks)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

Receive Kombo webhooks locally with the Hookdeck CLI (no install, no account needed):

```bash
npx hookdeck-cli listen 3000 kombo --path /webhooks/kombo
```

Add the URL it prints as a webhook in the Kombo dashboard.

## Test

```bash
npm test
```

Or use the test-request button in the Kombo dashboard's webhook list to send a signed dummy event.

## Notes

- The route uses `express.raw({ type: '*/*' })` so the signed bytes are preserved for any content type
- Never re-serialize the parsed JSON before verifying
