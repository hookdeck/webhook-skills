# Oh Dear Webhooks - Express Example

Minimal example of receiving Oh Dear webhooks with `OhDear-Signature` verification (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- Oh Dear account with the team's webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your team signing secret (shown as "Web hook signing secret" in Oh Dear's notification settings) to `.env` as `OH_DEAR_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and handles `POST /webhooks/oh-dear`.

## Test

Run the automated tests (they sign payloads with the same algorithm Oh Dear uses):

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 oh-dear --path /webhooks/oh-dear
```

Paste the URL the CLI prints into the webhooks section of Oh Dear's notification settings. You can resend any delivery from the webhook log.
