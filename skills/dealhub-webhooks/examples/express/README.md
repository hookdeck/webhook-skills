# DealHub Webhooks - Express Example

Minimal example of receiving DealHub webhooks and authenticating the
`Authorization` header. DealHub doesn't sign webhooks, so this example compares
the full header value (`Bearer <TOKEN>` or `Basic <CREDENTIALS>`) in
constant time.

## Prerequisites

- Node.js 18+
- A DealHub administrator account with a webhook configured in **Token** or
  **Basic** authentication mode

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set **one** mode in `.env`, matching the Authentication Type in DealHub:
   - Token: `DEALHUB_WEBHOOK_TOKEN` (DealHub sends `Authorization: Bearer <TOKEN>`)
   - Basic: `DEALHUB_WEBHOOK_USERNAME` and `DEALHUB_WEBHOOK_PASSWORD`
     (DealHub sends `Authorization: Basic <CREDENTIALS>`)

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/dealhub`.

## Test

```bash
npm test
```

The tests build the exact headers DealHub sends in Token and Basic mode and
cover the wrong credential, the bare token without `Bearer `, a missing
header, an unconfigured server, invalid JSON, and dispatch of quote,
`version`, `user`, `productsUpload`, `DEALROOM_EVENT` and failure events.

Send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/dealhub \
  -H "Authorization: Bearer $DEALHUB_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event":"primaryQuote","status":"Draft","dealhub_quote_id":"6563232565685498","dealhub_opportunity_id":"2323232565685498"}'
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 dealhub --path /webhooks/dealhub
```

No account required. Paste the printed HTTPS URL into the webhook's **Webhook
URL** in DealHub (System Settings → API Settings → Webhooks), then save a
draft quote to trigger `draftQuote`.

## Notes

- The handler is in `src/index.js`.
- Compare the **whole** `Authorization` value, scheme included.
- There's no signature or timestamp, so deduplicate on
  `event_info.event_id` to guard against replays.
- See [../../references/verification.md](../../references/verification.md)
  for details and debugging.
