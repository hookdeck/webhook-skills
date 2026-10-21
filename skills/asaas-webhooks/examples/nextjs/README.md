# Asaas Webhooks - Next.js Example

Minimal example of receiving Asaas webhooks and authenticating them with the `asaas-access-token` header, using the App Router.

## Prerequisites

- Node.js 18+
- An Asaas account (Sandbox is fine) and a webhook `authToken` of 32-255 characters

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `ASAAS_WEBHOOK_TOKEN` in `.env.local` to the same authToken you enter on the webhook in Asaas.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and listens at `POST /webhooks/asaas`.

## Test

Run the automated tests:

```bash
npm test
```

To receive real webhooks locally, start a tunnel:

```bash
npx hookdeck-cli listen 3000 asaas --path /webhooks/asaas
```

Use the printed URL as the webhook URL in Asaas (User menu > Integrations > Webhooks), then create a charge in the Sandbox. Or send one by hand:

```bash
curl -X POST http://localhost:3000/webhooks/asaas \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" \
  -d '{"id":"evt_1","event":"PAYMENT_RECEIVED","payment":{"id":"pay_1","value":100}}'
```
