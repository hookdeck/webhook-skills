# Clemta Webhooks - Next.js Example

Minimal example of receiving Clemta webhooks in a Next.js App Router route with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Clemta signs deliveries per the Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- Clemta partner account with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your endpoint signing secret to `.env.local` as `CLEMTA_WEBHOOK_SECRET`
   (the full `whsec_...` value, shown once when you create the endpoint).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/clemta
```

## Test

```bash
npm test
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), and check that `svix-*` headers,
multiple `v1,` entries and a trailing `v1a,` entry are handled.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 clemta --path /webhooks/clemta
```

1. Create a webhook endpoint on the Webhooks page of the Clemta partner dashboard using the tunnel URL.
2. Copy the signing secret into `.env.local`.
3. Trigger an event, for example by creating a test company with a `clmt_test_` key.

## Event Handling

The body is `{ type, data }`, and `data.object` is the resource. The handler routes these events and logs anything else:

- `company.created`, `company.status.changed`, `company.verified`, `company.incorporated`, `company.onboarding.completed`
- `company.name.changed`, `company.ein.assigned`, `company.document.received`, `company.entitlements.changed`
- `company.updated`, `company.dissolved`
- `tax_filing.created`, `tax_filing.status.changed`
- `service_order.status.changed`, `service_order.completed`, `service_order.updated`, `service_order.quoted`
- `service_order.renewal_canceled`, `service_order.renewal_cancel_denied`
- `requirement.created`, `requirement.fulfilled`, `requirement.canceled`
- `requirement.signature.viewed`, `requirement.signature.signed`
- `file.created`, `calendar.reminder`, `invoice.finalized`

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a configurable window.
