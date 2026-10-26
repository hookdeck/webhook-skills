# Mailcoach Webhooks - Next.js Example

Minimal example of receiving Mailcoach webhooks with signature verification (`Signature` header, hex HMAC-SHA256 of the raw body) using the App Router.

## Prerequisites

- Node.js 18+
- A Mailcoach account (hosted or self-hosted) with a webhook that has a secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the secret you entered on the Mailcoach webhook's details page to `.env.local` as `MAILCOACH_WEBHOOK_SECRET`. Set a secret on the Mailcoach webhook. Without one, deliveries are unsigned and fail verification.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/mailcoach`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 mailcoach --path /webhooks/mailcoach
```

Use the Hookdeck URL as the URL of your Mailcoach webhook (Settings > Webhooks), then subscribe someone to a list or send a campaign.

## Test

```bash
npm test
```

Tests generate real hex HMAC-SHA256 signatures for the documented events.
