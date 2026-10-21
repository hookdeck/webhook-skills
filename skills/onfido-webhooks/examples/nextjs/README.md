# Onfido Webhooks - Next.js Example

Minimal example of receiving Onfido (Entrust Identity Verification) webhooks with signature verification, using the official `@onfido/api` `WebhookEventVerifier`.

## Prerequisites

- Node.js 18+
- Onfido account with a registered webhook and its webhook token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook token (the `token` field returned when the webhook was registered, or from the Dashboard "Webhook Management" page) to `.env` as `ONFIDO_WEBHOOK_TOKEN`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 onfido --path /webhooks/onfido
```

Use the Hookdeck URL as the webhook URL in Onfido (it must be HTTPS).

## Test

```bash
npm test
```

Tests generate real `X-SHA2-Signature` values (HMAC-SHA256 hex of the raw body, keyed with the token).
