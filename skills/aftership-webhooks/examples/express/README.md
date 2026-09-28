# AfterShip Webhooks - Express Example

Minimal example of receiving AfterShip webhooks in Express.js with HMAC-SHA256 signature
verification over the **raw** request body.

One handler covers all four AfterShip products that send webhooks — **Tracking**,
**Shipping** (formerly Postmen), **Returns** and **Warranty**. They share the same
algorithm and differ only in the header they put the signature in:

| Product | Header | Value |
|---------|--------|-------|
| Tracking | `aftership-hmac-sha256` | bare base64 digest |
| Returns / Warranty | `as-signature-hmac-sha256` | bare base64 digest |
| Shipping, legacy Returns | `am-webhook-signature` | `hmac-sha256=<base64 digest>` |

## Prerequisites

- Node.js 18+
- An AfterShip account with a webhook configured and its webhook secret

> **Each product has its own secret.** Tracking's lives in admin.aftership.com,
> Shipping's in admin.postmen.com, Returns' and Warranty's in their own settings pages.
> Point one endpoint at one product.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your AfterShip webhook secret to `.env` as `AFTERSHIP_WEBHOOK_SECRET`.

   For Tracking: sign in to **admin.aftership.com → Settings → Webhooks** and copy the
   webhook secret. Use the secret string exactly as shown — it is not base64-encoded.

## Run

```bash
npm start
```

Server runs on `http://localhost:3000`.

Webhook endpoint: `POST http://localhost:3000/webhooks/aftership`

## Test

Run the test suite:

```bash
npm test
```

Send a signed webhook by hand:

```bash
BODY='{"event":"tracking_update","event_id":"94dadd60-ed26-46d0-aa52-3ced925a50ff","is_tracking_first_tag":true,"msg":{"tracking_number":"0000000000000000","slug":"usps","tag":"Delivered","subtag":"Delivered_001","subtag_message":"Delivered","order_number":"ORD-1001"},"ts":1712741696}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "your_webhook_secret" -binary | base64)

curl -X POST http://localhost:3000/webhooks/aftership \
  -H "Content-Type: application/json" \
  -H "aftership-hmac-sha256: $SIG" \
  -H "as-webhook-version: 2026-07" \
  -d "$BODY"
```

To receive real AfterShip webhooks locally, use the Hookdeck CLI (no account, no install —
and it gives you the HTTPS URL on port 443 that AfterShip Tracking requires):

```bash
npx hookdeck-cli listen 3000 aftership --path /webhooks/aftership
```

Set the printed public URL as the webhook URL in the AfterShip admin, then press **Send
test webhook**. That button sends an ordinary delivery and expects a 2xx — there is no
handshake or challenge to answer.

## Events Handled

**Tracking** — exactly three event codes. The shipment status is in `msg.tag`, so
`tracking_update` dispatches on the tag:

- `tracking_update` → `Pending`, `InfoReceived`, `InTransit`, `OutForDelivery`,
  `AttemptFail`, `Delivered`, `AvailableForPickup`, `Exception`, `Expired`
- `edd_revise` — estimated delivery date revised
- `tracking_pending_time` — shipment pending past a user-defined threshold

**Shipping (Postmen)** — `calculate_rates`, `create_a_label`, `cancel_a_label`,
`manifest_a_label`. `meta.code` is checked before `data` is treated as a success.

**Returns** — `return.submitted`, `return.approved`, `return.rejected`, `return.resolved`,
`return.expired`, `return.dropoff.created`, `return.dropoff.updated`,
`return.dropoff.shipment.updated`, `return.restock.created`, `return.shipment.provided`,
`return.shipments.provided`, `return.shipment.recorded`, `return.shipment.updated`,
`return.exchange.order.created`, `return.receiving.created`.

**Warranty** — `warranty.created`, `warranty.approved`, `warranty.processing`,
`warranty.completed`, `warranty.canceled`, `warranty.rejected`,
`warranty.inbound_shipment.provided`, `warranty.inbound_shipment.updated`,
`warranty.outbound_shipment.provided`, `warranty.outbound_shipment.updated`,
`warranty.item_received`.

Unknown events return 200 and are logged — AfterShip's docs say to treat enum values as
open strings, and a non-2xx would only start a 68-hour retry cycle.

## Security

- `express.raw({ type: 'application/json' })` is mounted **on this route only**, so the
  handler verifies the exact bytes AfterShip signed. The body is parsed *after*
  verification.
- Signature compared with `crypto.timingSafeEqual`, with a length guard — it throws on a
  length mismatch, which is what a forged short signature looks like.
- A missing `AFTERSHIP_WEBHOOK_SECRET` returns **500** and processes nothing. It never
  fails open.
- `401` on a missing or wrong signature, `400` on malformed JSON, `500` on a missing
  secret.
- No timestamp is signed and no timestamp header is sent, so there is **no replay window
  check** — `ts` is unsigned metadata. De-duplicate on `event_id` (Tracking) or `id`
  (Returns / Warranty) instead.

## AfterShip Delivery Behavior This Example Accounts For

- **Responds 200 immediately**, then processes in `setImmediate`.
- **Retries:** a non-2xx triggers up to **14 attempts** with `2^retry × 30s` backoff
  (30s, 60s, 120s … 122,880s) — roughly **68 hours**.
- **At-least-once delivery:** handling must be idempotent. `event_id` (Tracking) and `id`
  (Returns / Warranty) are per-event UUIDs made for exactly this.
- **Versioned payloads:** `as-webhook-version` is logged. Tracking and Returns pin each
  webhook URL to a `YYYY-MM` version and fields change between them (`2026-01` renamed
  `checkpoint.zip` to `checkpoint.postal_code`).
- **Tracking URL rules:** port must be 80, 443 or 8080; up to 10 webhook URLs per org.
