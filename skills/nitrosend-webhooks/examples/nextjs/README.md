# Nitrosend Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving Nitrosend webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Nitrosend follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- Nitrosend account with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Nitrosend webhook secret to `.env` as `NITROSEND_WEBHOOK_SECRET`
   (the full `whsec_...` value returned when you created the webhook).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/nitrosend
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
npx hookdeck-cli listen 3000 nitrosend --path /webhooks/nitrosend
```

1. In Nitrosend open **Settings > Webhooks**, choose **New Webhook**, enter the tunnel URL and pick events (add account events through the API).
2. Copy the webhook's signing secret into `.env`.
3. Choose **Send test event** from the webhook's menu to deliver a signed event.

## Event Handling

Every body is `{ type, timestamp, data }`. The handler reads the event name from the top-level dotted `type` field, routes these events, and logs anything else:

- `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.failed`, `email.received`
- `campaign.completed`, `campaign.failed`, `campaign.stopped`, `flow.paused`
- `sending.paused`, `sending.limit_approaching`, `sending.limit_reached`
- `import.completed`, `import.failed`
- `domain.verified`, `domain.verification_lost`, `domain.dns_degraded`
- `webhook.disabled`

Use the `webhook-id` header to deduplicate: retried events keep the same id and can arrive after later ones.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
