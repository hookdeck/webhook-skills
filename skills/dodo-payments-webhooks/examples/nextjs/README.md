# Dodo Payments Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving Dodo Payments webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Dodo Payments follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- Dodo Payments account with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Dodo Payments webhook secret to `.env` as `DODO_PAYMENTS_WEBHOOK_SECRET`
   (the full `whsec_...` value from the endpoint's **Overview** tab under Developer > Webhooks).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/dodo-payments
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
npx hookdeck-cli listen 3000 dodo-payments --path /webhooks/dodo-payments
```

1. In the Dodo Payments dashboard go to **Developer > Webhooks**, add an endpoint with the tunnel URL and choose events.
2. Copy the endpoint's signing secret into `.env`.
3. Use the endpoint's **Testing** tab and **Send example** to deliver a signed event.

`dodo wh trigger` mock events are **not signed**, so this handler rejects them.

## Event Handling

The envelope is `{ business_id, type, timestamp, data }`. The route reads the event name from the
top-level `type` field, routes these events, and logs anything else:

- `payment.succeeded`, `payment.failed`, `payment.processing`, `payment.cancelled`
- `refund.succeeded`, `refund.failed`
- `dispute.opened`, `dispute.won`, `dispute.lost`
- `subscription.active`, `subscription.renewed`, `subscription.on_hold`, `subscription.cancelled`
- `license_key.created`

There is no event id in the body: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
