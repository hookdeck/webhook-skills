# GREEN-API Webhooks - Next.js Example

Minimal example of receiving GREEN-API (WhatsApp API gateway) Webhook Endpoint
notifications with Next.js, authenticated with the `webhookUrlToken`
`Authorization` header.

## Prerequisites

- Node.js 18+
- A GREEN-API instance with a Webhook URL Token set. See
  [../../references/setup.md](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `GREEN_API_WEBHOOK_URL_TOKEN` in `.env` to **exactly** what you entered
   as `webhookUrlToken` in GREEN-API, e.g. `Bearer my-secret` or
   `Basic dXNlcjpwYXNz`. A bare token with no scheme is treated as
   `Bearer <token>`, which is what GREEN-API sends by default.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at
`POST /webhooks/green-api`.

## Test

The tests send documented GREEN-API payloads with valid and invalid
`Authorization` headers. No GREEN-API account needed:

```bash
npm test
```

## Receive Real Webhooks Locally

Tunnel GREEN-API to your local server with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 green-api --path /webhooks/green-api
```

Set the printed URL as the instance's `webhookUrl` (console or
`SetSettings`), then send a WhatsApp message to the linked number.

You can also simulate a delivery with curl:

```bash
curl -X POST http://localhost:3000/webhooks/green-api \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-long-random-secret" \
  -d '{"typeWebhook":"stateInstanceChanged","instanceData":{"idInstance":1,"wid":"","typeInstance":"whatsapp"},"timestamp":1586700690,"stateInstance":"authorized"}'
```

## How It Works

1. GREEN-API `POST`s a JSON notification. If `webhookUrlToken` is set, the
   `Authorization` header is that full value: `Bearer <token>` (default) or
   `Basic <token>`.
2. The handler compares the **whole** header, scheme included, against the
   value built from `GREEN_API_WEBHOOK_URL_TOKEN` using a constant-time
   compare. It returns `401` on a mismatch or missing header.
3. It dispatches on `typeWebhook` (`lib/green-api.ts`; the route is `app/webhooks/green-api/route.ts`) and returns `200`.
   GREEN-API retries non-2xx responses every minute for up to 24 hours, so keep
   handlers idempotent.
