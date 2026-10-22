# Kombo Webhooks - Next.js Example

Minimal example of receiving Kombo webhooks with signature verification (`X-Kombo-Signature`, unpadded base64url HMAC-SHA256) using the App Router.

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
   cp .env.example .env.local
   ```

3. Add your Kombo Webhook Secret to `.env.local` (Kombo dashboard > Configuration > Webhooks)

## Run

```bash
npm run dev
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

- The route reads the body with `request.text()` so the signed bytes are preserved
- Verification lives in `lib/verify.ts`; the route lives at `app/webhooks/kombo/route.ts`
- Never re-serialize the parsed JSON before verifying
