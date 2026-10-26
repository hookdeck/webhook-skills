# BlindPay Webhooks - Next.js Example

Minimal example of receiving [BlindPay](https://blindpay.com) webhooks with signature verification, using the official [`svix`](https://www.npmjs.com/package/svix) library.

## Prerequisites

- Node.js 22+ (required by `svix` 2.x)
- A BlindPay instance and a webhook signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your BlindPay webhook signing secret to `BLINDPAY_WEBHOOK_SECRET` in `.env` (see [setup](../../references/setup.md)).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/blindpay`.

## Test

```bash
npm test
```

The tests sign payloads with Svix's algorithm, `base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`, and cover every documented event type, tampered bodies, wrong secrets, stale timestamps, multiple signatures, missing headers, `svix-id` deduplication, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 blindpay --path /webhooks/blindpay
```

Register the printed URL as a webhook endpoint in the BlindPay dashboard, then trigger an event such as creating a customer.

## Notes

- `svix` 2.x ships ESM only; the Next.js build handles that.
- The route reads `await request.text()`. The signature covers the exact raw body bytes, so calling `request.json()` before verification breaks it.
- `svix` 2.x `verify()` returns nothing and throws on failure; the route parses the JSON itself afterwards.
- The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late retries are rejected. See [references/verification.md](../../references/verification.md) for a manual verifier without the window.
- If `BLINDPAY_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- Deduplication uses `svix-id`, which is stable across retries.
