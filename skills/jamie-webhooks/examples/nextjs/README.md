# Jamie Webhooks - Next.js Example

Minimal example of receiving Jamie webhooks with `x-jamie-signature` verification (App Router).

## Prerequisites

- Node.js 18+
- Jamie account (Plus plan or higher) with a webhook created using **Signature Verification**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Jamie signing secret to `.env.local` (`JAMIE_WEBHOOK_SECRET`). Choose Signature Verification when creating the Jamie webhook and paste its signing secret. API key mode is not supported.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the webhook route is `/webhooks/jamie`.

The route reads the raw body with `request.text()` and checks `v0` = HMAC-SHA256 (hex) of `<t>.<raw body>`. Failures return 401. By default it rejects timestamps more than 300 seconds from now (Jamie's documented window). Hookdeck retries and replays keep the original timestamp, so behind Hookdeck set `JAMIE_TIMESTAMP_TOLERANCE_SECONDS=0`.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 jamie --path /webhooks/jamie
```

Use the Hookdeck URL as the webhook URL in Jamie (Settings → Integrations → Webhooks), then record a meeting to trigger `meeting.completed`.
