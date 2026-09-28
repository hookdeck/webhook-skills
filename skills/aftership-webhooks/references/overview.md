# AfterShip Webhooks Overview

## What Are AfterShip Webhooks?

AfterShip (aftership.com) is a post-purchase platform. Four of its products push events
to your endpoint over HTTP POST:

| Product | What it sends | Admin |
|---------|---------------|-------|
| **Tracking** | Shipment status changes, EDD revisions, pending-shipment alerts | admin.aftership.com |
| **Shipping** (formerly **Postmen**) | Async results of rate / label / cancel / manifest API calls | admin.postmen.com |
| **Returns** | Return lifecycle (submitted → approved → resolved), return shipments, restocks | AfterShip Returns settings |
| **Warranty** | Warranty claim lifecycle and inbound/outbound shipments | AfterShip Warranty settings |

All four sign with the same algorithm (HMAC-SHA256, base64, over the raw body) but use
different header names. See [verification.md](verification.md).

Do not confuse AfterShip with ShipStation, ShipBob, ShipHero or Shippo — separate
companies with separate webhook schemes.

## Tracking Events

Tracking publishes exactly **three** event codes. Do not invent others — there is no
`tracking.delivered` and no `shipment.updated`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `tracking_update` | A shipment's status changes — Info received, In Transit, Out for Delivery, Available for pickup, Delivered, Failed attempt, Expired, Exception | Order status sync, delivery notifications, exception alerting |
| `edd_revise` | The estimated delivery date is revised | Update the promised date in your UI, notify the customer of a delay |
| `tracking_pending_time` | A shipment has been pending for a user-defined threshold | Flag carriers that never scanned the parcel, chase the warehouse |

The delivery *status* lives in `msg.tag` (and the finer-grained `msg.subtag`), **not** in
`event`. Route `tracking_update` on the tag:

| `msg.tag` | Meaning |
|-----------|---------|
| `Pending` | No carrier tracking info yet |
| `InfoReceived` | Carrier has the shipment details, parcel not yet picked up |
| `InTransit` | Moving through the carrier network |
| `OutForDelivery` | On the delivery vehicle |
| `AttemptFail` | Carrier tried to deliver and failed |
| `Delivered` | Delivered |
| `AvailableForPickup` | Waiting at a pickup point |
| `Exception` | Returned to sender, customs hold, damage, etc. |
| `Expired` | No tracking information for 30 days since the shipment was added |

`msg.subtag` narrows the tag (e.g. `InTransit_001` — "In Transit"), and
`msg.subtag_message` is the human-readable form.

### Tracking Payload Structure

Headers on a Tracking delivery:

```
Aftership-Hmac-Sha256: <base64 HMAC-SHA256 of the raw body>
Content-Type: application/json
User-Agent: AfterShipTrackingWebhook/4.0.0 (https://www.aftership.com)
As-Webhook-Version: 2026-07
```

Body (trimmed):

```json
{
  "event": "tracking_update",
  "event_id": "94dadd60-ed26-46d0-aa52-3ced925a50ff",
  "is_tracking_first_tag": true,
  "msg": {
    "id": "00000000000000000000000000000000",
    "tracking_number": "0000000000000000",
    "slug": "usps",
    "tag": "InTransit",
    "subtag": "InTransit_001",
    "subtag_message": "In Transit",
    "title": "0000000000000000",
    "order_number": "string",
    "checkpoints": [
      {
        "checkpoint_time": "2021-01-14T00:52:00",
        "message": "Departed Shipping Partner Facility, USPS Awaiting Item",
        "slug": "usps",
        "tag": "InTransit",
        "subtag": "InTransit_001"
      }
    ]
  },
  "ts": 1712741696
}
```

| Field | Meaning |
|-------|---------|
| `event` | The event code (one of the three above) |
| `event_id` | UUID v4, unique per event — **use this as your idempotency key** |
| `is_tracking_first_tag` | Whether this is the first update sent under this delivery tag (e.g. the first `InTransit`), so you can notify only on key transitions |
| `msg` | The full Tracking object — `id`, `tracking_number`, `slug` (carrier), `tag`, `subtag`, `subtag_message`, `checkpoints[]`, `title`, `order_number`, `aftership_estimated_delivery_date`, and more |
| `ts` | UTC UNIX seconds when the event occurred (metadata only — it is **not** signed, so never use it for replay protection) |

### Tracking Webhook Versioning

Every Tracking webhook URL is pinned to a version in `YYYY-MM` form (`2026-07`, `2026-01`,
`2025-07`, `2025-04`, `2025-01`, …). The version is echoed in the `as-webhook-version`
request header on each delivery and is **independent of the API version**.

Fields change between versions — for example `2026-01` renamed `checkpoint.zip` to
`checkpoint.postal_code`. Read `as-webhook-version` in your handler if you support more
than one.

## Shipping (Postmen) Events

The event name is in `event_type`, not `event`:

| Event | Triggered When |
|-------|----------------|
| `calculate_rates` | An async `POST /rates` call has finished |
| `create_a_label` | An async `POST /labels` call has finished |
| `cancel_a_label` | An async `POST /cancel-labels` call has finished |
| `manifest_a_label` | An async `POST /manifests` call has finished |

Payload shape:

```json
{
  "event_type": "create_a_label",
  "date_time": "2022-02-11T08:10:56+00:00",
  "meta": { "code": 200, "message": "OK", "details": [] },
  "data": { "id": "...", "status": "created", "files": { "label": { "url": "https://...postmen.com/..." } } }
}
```

`meta` is the standard AfterShip Shipping API envelope (`code`, `message`, `details`) and
`data` is the same object the synchronous API would have returned. Check `meta.code`
before treating `data` as a success.

