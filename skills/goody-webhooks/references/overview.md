# Goody Webhooks Overview

## What Are Goody Webhooks?

[Goody](https://www.ongoody.com) is a corporate gifting platform with an Automation API and a
Commerce API. Webhooks tell you when something happens to an order or an order batch in your
organization. You can subscribe to all events or a subset. Goody sends them through
[Svix](https://www.svix.com/), so deliveries are Standard Webhooks-style signed messages.

| Aspect | Value |
|--------|-------|
| Method | `POST` (Goody states no method; this is Svix's delivery method), JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks `webhook-*` names carry the same values) |
| Secret | Per webhook, the **Signing Secret** on its configuration page (`whsec_...`) |
| Retries | Not documented by Goody; delivery logs per endpoint with manual re-send of failed webhooks |
| Handshake | None documented |

## Event Payload Structure

Every payload has the same envelope: `event_type`, `id` and `data`.

```json
{
  "event_type": "order.created",
  "id": "ad097c47-bf12-45c9-8feb-0536a0012c09",
  "data": {
    "id": "10c588dd-d566-45bf-86e9-c23bd1f1587b",
    "status": "created",
    "individual_gift_link": "https://gifts.ongoody.com/gift/vWtUe8lQRJuoyYzKlYeHMkbV",
    "recipient_first_name": "Alena",
    "recipient_email": "alena@ongoody.com",
    "order_batch_id": "4133078a-c35f-441e-8e92-57645342b299",
    "amounts": { "amount_product": 1000, "amount_total": null },
    "reference_id": "PCI7GLZ3KFIEN8MWWSD5LDCF"
  }
}
```

- `event_type` is the event name.
- `id` is the event id. Goody's schema calls the field `event_id`, but every example payload
  carries `id`.
- `data` is the order, or the order batch for `order_batch.*` events. An order includes
  `status`, `individual_gift_link`, `cart`, `shipments`, `amounts`, `thank_you_note` and
  `is_swapped`.

For deduplication use the `svix-id` header, which is stable across retries and re-sends.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order_batch.created` | An order batch is created (it may still be sending, or scheduled for later) | Track batch progress |
| `order_batch.completed` | An order batch is fully processed and all orders exist | Collect the gift links |
| `order.created` | An order is created and ready to be opened and accepted | Send `individual_gift_link` to the recipient |
| `order.gift_opened` | A gift is first opened (opening the link yourself can trigger it) | Engagement tracking |
| `order.gift_accepted` | The recipient accepts the gift; final costs are calculated | Record `amounts`, `is_swapped`, `cart` |
| `order.thank_you_note_added` | The recipient adds a thank you note | Show the note (`thank_you_note`) |
| `order.shipped` | The order ships (first shipment in transit) | Notify the sender |
| `order.delivered` | The order is delivered (all shipments delivered) | Close out the order |
| `order.canceled` | The order is canceled | Reverse bookkeeping |
| `order.refunded` | The order is refunded | Reverse bookkeeping |

These 10 events are the ones Goody documents; the list may not be exhaustive. The examples
handle exactly these and acknowledge anything else with `200`.

### Batch timing

- For non-scheduled batches with 10 or fewer recipients, `order_batch.created` already contains
  every recipient's order, and `order_batch.completed` follows instantly.
- For larger batches, orders are created asynchronously and `order_batch.completed` arrives
  after they exist.
- For scheduled batches, no orders exist until the scheduled send time, when
  `order_batch.completed` fires.

### Docs inconsistency: `gift_batch.*`

Goody's example payloads for the two batch events show `"event_type": "gift_batch.created"` and
`"gift_batch.completed"`, while the event pages and event lists use `order_batch.created` and
`order_batch.completed`. The examples here accept both spellings for the batch events. Log the
raw `event_type` on first deliveries to see which one your account sends.

## Full Event Reference

For payload schemas, see Goody's [webhooks overview](https://developer.ongoody.com/webhooks/overview)
and its per-event pages, for example
[order.created](https://developer.ongoody.com/webhooks/events/order.created).
