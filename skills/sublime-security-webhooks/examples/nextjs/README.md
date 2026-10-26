# Sublime Security Webhooks - Next.js Example

Minimal example of receiving Sublime Security webhook Action deliveries with signature verification (App Router).

## Prerequisites

- Node.js 18+
- Sublime Security account with a webhook Action and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook Action's signing secret to `.env.local` (`SUBLIME_SECURITY_WEBHOOK_SECRET`). In Sublime, open **Actions**, select the webhook Action, and click to reveal the secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The route (`app/webhooks/sublime-security/route.ts`) reads the raw body with `request.text()` and verifies `X-Sublime-Signature` (`t=<unix seconds>,v0=<hex>`): lowercase hex HMAC-SHA256 of `<t>.<raw body>`, accepting any `v0` value that matches. A missing or invalid signature gets a 401. The timestamp check is off by default because Hookdeck retries and replays keep the original timestamp; set `SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 sublime-security --path /webhooks/sublime-security
```

Use the Hookdeck URL as the webhook Action's URL in Sublime (Actions → webhook Action), then attach the Action to a rule or trigger it manually on a message.