## Returns Events

| Event | Triggered When |
|-------|----------------|
| `return.submitted` | A shopper submits a return request |
| `return.approved` | The return is approved |
| `return.rejected` | The return is rejected |
| `return.resolved` | The return is resolved (refunded / exchanged / credited) |
| `return.expired` | The return window lapsed |
| `return.dropoff.created` | A dropoff is created |
| `return.dropoff.updated` | A dropoff is updated |
| `return.dropoff.shipment.updated` | A dropoff shipment's tracking changes |
| `return.restock.created` | Items are restocked |
| `return.shipment.provided` | A return shipment/label is provided |
| `return.shipments.provided` | Multiple return shipments are provided |
| `return.shipment.recorded` | A shopper records their own shipment |
| `return.shipment.updated` | A return shipment's tracking changes |
| `return.exchange.order.created` | An exchange order is created |
| `return.receiving.created` | Items are received at the warehouse |

`return.shipment.skipped` and `return.shipments.requested` appear in the docs marked
**"Not available yet"** — do not build on them.

Returns payload shape:

```json
{
  "id": "3df04d0cdf3c492fad33a15f753fb960",
  "version": "2026-07",
  "event": "return.approved",
  "created_at": "2024-04-10T07:34:56.000Z",
  "modified": { "...": "event-specific — see the Returns webhook reference" },
  "data": { "id": "...", "rma_number": "RMA-1001", "approval_status": "approved" }
}
```

| Field | Meaning |
|-------|---------|
| `id` | Unique per event (documented as "UUID v4 format"; the docs' example is 32 hex chars without dashes) — **use as the idempotency key** |
| `version` | Webhook version, e.g. `2026-07` (also sent in the `as-webhook-version` header) |
| `event` | The event name |
| `created_at` | ISO 8601 timestamp |
| `modified` | Event-specific diff of what changed |
| `data` | Full snapshot of the return object |

AfterShip's docs say to treat enum values as **open strings** — new values can appear
without a version bump, so always have a default branch.

## Warranty Events

| Event | Triggered When |
|-------|----------------|
| `warranty.created` | A warranty claim is created |
| `warranty.approved` | The claim is approved |
| `warranty.processing` | The claim moves into processing |
| `warranty.completed` | The claim is completed |
| `warranty.canceled` | The claim is canceled |
| `warranty.rejected` | The claim is rejected |
| `warranty.inbound_shipment.provided` | An inbound shipment/label is provided |
| `warranty.inbound_shipment.updated` | An inbound shipment's tracking changes |
| `warranty.outbound_shipment.provided` | An outbound (replacement) shipment is provided |
| `warranty.outbound_shipment.updated` | An outbound shipment's tracking changes |
| `warranty.item_received` | An item is received at the warehouse |

Warranty uses the same `as-signature-hmac-sha256` header as Returns but its **own
envelope** — there is no `modified`, and the claim is in `current_context`, not `data`.
From the Warranty webhook reference example (trimmed):

```json
{
  "id": "c82422a62a69b4fb17c1c4a35bfcd734b",
  "event": "warranty.created",
  "version": "2024-01",
  "created_at": "2024-02-01T21:29:47.218678282Z",
  "data": { "warranty": { "id": "102a899f79c82422c99b1fdc417e01010" } },
  "current_context": {
    "id": "102a899f79c82422c99b1fdc417e01010",
    "rma_number": "AABBCCF1",
    "status": "under_review"
  }
}
```

| Field | Meaning |
|-------|---------|
| `id` | Unique per event — use as the idempotency key |
| `data.warranty` | Reference to the claim; shipment events also carry `data.warranty_shipment` |
| `current_context` | The full claim resource — `status` (`under_review`, `approved`, `in_process`, `completed`, `rejected`, `canceled`), `rma_number`, `items`, `order`, `receiving_status`, … |

## Delivery, Retries and Handshake

- **No handshake.** There is no challenge/echo step. Tracking's admin has a "Send test
  webhook" button that sends an ordinary delivery and expects a `2xx`.
- **Retries (all products):** up to **14 attempts** with exponential backoff,
  `delay = 2^retry × 30s` — 30s, 60s, 120s, 240s … 122,880s, about **68 hours** in total.
- **Tracking URL constraints:** the URL's port must be **80, 443 or 8080**, and an
  organization can register up to **10** Tracking webhook URLs.
- **Idempotency:** Tracking gives you `event_id`; Returns and Warranty give you `id`.
  Shipping has no per-event UUID — key on `data.id` plus `event_type`.

## Source IPs

AfterShip **Tracking** delivers from these addresses:

```
104.154.18.15
34.122.118.39
34.70.29.163
34.70.81.106
34.72.178.234
```

Source: <https://www.aftership.com/docs/tracking/webhook/webhook-outgoing-ips>

Shipping, Returns and Warranty each publish their **own** outgoing-IP page — the Tracking
list above does **not** apply to them. Look up the list for the product you are receiving
before allowlisting anything. An IP allowlist is a defence-in-depth measure, never a
replacement for signature verification.

## Full Event Reference

- Tracking webhooks: <https://www.aftership.com/docs/tracking/webhook/webhook-overview>
- Tracking signature: <https://www.aftership.com/docs/tracking/webhook/webhook-signature>
- Tracking outgoing IPs: <https://www.aftership.com/docs/tracking/webhook/webhook-outgoing-ips>

The docs site is JS-rendered behind Cloudflare, so `curl` and most fetch tools receive a
"Just a moment…" shell rather than the content — open the pages in a real browser.
