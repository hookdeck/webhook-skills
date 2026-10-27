# Infinite Giving Webhooks Overview

## What Are Infinite Giving Webhooks?

Infinite Giving (infinitegiving.com) is a non-cash donation platform (stock, crypto, DAF) for nonprofits. Integration partners receive HTTP `POST` requests at their webhook URL when donations are created or updated for connected organizations (after the OAuth connect flow).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `donation:created` | A donation record is created | Record a pledged gift, notify the nonprofit |
| `donation:updated` | Status or material fields change after creation (e.g. `processing`, `complete`, `failed`, `canceled`) | Mark a gift complete, record sale details, handle cancellations |

There is no separate `donation:completed` event. Completion arrives as `donation:updated` with `data.status` set to `"complete"`.

## Headers

| Header | Description |
|--------|-------------|
| `X-IG-Webhook-Id` | Unique delivery id (same as envelope `id`). Use to dedupe. |
| `X-IG-Event` | Event type, e.g. `donation:created` |
| `X-IG-Timestamp` | Unix timestamp (seconds) used in the signature |
| `X-IG-Signature` | `sha256=<hex>` HMAC signature |

## Event Payload Structure

Delivery format:

```json
{
  "id": "A1B2C3D4E",
  "event": "donation:created",
  "created_at": "2026-06-23T21:00:00.000Z",
  "data": { }
}
```

Both events carry the same donation snapshot in `data`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Donation id |
| `object` | string | Always `"donation"` |
| `organization` | object | `{ id, name }` |
| `type` | string \| null | Donation type (e.g. `stock`, `crypto`) |
| `status` | string \| null | e.g. `pledged`, `processing`, `complete`, `failed`, `canceled` |
| `identifier` | string \| null | Ticker, asset symbol, or similar |
| `quantity` | number \| null | Units donated |
| `tax_deductible_amount` | number \| null | Tax-deductible amount; currency donations carry it from creation, stock/crypto/DAF stay `null` until valued |
| `recognition` | string \| null | `public`, `private`, or `anonymous` (not a name) |
| `memo` | string \| null | Memo |
| `source` | string \| null | Depends on `type`: the brokerage for stock, the Stripe PaymentIntent id for currency, the wallet address for crypto |
| `cancelation_reason` | string \| null | Set when canceled |
| `campaign` | object \| null | `{ id, name }` |
| `designation` | object \| null | `{ id, name }` |
| `trade` | object \| null | Sale details when available |
| `donor` | object | `{ first_name, last_name, email }` |
| `created_at`, `updated_at` | string \| null | ISO-8601 |

`trade` fields: `executed_at`, `settled_at`, `fill_price` and `fill_quantity` (both `null` until the sale fills), and the fee fields `sec_fee`, `postedge_fee`, `liquidity_fee`, `orf_fee`, `nasd_fee`, `misc_fee`. Gross proceeds are `fill_price * fill_quantity`; subtract the fees for the net. This will not equal `tax_deductible_amount`, which for stock is valued on the date shares were received.

## Delivery

Up to 5 attempts: the first plus four retries about 1m, 5m, 30m, and 2h apart. No timeout is stated in the docs.

## Full Event Reference

See [Infinite Giving's webhook documentation](https://docs.infinitegiving.com/guide/webhooks/overview).
