# Mailtrap Webhooks - Next.js Example

Receives Mailtrap webhooks at `POST /webhooks/mailtrap` (App Router) and
verifies the `Mailtrap-Signature` header: lowercase hex HMAC-SHA256 of the **raw
request body**, keyed with the webhook's signing secret used as a plain string.

## Prerequisites

- Node.js 18+
- A Mailtrap account with a webhook (Email API/SMTP) and its **signing secret**
  (32 hex characters, shown in the webhook's details)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook signing secret to `.env` as `MAILTRAP_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

The tests generate real signatures (`hex(HMAC_SHA256(secret, raw_body))`) and
cover JSON and JSON Lines payloads, the `soft bounce` event name, Audit Log
events, and malformed or non-hex signature headers (401).

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 mailtrap --path /webhooks/mailtrap
```

No account required. Paste the printed URL into the webhook URL field in
Mailtrap, then use **Run Test** to send a dummy payload.

## Notes

- The route reads the body with `request.text()` so the signature is computed
  over the exact bytes, whatever the content type (`application/json` or
  `application/jsonl`).
- The secret is used as a plain UTF-8 string. Do not hex-decode it.
- A request carries up to 500 events. The handler loops over all of them and
  dedupes on `event_id`.
- Mailtrap retries any non-200 response 40 times every 5 minutes and pauses the
  webhook if all fail.
