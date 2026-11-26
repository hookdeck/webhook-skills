# Worldpay Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving Access Worldpay event webhooks: verify the `Event-Signature` header (hex HMAC-SHA256 of the raw body, `{keyId}/{hashFunction}/{signature}`, possibly several comma-separated entries), route on `(eventDetails.classification, eventDetails.type)`, dedupe on `eventId`, and return `200` before processing.

## Prerequisites

- Node.js 20.9+
- An Access Worldpay **Event-Signature shared secret**. Your Worldpay Implementation Manager enables the header and sends the secret. See [setup](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. In `.env`, set `WORLDPAY_WEBHOOK_SECRET_<keyId>` to your shared secret, where `<keyId>` is the number in the first field of each `Event-Signature` entry (for example `WORLDPAY_WEBHOOK_SECRET_1`). During key renewal, add the second key as another variable (for example `WORLDPAY_WEBHOOK_SECRET_2`). This is **not** your Access Worldpay API username and password.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Endpoint: `POST /webhooks/worldpay` in [app/webhooks/worldpay/route.ts](app/webhooks/worldpay/route.ts), with the verification and routing in [lib/worldpay.ts](lib/worldpay.ts).

## Test

```bash
npm test
```

The tests sign payloads with hex HMAC-SHA256 and cover:

- the vendor `Content-Type` (`application/vnd.worldpay.events-v1.hal+json`) and a pretty-printed body verified on its raw bytes
- two signatures in either order during key renewal, and secret lookup by `keyId`
- unknown `keyId` values and unsupported `hashFunction` values, which are skipped
- malformed header entries, which are skipped without throwing
- base64 or bare-digest signatures, which are rejected
- one HMAC per key, even when the header repeats an entry 500 times
- a missing header, a mismatch, a tampered body or a malformed header: all `400`, never `401`
- a missing secret: `500`, fail closed
- invalid JSON and non-event bodies: `400`
- all 26 documented `(classification, type)` pairs
- dedupe on `eventId`
- unknown pairs: `200`, not processed
- `payment:refused` and `payout:refused` taking different routes

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 worldpay --path /webhooks/worldpay
```

Worldpay doesn't let you register endpoints yourself for Access events. Send the public URL to your Implementation Manager, and ask them to enable the events you need and the `Event-Signature` header.

## Notes

- **Raw body and Content-Type.** The route reads `await request.text()`, which keeps the exact bytes for the HMAC and doesn't care that the Content-Type is `application/vnd.worldpay.events-v1.hal+json`. Don't call `request.json()` before verifying.
- **Several signatures.** The header is never a bare digest. Every comma-separated entry is tried, and the secret is selected by `keyId`. A handler that holds a single secret and compares the whole header starts rejecting deliveries when Worldpay begins key renewal.
- **400 on failure.** Worldpay's contract is `400` for a missing or mismatched signature. Worldpay keeps retrying anything that isn't a `200`.
- **Signing is opt-in.** Until Worldpay enables `Event-Signature` for your account, every delivery here gets a `400`. Use the client certificate check and the IP allowlist at your proxy in the meantime ([setup](../../references/setup.md)). Don't add an "accept unsigned" switch in production.
- **Respond first.** Worldpay waits 10 seconds for the `200`. An unacknowledged event delays the events queued behind it. The route returns `200` and runs the processing in `after()`. In production, hand the event to a queue.
- **Dedupe.** There is no timestamp and no replay window. The in-memory `Set` is for the demo; use a unique constraint on `eventId` in your database.
- **WPG XML is a different family.** WPG order notifications are unsigned `text/xml`, and the endpoint has to answer `200` with the literal body `[OK]`. Don't send them to this route.
