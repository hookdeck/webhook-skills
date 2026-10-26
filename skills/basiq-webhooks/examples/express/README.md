# Basiq Webhooks - Express Example

Minimal example of receiving [Basiq](https://basiq.io) webhooks with signature verification. Basiq signs deliveries with [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp`, `webhook-signature`), so the handler verifies them with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package.

## Prerequisites

- Node.js 18+
- A Basiq account and application, with a webhook subscription whose signing secret (`whsec_...`) you can read

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your endpoint's signing secret, including the `whsec_` prefix, in `BASIQ_WEBHOOK_SECRET` (see [setup](../../references/setup.md)).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/basiq`.

## Test

```bash
npm test
```

The tests sign payloads the way Standard Webhooks does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover every documented event type, tampered and re-serialised bodies, stale timestamps, multiple signatures, another endpoint's secret, repeated deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 basiq --path /webhooks/basiq
```

Create a Basiq webhook subscription (`POST /notifications/webhooks`) with the printed URL, then send a test message with `POST /notifications/messages/test`.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The signature covers the exact raw body bytes for any content type, so `express.json()` before verification breaks it. The body is parsed only after the check.
- The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones are rejected. For a configurable window, use the manual verifier in [references/verification.md](../../references/verification.md).
- If `BASIQ_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The handler dedupes on the `webhook-id` header.
- Basiq notifications are thin (`eventTypeId`, `eventId`, `links`). Fetch `links.event` or `links.eventEntity` for the data.
- Return a `2xx` quickly. Enqueue the event and process it asynchronously in production.
