# iSnap Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving iSnap webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (iSnap follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- iSnap account with a webhook subscription and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your iSnap webhook secret to `.env` as `ISNAP_WEBHOOK_SECRET`
   (the full `whsec_...` value that `POST /v1/webhooks` returns once, when you create the subscription).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/isnap
```

## Test

```bash
npm test
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), check the signing helper against
the test vector in iSnap's docs, and check that the `svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 isnap --path /webhooks/isnap
```

1. Create a subscription with the tunnel URL as `url` (iSnap only accepts public HTTPS URLs):
   `POST https://api.isnap.ai/v1/webhooks` with `{"url": "...", "events": ["message.*", "line.*"]}`.
2. Copy the `secret` from the response into `.env`. It is returned only once.
3. Trigger a real event, for example send a message to one of your lines.

## Event Handling

The envelope is `{ api_version, event_id, event_type, created_at, trace_id, data }`. The route reads
the event name from the top-level `event_type` field, answers `204` with an empty body, routes the 37
documented types by family, and logs anything else:

- `message.queued`, `message.scheduled`, `message.sent`, `message.delivered`, `message.read`, `message.failed`, `message.received`, `message.cancelled`, `message.fallback_triggered`
- `reaction.added`, `reaction.received`, `reaction.removed`
- `typing_indicator.started`, `typing_indicator.stopped`
- `line.connected`, `line.disconnected`, `line.offline`, `line.degraded`, `line.apple_id_flagged`, `line.quota_warning`, `line.quota_exceeded`, `line.capability_changed`, `line.terminated`, `line.variant_changed`, `line.variant_scheduled`, `line.variant_unscheduled`
- `trial.linked`, `trial.dormant`, `trial.reactivated`, `trial.bind_conflict`, `trial.revoked`
- `pre_order.fulfilled`, `pre_order.cancelled`
- `macos_session.rented`, `macos_session.released`
- `binding.released`
- `webhook.test` (a signed probe sent to a suspended subscription; answering `2xx` resumes it)

`event_id` equals the `webhook-id` header and is the dedupe key. The example keeps seen ids in memory;
use a database or cache in production. A failed verification answers `401` (or `400` for missing
headers), never `410`: iSnap turns the subscription off on a `410`.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. iSnap re-stamps every
attempt, but Hookdeck retries and replays resend the original `webhook-timestamp`, so late retries are
rejected. See [references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
