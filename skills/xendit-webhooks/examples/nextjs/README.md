# Xendit Webhooks - Next.js Example

Minimal example of receiving Xendit webhooks and verifying the `x-callback-token` header.

Xendit does not sign the payload, so there is no HMAC. It sends your **webhook verification
token** unchanged in the `x-callback-token` header, and the handler compares it with
`XENDIT_CALLBACK_TOKEN` using a constant-time comparison.

## Prerequisites

- Node.js 18+
- A Xendit account with a webhook verification token (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `XENDIT_CALLBACK_TOKEN` to the token from Xendit Dashboard > Settings > Webhooks.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/xendit`.

## Test

```bash
npm test
```

The tests send Payments API events and invoice callbacks with a correct, wrong, and missing
token. No Xendit account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/xendit \
  -H "Content-Type: application/json" \
  -H "x-callback-token: $XENDIT_CALLBACK_TOKEN" \
  -d '{"event":"payment.capture","data":{"payment_id":"py-123","currency":"IDR","request_amount":1234}}'
```

## Receive Xendit Webhooks Locally

Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 xendit --path /webhooks/xendit
```

Paste the printed URL into Xendit Dashboard > Settings > Webhooks as the URL for the
products you use. Use the dashboard's test button to send a sample event.

## How It Works

- `app/webhooks/xendit/route.ts`: the App Router `POST` handler
- `lib/verify-xendit.ts`: `verifyXenditToken()`

1. The `x-callback-token` header is compared with `XENDIT_CALLBACK_TOKEN` before the body
   is parsed. A missing or wrong token returns `401`. If the variable is unset, everything
   is rejected.
2. The body is read with `request.text()` (any content type) and parsed as JSON only after the token check (`400` if invalid).
3. Payments API webhooks have an `event` field (`payment.capture`, `payment.failure`,
   `payment_token.activation`, `refund.succeeded` and so on) with the resource under
   `data`. Invoice callbacks have no `event`; the handler checks `status` (`PAID`,
   `EXPIRED`) instead.
4. It returns `200 {"received": true}` quickly. Xendit retries non-2xx responses up to six
   times over 24 hours, so key your side effects on `data.payment_id` (or the invoice `id`).
