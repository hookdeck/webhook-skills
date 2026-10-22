# Granola Webhooks - Next.js Example

Minimal example of receiving Granola webhooks with Standard Webhooks signature verification, using the `standardwebhooks` library.

Granola signs every delivery with `webhook-id`, `webhook-timestamp` and `webhook-signature` headers: base64 HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the base64-decoded part of the `whsec_` secret. The library checks the signature against the **raw body** and rejects timestamps more than 5 minutes off.

## Prerequisites

- Node.js 18+
- Granola Business or Enterprise plan, a webhook endpoint, and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret to `.env` as `GRANOLA_WEBHOOK_SECRET`. It is shown only once, when the endpoint is created (Settings → Connectors → Webhooks, or `POST /v1/webhook-endpoints`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/granola`.

## Test

Run the test suite (signs payloads with the real Granola algorithm):

```bash
npm test
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 3000 granola --path /webhooks/granola
```

Use the URL the CLI prints as the endpoint URL in Granola (Granola requires a public HTTPS URL), then use **Send test event** in the webhook creation dialog.

## What the handler does

- Reads the raw request body and verifies the signature (400 on failure)
- Dispatches on `event_type`: `note.generated`, `note.edited`, `note.access_granted`
- Payloads contain only `event_id`, `event_type`, `note_id`, `occurred_at` (and `data.changed_fields` on `note.edited`); fetch the note with Granola's Get Note API
- Responds 200 quickly; Granola allows 15 seconds and retries 408, 429, 5xx and timeouts
