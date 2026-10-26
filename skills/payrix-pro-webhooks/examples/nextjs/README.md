# Payrix Pro Webhooks - Next.js Example

Minimal example of receiving Payrix Pro webhook alerts with the Next.js App Router and
authenticating them with the Header Name and Header Value you set on the webhook action.

Payrix Pro does not sign requests, so there is no HMAC to verify. The handler compares the whole
value of your chosen header with `PAYRIX_PRO_WEBHOOK_SECRET` in constant time. A static shared
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS and
rotate the credential if it leaks.

The route exports a handler for GET, POST, PUT, PATCH and DELETE (Payrix's docs don't name the
method), reads the body as text so any content type works, and checks the credential first.

## Prerequisites

- Node.js 18+
- A Payrix Pro webhook alert with an action whose Header Name and Header Value you control (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `PAYRIX_PRO_WEBHOOK_HEADER` to the Header Name and `PAYRIX_PRO_WEBHOOK_SECRET` to the exact,
   whole Header Value (including any `Bearer ` prefix you typed on the action).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/payrix-pro`.

## Test

```bash
npm test
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 payrix-pro --path /webhooks/payrix-pro
```

Put the printed URL in the Endpoint field of the Payrix Pro webhook action.

## How It Works

- `lib/verify-payrix-pro.ts`: `verifyPayrixProRequest()` and `parseBody()`
- `app/webhooks/payrix-pro/route.ts`: one handler exported for each method

1. The header is looked up case-insensitively and compared whole. Failure returns `401`.
2. JSON is parsed only when the content type says JSON (`400` if malformed); other bodies stay raw text.
3. It returns `200 {"received": true}`.
