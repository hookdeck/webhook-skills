# Asana Webhooks - Next.js Example

Minimal example of receiving Asana webhooks with the `X-Hook-Secret` handshake and
`X-Hook-Signature` verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- An Asana Personal Access Token (to create the webhook)
- A project (or other resource) `gid` to watch

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Capture `ASANA_WEBHOOK_SECRET` when you create the webhook (see below) and add it to `.env`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook route is
`POST /webhooks/asana` (`app/webhooks/asana/route.ts`).

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 asana --path /webhooks/asana
```

Copy the public URL it prints, then create the webhook (this triggers the handshake):

```bash
curl -X POST https://app.asana.com/api/1.0/webhooks \
  -H "Authorization: Bearer $ASANA_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data": {"resource": "<PROJECT_GID>", "target": "https://<your-tunnel>/webhooks/asana"}}'
```

Asana also returns the secret in the body of the `201 Created` response to
`POST /webhooks`. Through a Hookdeck URL, Hookdeck answers the handshake itself, so
copy `X-Hook-Secret` from that response body into `ASANA_WEBHOOK_SECRET` (and restart)
so subsequent event deliveries verify.

## How It Works

- **Handshake:** a request with an `X-Hook-Secret` header is echoed back with `200`.
- **Delivery:** a request with an `X-Hook-Signature` header is verified with
  HMAC-SHA256 over the raw body (`await request.text()`), then the `events` batch is
  dispatched.
- **Heartbeats:** `{"events": []}` deliveries are verified and acknowledged.

The [`asana` SDK](https://www.npmjs.com/package/asana) is included for creating
webhooks and fetching full resource details after an event.

## Test

```bash
npm test
```

## Endpoint

- `POST /webhooks/asana` - Handles the handshake and verifies/dispatches events
