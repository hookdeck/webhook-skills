# Mailjet Webhooks - Next.js Example

Minimal example of receiving Mailjet event webhooks in a Next.js App Router route handler with Basic auth verification.

Mailjet does not sign webhooks. Instead you embed credentials in the webhook URL (`https://user:pass@host/path`) and Mailjet sends them as an `Authorization: Basic ...` header. The route decodes the header and compares the username and password in constant time.

## Prerequisites

- Node.js 18+
- Mailjet account with access to Event Tracking (Account settings → Event tracking)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MAILJET_WEBHOOK_USERNAME` and `MAILJET_WEBHOOK_PASSWORD` in `.env.local`, then use the same values in the webhook URL you register with Mailjet.

## Run

```bash
npm run dev
```

Webhook endpoint: `POST http://localhost:3000/webhooks/mailjet`.

## Test

```bash
npm test
```

The tests send real `Authorization: Basic` headers and cover valid/invalid credentials, every event type (`sent`, `open`, `click`, `bounce`, `blocked`, `spam`, `unsub`) and grouped event arrays.

To receive real Mailjet events locally:

```bash
npx hookdeck-cli listen 3000 mailjet --path /webhooks/mailjet
```

Register the Hookdeck URL with `username:password@` in front of the host in Mailjet's Event tracking settings.
