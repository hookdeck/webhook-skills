# Openlayer Webhooks - Express Example

Minimal example of receiving Openlayer webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Openlayer follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- Openlayer account with a webhook and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Openlayer webhook secret to `.env` as `OPENLAYER_WEBHOOK_SECRET`
   (the full `whsec_...` value returned when you created the webhook).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/openlayer
```

## Test

```bash
npm test
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), and check that the
`svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 openlayer --path /webhooks/openlayer
```

1. In Openlayer open **Workspace Settings > Webhooks** (workspace admins only), add a webhook with the tunnel URL and the event types you want.
2. Copy the signing secret into `.env` right away: it is shown only once.
3. Trigger a subscribed event (for example create a test) to deliver a signed event.

## Event Handling

Every body is `{ type, timestamp, data }`. The handler reads the event name from the top-level dotted `type` field, routes these events, and logs anything else:

- `test.created`, `test.updated`, `test.deleted`
- `tests.result.updated` (logs the run summary and flags failing tests)

Use the `webhook-id` header to deduplicate: retried events keep the same id.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
