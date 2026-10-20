# Attio Webhooks - Next.js Example

Minimal example of receiving Attio webhooks with `Attio-Signature` verification (HMAC-SHA256 of the raw body, hex-encoded) and `Idempotency-Key` deduplication.

## Prerequisites

- Node.js 20.9+
- Attio workspace with access to developer settings
- Your Attio webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Attio webhook secret to `.env.local` as `ATTIO_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Run the tests

```bash
npm test
```

The tests sign payloads exactly like Attio does and cover valid, invalid, tampered and duplicate deliveries.

### Receive real webhooks locally

Attio only delivers to HTTPS URLs, so expose your local server with the Hookdeck CLI (no account needed):

```bash
npx hookdeck-cli listen 3000 attio --path /webhooks/attio
```

1. In Attio's developer settings, create a webhook with the HTTPS URL the CLI prints as the target URL.
2. Subscribe to events such as `record.created`, `record.updated` and `list-entry.updated`.
3. Copy the webhook secret into `.env.local` and restart the server.
4. Open the event's dropdown and choose **Send test event to target URL**.

## Endpoint

- `POST /webhooks/attio` (`app/webhooks/attio/route.ts`) - Verifies the signature, deduplicates on `Idempotency-Key`, and dispatches each item in `events[]`

## Responses

| Status | When |
|--------|------|
| `200` | Processed (or duplicate `Idempotency-Key` skipped) |
| `400` | Missing/invalid signature or invalid JSON |
| `500` | `ATTIO_WEBHOOK_SECRET` not set, or the handler threw (Attio will retry) |
