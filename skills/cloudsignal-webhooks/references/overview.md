# CloudSignal Webhooks Overview

## What Are CloudSignal Webhooks?

**CloudSignal** is the outbound webhook product of **Cloudprinter.com**, a
print-on-demand fulfilment network. As a print order and its items move through
production and shipping, Cloudprinter POSTs JSON **signals** to an endpoint you
register, so your app can track fulfilment state in real time instead of polling.

> **Disambiguation:** This is **Cloudprinter.com CloudSignal Webhooks v2.1**, not
> the unrelated `cloudsignal.io` MQTT/IoT platform.

## How Delivery Works

1. Cloudprinter POSTs a JSON signal to your registered HTTPS endpoint.
2. Every request carries a plaintext **Webhook API key** in the body's `apikey`
   field — this is how you authenticate the delivery (there is **no signature
   header/HMAC**). See [verification.md](verification.md).
3. Your endpoint validates the `apikey`, processes the signal, and returns
   **HTTP 200** (or 204, which Cloudprinter documents as "succeeded, order not
   found"). Any response body is ignored.
4. If your endpoint returns anything other than 200/204 (or is unreachable),
   CloudSignal **retries — up to 100 attempts over 7 days**, with the gap growing
   after each attempt. The admin dashboard's CloudSignal logs can resend or cancel
   a signal.

## Signal Types (`type`)

Signal types, case-sensitive PascalCase. The value is in the `type` field. The
first eleven are on the v2.1 reference (v2.1 added the three `ItemDelivery*`
signals); `CloudprinterOrderCanceled` appears only in the official Node SDK, with
no documented payload:

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `CloudprinterOrderValidated` | The order was received and validated | Mark order accepted, start tracking |
| `ItemValidated` | An item was validated by production | Update per-item status |
| `ItemProduce` | Production of an item started | Show "in production" to the customer |
| `ItemProduced` | Production of an item completed | Advance fulfilment state |
| `ItemPacked` | An item was packed | Prepare shipping notifications |
| `ItemShipped` | An item was dispatched | Store `tracking`, email the customer |
| `ItemError` | A production issue occurred | Alert your team, reprint, or refund |
| `ItemCanceled` | An item was canceled in production | Reconcile inventory, refund |
| `ItemDeliveryStarted` | The carrier received the item | Show "out for delivery" |
| `ItemDeliveryCompleted` | The item was delivered | Close the order |
| `ItemDeliveryFailed` | Delivery failed (returned or lost) | Contact the customer, reship |
| `CloudprinterOrderCanceled` | The whole order was canceled (SDK only) | Cancel downstream processing, refund |

## Event Payload Structure

All signals share a common core, plus type-specific fields. The v2.1 reference's
`ItemShipped` example (with `apikey` replaced by a placeholder):

```json
{
  "apikey": "your-webhook-api-key",
  "type": "ItemShipped",
  "order": "123456780000",
  "item": "123456780001",
  "order_reference": "654321",
  "item_reference": "321",
  "tracking": "1A2B3C4D5E6F",
  "shipping_option": "GLS",
  "datetime": "2017-01-21T13:23:42+00:00",
  "url": "https://gls-group.eu/EU/en/parcel-tracking?match=1A2B3C4D5E6F"
}
```

Common fields:

| Field | Description |
|-------|-------------|
| `apikey` | Per-endpoint Webhook API key — authenticate against this (see [verification.md](verification.md)) |
| `type` | The signal type (see table above) |
| `order` | Cloudprinter order id |
| `order_reference` | Your reference passed when the order was created — key for matching |
| `item` | Cloudprinter item id (present on `Item*` signals) |
| `item_reference` | Your item reference — key for matching |
| `datetime` | ISO 8601 production signal timestamp |

Type-specific fields:

| `type` | Extra fields |
|--------|--------------|
| `ItemShipped` | `tracking` (carrier tracking number), `shipping_option`, `url` (HTTPS tracking URL) |
| `ItemError` | `cause` (text; optional), `delay` (expected delay in hours; optional) |
| `ItemCanceled` | `cause` (cause ID; optional), `message` (reason; optional) |
| `ItemDelivery*` | `tracking`, `message` (carrier tracking details); both optional |

> Field availability can vary by product and configuration; treat type-specific
> fields defensively (they may be absent). Confirm details against the official
> docs linked below.

## Idempotency

CloudSignal may redeliver a signal (its retry policy is up to 100 attempts over
7 days), and signals carry no ID. Deduplicate on `(type, order, item, datetime)`.
Don't key on `item_reference` + `type` alone: an item can raise `ItemError` more
than once, and the delivery signals can repeat as the carrier reports progress. See
[webhook-handler-patterns / idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Full Documentation

- [CloudSignal Webhooks v2.1](https://docs.cloudprinter.com/client/cloudsignal-webhooks-v2-1)
- [CloudSignal connected app (setup)](https://docs.cloudprinter.com/connected-apps/cloudsignal-webhooks/)
