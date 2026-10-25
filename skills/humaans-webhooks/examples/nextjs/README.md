# Humaans Webhooks - Next.js Example

Minimal example of receiving Humaans webhooks with Standard Webhooks (Svix) signature verification, using the `standardwebhooks` library.

Humaans signs every delivery with `webhook-id`, `webhook-timestamp` and `webhook-signature` headers (Svix may send them as `svix-id`, `svix-timestamp`, `svix-signature`; the handler accepts both): base64 HMAC-SHA256 over `{id}.{timestamp}.{raw body}`, keyed with the base64-decoded part of the `whsec_` secret. The library checks the signature against the **raw body** and rejects timestamps more than 5 minutes off.

> **Hookdeck retries and replays** resend the original timestamp, so the library rejects them once they are more than 5 minutes old. To accept late retries, swap in the manual verifier from [references/verification.md](../../references/verification.md) and drop or widen its window.

## Prerequisites

- Node.js 18+
- Humaans account (Owner) with a webhook and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret to `.env` as `HUMAANS_WEBHOOK_SECRET`. It is the webhook's `prodEndpointSignature`, available once the production endpoint URL is set.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/humaans`.

## Test

Run the test suite (signs payloads with the real Humaans algorithm):

```bash
npm test
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 3000 humaans --path /webhooks/humaans
```

Use the URL the CLI prints as the webhook's production endpoint URL in Humaans, then publish the webhook and change a record (for example edit a person) to receive an event.

## What the handler does

- Reads the raw request body and verifies the signature (400 on failure)
- Dispatches on `action`: `person.created`, `person.updated`, `person.offboarded`, `timeAway.created`, `timeAway.approved`, `compensation.updated`
- Responds 200 quickly; any non-2xx is retried with exponential backoff
