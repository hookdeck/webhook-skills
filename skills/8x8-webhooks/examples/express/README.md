# 8x8 Webhooks - Express Example

Minimal example of receiving 8x8 Connect webhooks (inbound SMS, delivery receipts, short URL
clicks, WhatsApp template updates) and authenticating them with the HTTP Authorization value.

8x8 does not sign payloads. The only authentication is the optional HTTP Authorization value
you set on the webhook, which 8x8 sends as the `Authorization` header (for example
`Bearer 9QQhlsEb8VY` or `Basic dXNlcjpwYXNzd29yZA==`). The handler compares the **whole
header value**, scheme prefix included, in constant time. It never strips the prefix or
decodes a Basic value. A static credential authenticates the sender, not the body, and gives
no replay protection, so use HTTPS and rotate it if it leaks.

## Prerequisites

- Node.js 18+
- An 8x8 Connect account with a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `EIGHT_X_EIGHT_AUTHORIZATION` to the HTTP Authorization value exactly as set in 8x8,
   including any "Bearer " or "Basic " prefix. OAuth authentication is not supported.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/8x8`.

## Test

```bash
npm test
```

The tests send the documented event shapes with correct, wrong and missing `Authorization`
values. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/8x8 \
  -H "Content-Type: application/json" \
  -H "Authorization: $EIGHT_X_EIGHT_AUTHORIZATION" \
  -d '{"namespace":"SMS","eventType":"inbound_message_received","payload":{"umid":"9e09ac86-bd74-5465-851d-1eb5a5fdbb9a","source":"+6581968289","body":"Test MO message"}}'
```

## Receive 8x8 Webhooks Locally

```bash
npx hookdeck-cli listen 3000 8x8 --path /webhooks/8x8
```

Use the printed URL as the webhook URL in 8x8 Connect.

## How It Works

- `src/index.js`: `verify8x8Request()` plus the `POST /webhooks/8x8` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared with `EIGHT_X_EIGHT_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. The handler switches on `eventType`: `inbound_message_received`,
   `outbound_message_status_changed`, `external_app_message`, `short_url_clicked`,
   `template_status_update`, `template_category_update`, `template_quality_update`,
   `template_correct_category_detection`, `phone_number_quality_update`, `account_update`,
   `whatsapp_automatic_events`.
5. It returns `200 {"received": true}`.
