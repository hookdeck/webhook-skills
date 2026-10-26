# Laso Finance Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving Laso Finance webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Laso Finance follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- Laso Finance account, with a webhook registered via `POST /register-webhook` (the response holds the `whsec_...` signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the `whsec_...` secret from the `POST /register-webhook` response to `.env` as `LASO_FINANCE_WEBHOOK_SECRET`
   (it is shown only once; registering again rotates it).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/laso-finance
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
npx hookdeck-cli listen 3000 laso-finance --path /webhooks/laso-finance
```

1. Register the tunnel URL: `curl -X POST https://laso.finance/register-webhook -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" -d '{"url": "<tunnel URL>"}'`.
2. Copy the `secret` from the response into `.env`.
3. Registering sends a signed `notification.account` test delivery to the handler.

Laso Finance deliveries are not retried, and 50 consecutive failures disable the registration.

## Event Handling

The envelope is `{ type, timestamp, data }`, where `data` is `{ user_id, title, text, category }`. The handler reads the
event name from the top-level `type` field, routes these events, and logs anything else:

- `notification.account`, `notification.transaction`, `notification.deposit`, `notification.withdrawal`
- `notification.card`, `notification.giftCard`, `notification.refund`, `notification.balanceUpdate`

There is no event id in the body: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
