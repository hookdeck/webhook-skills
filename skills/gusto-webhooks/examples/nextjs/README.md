# Gusto Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Gusto Embedded Payroll](https://docs.gusto.com/embedded-payroll/docs/webhooks) webhooks and verifying the `X-Gusto-Signature` HMAC (and acknowledging the `verification_token` request).

## Prerequisites

- Node.js 18+
- A Gusto Developer Portal application and a webhook subscription (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Leave `GUSTO_VERIFICATION_TOKEN` empty in `.env.local` until Gusto sends the token, call `PUT /v1/webhook_subscriptions/{uuid}/verify` with it, then set it.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/gusto` in [app/webhooks/gusto/route.ts](app/webhooks/gusto/route.ts); the verification code is in [lib/verify-gusto.ts](lib/verify-gusto.ts).

## Test

```bash
npm test
```

The tests cover a bare hex digest, the base64 form (rejected), a valid signature, the token handshake before and after the token is configured (printed only before), an unsigned event with a token field, another token, a tampered body, a missing header, invalid JSON, and a missing token.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 gusto --path /webhooks/gusto
```

Create a subscription with the printed URL. The example prints the `verification_token` when it arrives; verify the subscription with it and set `GUSTO_VERIFICATION_TOKEN`.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- The `verification_token` request is acknowledged without a signature check and has no side effects. The token is printed only while `GUSTO_VERIFICATION_TOKEN` is unset.
