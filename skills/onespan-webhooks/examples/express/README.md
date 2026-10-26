# OneSpan Webhooks - Express Example

Minimal example of receiving OneSpan Sign callback notifications and authenticating them with
the callback key sent in the `Authorization` header.

OneSpan Sign does not sign payloads. The callback key you registered is sent as
`Authorization: Basic <callback key>`: the raw key, **not** base64(user:pass), so it is not
decoded as HTTP Basic. The handler compares the **whole header value**, including the `Basic `
prefix, with a constant-time comparison. A static credential authenticates the sender, not the
body, and gives no replay protection, so use HTTPS and rotate the key if it leaks.

## Prerequisites

- Node.js 18+
- A OneSpan Sign account with a callback key registered (see
  [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ONESPAN_AUTHORIZATION` to the full header value, e.g. `Basic myCallbackKey`
   (`Basic ` followed by the callback key you registered).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/onespan`.

## Test

```bash
npm test
```

The tests send documented callback payloads with correct, wrong, base64-encoded and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/onespan \
  -H "Content-Type: application/json" \
  -H "Authorization: $ONESPAN_AUTHORIZATION" \
  -d '{"name":"PACKAGE_COMPLETE","sessionUser":"e00696ec-d6f5-4feb-89c5-a5ce002a6c66","packageId":"5n4obeO8jYoPp126Cm-Y3fxdfbo="}'
```

## Receive OneSpan Webhooks Locally

```bash
npx hookdeck-cli listen 3000 onespan --path /webhooks/onespan
```

Use the printed URL as the callback URL in OneSpan Sign.

## How It Works

- `src/index.js`: `verifyOneSpanRequest()` plus the `POST /webhooks/onespan` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared in full with `ONESPAN_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. The event type is the payload's `name` (`PACKAGE_COMPLETE`, `DOCUMENT_SIGNED`, `SIGNER_COMPLETE`, ...).
5. It returns `200 {"received": true}`.
