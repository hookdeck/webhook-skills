# Bringg Webhooks Overview

## What Are Bringg Webhooks?

Bringg is a delivery orchestration platform. Its webhooks notify your other systems (an order
management system, for example) in real time when an event occurs in the order life cycle.
Bringg sends them as HTTP `POST` requests to the URL(s) you register, once per event, with no
polling. You register once per event type, and can add several URLs to the same webhook.

Webhooks are **not signed**. Authentication is optional and, in this skill, uses a Static
Header you add to the webhook (see [verification.md](verification.md)).

## Common Event Types

The event type is in the body as `webhook_type`.

| `webhook_type` | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `task_created` | A new order is created | Create the order in your OMS |
| `task_done` | An order is completed | Mark as delivered, invoice |
| `task_cancelled` | An order is cancelled | Cancel downstream |
| `driver_assigned` | An order is assigned to a driver | Notify the customer |
| `way_point_arrived` | A driver arrives at a way point | "Driver has arrived" message |
| `note_created` | A note, photo, signature or form is added to an order (shown as "Order Attachment Created" in Bringg) | Store proof of delivery |

More from the Webhooks Index: `task_accepted`, `task_checked_in`, `task_late`,
`way_point_left`, `way_point_eta_changed`, `driver_on_the_way`, `driver_unassigned`,
`task_rejected_order`, `task_payment_created`, `rating_submitted`, `run_started`, `run_ended`,
`route_optimization_done`, `customer_created`, `scan_created`, `alert_created`.

## Event Payload Structure

Order (task) webhooks such as `task_created` carry the order object: `id`, `title`, `status`,
`customer_id`, `scheduled_at`, `merchant_id`, `way_points[]` (with address, lat/lng, customer
and contacts), and more. Other webhooks carry the fields relevant to their event. Bringg's
**Flexible Webhook** option lets you choose which fields are included, which changes the payload
shape, so test the receiver after changing it.

```json
{
  "webhook_type": "task_created",
  "id": 8503585,
  "title": "50 cases of Best Brand Soda",
  "status": 0,
  "way_points": [{ "id": 10640287, "address": "120 Fifth Ave, Pittsburgh, PA 15222, USA" }]
}
```

## Delivery and Retries

Bringg tries to send each webhook three times. If the expected confirmation from your system
never arrives after the third attempt, the webhook appears in the **Generate Undelivered
Webhooks Report** API. Make handlers idempotent and respond quickly.

## Full Event Reference

See the [Webhooks Index](https://developers.bringg.com/reference/webhooks-index) and
[Send Bringg Webhooks](https://developers.bringg.com/docs/bringg-webhooks).
