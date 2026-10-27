# Justt Webhooks - Express Example

Minimal example of receiving Justt webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Justt follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- Justt account with webhooks enabled (not available to every customer yet) and an endpoint signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Justt webhook secret to `.env` as `JUSTT_WEBHOOK_SECRET`
   (the full `whsec_...` "Signing Secret" from your endpoint's settings in the Justt webhooks dashboard).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/justt
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
npx hookdeck-cli listen 3000 justt --path /webhooks/justt
```

1. In the Justt webhooks dashboard (Account level view > Webhooks tab), add an endpoint with the tunnel URL and leave the event types empty to receive all events.
2. Copy the endpoint's signing secret into `.env`.
3. Open the endpoint's **Testing** tab, pick an event type and click **Send Example** to deliver a signed event.

## Event Handling

The envelope is `{ type, timestamp, data }`. The handler reads the event name from the
top-level `type` field, routes these events, and logs anything else:

- `chargeback.created`, `chargeback.updated`, `chargeback.status.updated`
- `chargeback.evidence.submitted`, `chargeback.accepted` (`data.status` is `succeeded` or `failed`)
- `pre_chargeback_alert.received`, `pre_chargeback_alert.refund.succeeded`, `pre_chargeback_alert.refund.failed`
- `pre_chargeback_alert.transaction_matched` (opt-in: Justt enables it per account)
- `subscription.cancel_immediately.success`, `subscription.cancel_immediately.failed`

There is no event id in the body: use the `webhook-id` header (`msg_...`) to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
