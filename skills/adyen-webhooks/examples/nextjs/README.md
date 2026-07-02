# Adyen Webhooks - Next.js Example

Minimal example of receiving Adyen **standard notifications** with HMAC signature
verification in a Next.js App Router route handler, using the official
[`@adyen/api-library`](https://www.npmjs.com/package/@adyen/api-library) SDK.

## Prerequisites

- Node.js 18+
- An Adyen account with a webhook configured and an **HMAC key** generated in the
  Customer Area (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Adyen **HMAC key** (a hex string) to `.env` as `ADYEN_HMAC_KEY`.
   Optionally set `ADYEN_WEBHOOK_USERNAME` / `ADYEN_WEBHOOK_PASSWORD` if you
   configured Basic Auth on the webhook.

## Run

```bash
npm run dev
```

The webhook endpoint is `POST http://localhost:3000/webhooks/adyen`
(handled by `app/webhooks/adyen/route.ts`).

## How It Works

1. Adyen POSTs a JSON body containing `notificationItems`.
2. Each item's HMAC signature (`additionalData.hmacSignature`) is verified with
   `hmacValidator.validateHMAC(item, ADYEN_HMAC_KEY)`. Adyen's HMAC is computed
   over reconstructed fields, **not** the raw body, so parsing JSON first is
   correct.
3. Verified events are dispatched by `eventCode` (`AUTHORISATION`, `CAPTURE`,
   `REFUND`, `CANCELLATION`, `CHARGEBACK`, …).
4. The route responds `200` with the literal body **`[accepted]`** — required, or
   Adyen retries.

## Test

```bash
npm test
```

## Receive Webhooks Locally

Use the Hookdeck CLI to tunnel Adyen webhooks to your local server — no account
required:

```bash
npx hookdeck-cli listen 3000 adyen --path /webhooks/adyen
```

Paste the printed URL into your webhook's **URL** field in the Adyen Customer Area,
then use **Test configuration** or create a test payment to trigger a webhook.
