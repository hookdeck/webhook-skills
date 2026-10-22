# PostHog Webhooks - Next.js Example

Minimal example of receiving PostHog webhook destination requests with Standard Webhooks signature verification.

## Prerequisites

- Node.js 18+
- A PostHog Webhook destination (Data pipeline → Destinations → HTTP Webhook) with a **Signing secret**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret and put the **same string** in `.env` and in the PostHog destination's "Signing secret" input:
   ```bash
   echo "whsec_$(openssl rand -base64 32)"
   ```

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 (route: `app/webhooks/posthog/route.ts`)

## Test

```bash
npm test
```

To receive real PostHog requests locally:

```bash
npx hookdeck-cli listen 3000 posthog --path /webhooks/posthog
```

Use the Hookdeck URL as the PostHog destination URL. Hookdeck retries and replays resend the original `webhook-timestamp`, so the `standardwebhooks` library (fixed 5-minute window) rejects late retries. See `../../references/verification.md` for a verifier with a configurable window.
