# Breakcold Webhooks - Express Example

Minimal example of receiving [Breakcold](https://docs.breakcold.com/api/webhooks) webhooks with signature verification.

## The scheme

| | |
|---|---|
| Header | `X-Webhook-Signature`: `sha256=<hex>` (bare hex also accepted) |
| Algorithm | HMAC-SHA256, lowercase hex, keyed with the endpoint signing secret (UTF-8, used as-is) |
| Signed content | `{X-Webhook-Timestamp}.{raw body}` built as bytes |
| Failure | `401` |
| Replay window | Off by default. Opt in with `BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS` |

## Prerequisites

- Node.js 18+
- A Breakcold workspace (Settings → Webhook → Send)

## Setup

```bash
npm install
cp .env.example .env
```

Put the endpoint's signing secret in `.env` as `BREAKCOLD_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Webhook endpoint: `POST http://localhost:3000/webhooks/breakcold`

## Test

```bash
npm test
```

The tests sign requests with Breakcold's algorithm and cover every documented event, bare and prefixed digests, uppercase hex, non-UTF-8 bodies, tampering, a changed timestamp, malformed signatures, the opt-in tolerance and duplicate deliveries.

### Receive real webhooks locally

Breakcold needs an HTTPS URL, so use a tunnel:

```bash
npx hookdeck-cli listen 3000 breakcold --path /webhooks/breakcold
```

No account or install required. Paste the printed URL into **Settings → Webhook → Send → New outbound webhook**, copy the signing secret into `.env`, then use the endpoint's test button to send a signed `webhook.test` event.

## Notes

- The body is read raw (any Content-Type) and parsed only after verification.
- Duplicate deliveries are dropped using `X-Webhook-Delivery-Id`.
- Any 2xx accepts a delivery. Breakcold makes up to 3 attempts, with a 10 second timeout.
