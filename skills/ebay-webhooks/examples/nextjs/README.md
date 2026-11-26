# eBay Webhooks - Next.js Example

Minimal example of receiving eBay Notification API webhooks with the Next.js App
Router, covering both required checks:

- **Endpoint challenge** — `GET /webhooks/ebay?challenge_code=...` returns the
  SHA-256 `challengeResponse`.
- **Signature verification** — `POST /webhooks/ebay` verifies the ECDSA
  `x-ebay-signature` over the raw body, using the public key from `getPublicKey`
  (cached ~1 hour by `kid`).

The handler lives in [`app/webhooks/ebay/route.ts`](app/webhooks/ebay/route.ts).

## Prerequisites

- Node.js 18+
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

3. Fill in `.env` (`EBAY_VERIFICATION_TOKEN`, `EBAY_ENDPOINT`,
   `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_ENV`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

- `GET  /webhooks/ebay` — endpoint challenge validation
- `POST /webhooks/ebay` — notifications

## Test

```bash
npm test
```

The Vitest suite generates **real ECDSA signatures** with a P-256 key pair,
preloads the public-key cache (no network call), and asserts the challenge
response and that valid signatures → `204`, invalid/tampered/missing → `412`.

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

## Notes

- **Raw body is required.** The route reads `await request.arrayBuffer()` so the
  signature is verified against the exact bytes eBay signed.
- Returns **204** on success and **412** on signature failure, matching eBay's
  SDK conventions.
- For the official Node SDK path, see
  [../../references/verification.md](../../references/verification.md).
