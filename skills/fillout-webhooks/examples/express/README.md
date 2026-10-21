# Fillout Webhooks - Express Example

Minimal example of receiving [Fillout](https://www.fillout.com/) form submission webhooks
in Express, authenticated with an `Authorization: Bearer <token>` header.

Fillout doesn't sign webhooks. This example compares the whole `Authorization` header
with `Bearer ${FILLOUT_WEBHOOK_TOKEN}` in constant time, returns `401` on a mismatch, and
returns `500` if the token isn't configured.

## Prerequisites

- Node.js 18+
- A Fillout form you can edit
- A token you generate yourself: `openssl rand -hex 32`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your token in `.env` as `FILLOUT_WEBHOOK_TOKEN` (without `Bearer `).

4. In Fillout, open the form → **Integrate** → **Webhook**, switch to **Advanced**, and:
   - HTTP method: `POST`
   - Body: map `submissionId` → Submission ID, plus the answers you need
   - Headers: `Authorization` = `Bearer <your token>`

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/fillout`.

## Test

Run the tests:

```bash
npm test
```

Receive real webhooks locally with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 fillout --path /webhooks/fillout
```

Use the URL it prints as the webhook URL in Fillout and click **Test**.

Or send a request with curl:

```bash
curl -X POST http://localhost:3000/webhooks/fillout \
  -H "Authorization: Bearer $FILLOUT_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"submissionId":"6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c","email":"ada@example.com"}'
```

## How It Works

- `express.raw()` keeps the body unparsed so the header check runs before JSON parsing.
  Fillout signs nothing, so the raw body isn't needed for verification.
- A body with a `questions` array is treated as a full submission (Simple mode or an
  API-created webhook). Anything else is an Advanced mode mapped body.
- Repeated `submissionId`s (Retry integration, resubmits) are acknowledged as duplicates.
  Swap the in-memory `Set` for a database in production.
