# Prividium Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving Prividium webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Prividium follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- A Prividium deployment with a webhook and its signing key (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Prividium webhook secret to `.env` as `PRIVIDIUM_WEBHOOK_SECRET`
   (the full `whsec_...` `signing_key` returned once when you created the webhook; during a rotation you can list `whsec_old,whsec_new`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/prividium
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
npx hookdeck-cli listen 3000 prividium --path /webhooks/prividium
```

1. Create an event or address webhook in the admin UI (**Webhooks > Add Webhook**) or with `POST /api/v1/event-webhook` / `/api/v1/address-webhook`, using the tunnel URL as `url`.
2. Copy the `signing_key` shown at creation into `.env`. It is returned only once.

## Event Handling

Prividium's docs define no event type names and don't print the delivery body, so the handler doesn't dispatch on a type. After verification it:

- returns `200` with `duplicate: true` for a `webhook-id` it has already processed (the id is stable across retries);
- parses the body as JSON if it can and logs it, and still accepts a verified body that isn't JSON;
- is the place to add your own handling. Use a separate URL per webhook, since one webhook is one subscription (event webhook: contract + `topic0`; address webhook: addresses).

Missing headers return `400`, a bad signature `401`, and an unset or non-`whsec_` secret `500` (fails closed).

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
