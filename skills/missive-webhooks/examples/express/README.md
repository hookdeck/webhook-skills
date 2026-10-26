# Missive Webhooks - Express Example

Minimal example of receiving Missive rule webhooks with `X-Hook-Signature`
verification (`sha256=` + hex HMAC-SHA256 of the raw body).

Missive has no SDK for verification, so this example verifies manually. The
route uses `express.raw({ type: '*/*' })` so the body stays raw bytes whatever
content type is sent.

## Prerequisites

- Node.js 18+
- A Missive rule with a **Webhook** action and a validation secret (needs an admin or owner on the Productive or Business plan)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the validation secret from the rule's webhook action to `.env` as `MISSIVE_WEBHOOK_SECRET`. Without a secret, Missive sends unsigned requests and this handler rejects them.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/missive`.
Start it before saving the rule: Missive sends a validation request on save.

## Test

Run the test suite (signs payloads with the real Missive algorithm):

```bash
npm test
```

### Receive real webhooks locally

```bash
# Forward webhooks to localhost (no install or account required)
npx hookdeck-cli listen 3000 missive --path /webhooks/missive
```

Use the URL the CLI prints as the endpoint in the rule's webhook action.

## What the handler does

Missive has no event header, so the handler dispatches on `rule.type`
(`label_change` is the type in Missive's docs; others are logged) and logs the
conversation and latest message.

| Status | When |
|--------|------|
| `200` | Signature valid, payload handled |
| `400` | Valid signature but the body is not a JSON object |
| `401` | Missing or invalid `X-Hook-Signature` |
| `500` | `MISSIVE_WEBHOOK_SECRET` not set, or the handler threw |

Missive retries failed deliveries (up to 5 times over 8 minutes), so deduplicate.
