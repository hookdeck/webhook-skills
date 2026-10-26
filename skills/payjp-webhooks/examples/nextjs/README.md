# PAY.JP Webhooks - Next.js Example

Minimal example of receiving PAY.JP webhooks with the App Router and authenticating them with the
`X-Payjp-Webhook-Token` header.

PAY.JP does not sign payloads, so there is no HMAC to verify. The route handler compares the whole
`X-Payjp-Webhook-Token` header with your account's webhook token using a constant-time comparison,
then reads the body as text and parses it. A static token authenticates the sender, not the body,
and gives no replay protection: use HTTPS, dedupe on the event `id`, and rotate the token if it
leaks.

## Prerequisites

- Node.js 18+
- A PAY.JP account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `PAYJP_WEBHOOK_SECRET`. Use the webhook token (whook_...) shown in your PAY.JP account settings.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/payjp`.

## Test

```bash
npm test
```

The tests send documented events with correct, wrong and missing tokens. No PAY.JP account is needed.

## Receive Webhooks Locally

PAY.JP can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 payjp --path /webhooks/payjp
```

Put the printed URL in the PAY.JP webhook settings.

## How It Works

- `lib/verify-payjp.ts`: `verifyPayjpRequest()` and the demo dedupe set
- `app/webhooks/payjp/route.ts`: the `POST` handler

1. The `X-Payjp-Webhook-Token` header is checked before the body is read. Failure returns `401`.
2. The body must be a PAY.JP event object (`400` otherwise).
3. A repeated event `id` is acknowledged without being handled again.
4. The handler dispatches on `type`: `charge.succeeded`, `charge.failed`, `charge.updated`,
   `charge.refunded`, `charge.captured`, `dispute.created`, `customer.created`,
   `customer.updated`, `customer.deleted`, `subscription.created`, `subscription.renewed`,
   `subscription.canceled`, `transfer.succeeded`.
5. It returns `200 {"received": true}` (PAY.JP only needs the 200 status).
