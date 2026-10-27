# CryptoProcessing Webhooks - Next.js Example

Minimal example of receiving [CryptoProcessing](https://cryptoprocessing.com/) callbacks with `X-Processing-Signature` verification (hex HMAC-SHA512 of the raw body).

## Prerequisites

- Node.js 18+
- A CryptoProcessing account with an active Master API key and its secret key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the secret key of your active Master API key to `.env` as `CRYPTOPROCESSING_WEBHOOK_SECRET`. Rotating that key changes the callback secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 cryptoprocessing --path /webhooks/cryptoprocessing
```

Use the printed URL as the callback URL in the CryptoProcessing merchant portal.

### Send a signed request by hand

```bash
BODY='{"currency":"BTC","foreign_id":"123456"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$CRYPTOPROCESSING_WEBHOOK_SECRET" | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/cryptoprocessing \
  -H 'Content-Type: application/json' \
  -H "X-Processing-Signature: $SIG" -d "$BODY"
```

With the docs secret `AbCdEfG123456` this prints the published signature `03c25fcf…fa1ec`.

### Run tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/cryptoprocessing` - Receives and verifies callbacks and dispatches on the body's `type` (`deposit`, `withdrawal`, `exchange`, `payment_request`; the other documented types are logged). The raw body is read with `request.arrayBuffer()` so any content type verifies. Invalid signatures get `401`; a duplicate callback gets `201`.
