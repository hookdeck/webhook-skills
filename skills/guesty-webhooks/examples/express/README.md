# Guesty Webhooks - Express Example

Minimal example of receiving Guesty webhooks with signature verification using
the official [`svix`](https://docs.svix.com/receiving/verifying-payloads/how) SDK
(Guesty delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Guesty Open API access and a webhook subscription (created via `POST /v1/webhooks`)
- The endpoint's signing secret from `GET /v1/webhooks-v2/secret?url=<endpoint URL>` or Guesty → Developer tools → Webhooks

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `GUESTY_WEBHOOK_SECRET` in `.env` (Svix default format, `whsec_...`)

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/guesty
```

## Test

```bash
npm test
```

The tests sign payloads with the Svix algorithm (HMAC-SHA256 over
`{svix-id}.{svix-timestamp}.{raw body}`) and cover valid, rotated, invalid,
tampered, and stale requests plus each handled event.

## Local Testing with Hookdeck

Guesty requires a public HTTPS URL on port 443. Use the Hookdeck CLI to get one
(no account required):

```bash
npx hookdeck-cli listen 3000 guesty --path /webhooks/guesty
```

Create a subscription for the Source URL the CLI prints (it forwards to `/webhooks/guesty` locally), then fetch that URL's secret:

```bash
curl -X POST https://open-api.guesty.com/v1/webhooks \
  -H "Authorization: Bearer $GUESTY_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "<your-hookdeck-source-url>", "events": ["reservation.created.v2", "reservation.updated.v2", "listing.updated"]}'

curl -G https://open-api.guesty.com/v1/webhooks-v2/secret \
  --data-urlencode "url=<your-hookdeck-source-url>" \
  -H "Authorization: Bearer $GUESTY_ACCESS_TOKEN"
```

Then create a reservation or edit a listing in Guesty to trigger events. Failed
deliveries can be replayed from Guesty → Developer tools → Webhooks.
