# eBay Webhooks - Express Example

Minimal example of receiving eBay Notification API webhooks with Express,
covering both required checks:

- **Endpoint challenge** — `GET /webhooks/ebay?challenge_code=...` returns the
  SHA-256 `challengeResponse`.
- **Signature verification** — `POST /webhooks/ebay` verifies the ECDSA
  `x-ebay-signature` over the raw body, using the public key from `getPublicKey`
  (cached ~1 hour by `kid`).

## Prerequisites

- Node.js 18+ (uses the global `fetch` and `express.raw()`)
- An eBay Developers Program keyset (App ID / Cert ID)
- A verification token you generate (32–80 chars, `[A-Za-z0-9_-]`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env`:
   - `EBAY_VERIFICATION_TOKEN` — your token (also set it on eBay)
   - `EBAY_ENDPOINT` — the exact public URL eBay will call
   - `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` — for `getPublicKey`
   - `EBAY_ENV` — `sandbox` or `production`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

- `GET  /webhooks/ebay` — endpoint challenge validation
- `POST /webhooks/ebay` — notifications
- `GET  /health` — health check

## Test

```bash
npm test
```

The Jest suite generates **real ECDSA signatures** with a P-256 key pair,
preloads the public-key cache (so no OAuth/network call is made), and asserts:

- the challenge response matches `SHA-256(challengeCode + verificationToken + endpoint)`
- valid signatures → `204`, invalid/tampered/missing → `412`

## Receive real webhooks locally


In Hookdeck Event Gateway, create an **eBay** source with your keyset's Client
ID and Client Secret and the same verification token you give eBay, then
forward that source to your machine (`ebay` is the source's name):

```bash
hookdeck listen 3000 ebay --path /webhooks/ebay
```

Register the source URL as your eBay destination endpoint. The eBay source
answers eBay's challenge itself, so the challenge route in this code isn't
called in that setup; the tests cover it.

## Official SDK

This example uses a transparent manual implementation so the tests run offline.
In production you can instead use eBay's official
[`event-notification-nodejs-sdk`](https://github.com/eBay/event-notification-nodejs-sdk)
(`EventNotificationSDK.process(...)` and `validateEndpoint(...)`). See
[../../references/verification.md](../../references/verification.md).

## Notes

- **Raw body is required.** The route uses `express.raw()` so the signature is
  checked against the exact bytes eBay signed. Do not add a global
  `express.json()` before this route.
- Returns **204** on success (eBay expects a 2xx) and **412** on signature
  failure, matching eBay's SDK conventions.
