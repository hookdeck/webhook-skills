# Fathom Webhooks - Next.js Example

Minimal example of receiving Fathom (fathom.video) meeting webhooks with
signature verification, using the official `fathom-typescript` SDK (`Fathom.verifyWebhook`).

Fathom signs webhooks with the Standard Webhooks scheme: `webhook-id`,
`webhook-timestamp` and `webhook-signature` headers, HMAC-SHA256 over
`{webhook-id}.{webhook-timestamp}.{raw body}`. The SDK checks the signature
against the **raw body** and rejects timestamps more than 5 minutes old.

## Prerequisites

- Node.js 20.9+
- Fathom account with API access and a webhook secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook secret to `.env.local` as `FATHOM_WEBHOOK_SECRET`. It is shown
   when you add the webhook in Fathom Settings → API Access → Manage, or returned
   as `secret` by `POST /webhooks`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/fathom`.

## Test

Run the test suite (signs payloads with the real Fathom algorithm):

```bash
npm test
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 3000 fathom --path /webhooks/fathom
```

Use the URL the CLI prints as the webhook's Destination URL in Fathom, then
either use **Send test payload** in the webhook settings or record a short
meeting. Webhooks only fire once the meeting has a summary, so very short or
silent test calls may not trigger one.

## What the handler does

Fathom sends a single webhook type, *new meeting content ready*, whose body is
the Meeting object. There is no event-type field, so the handler doesn't
dispatch on one. It logs the title, recording ID, summary, action items and
transcript length. Summary, transcript, action items and CRM matches are only
included when enabled on the webhook.

| Status | When |
|--------|------|
| `200` | Signature valid, payload handled |
| `400` | Missing `webhook-*` header, invalid signature, or timestamp outside 5 minutes |
| `500` | `FATHOM_WEBHOOK_SECRET` not set, or the handler threw |

Retries reuse the same `webhook-id`, so use it as your idempotency key.
