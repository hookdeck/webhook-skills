# DoorDash Drive Webhooks Overview

## What Are DoorDash Drive Webhooks?

DoorDash Drive sends near-real-time HTTPS requests to your endpoint as a delivery progresses, so you
can show a live map, push order status or update your own records without polling. This covers the
Drive API; Drive (classic) has its own webhook docs.

Webhooks are not signed. The credential is the `Authorization` header you configured (see
[verification.md](verification.md)). Each environment (Sandbox and Production) supports one endpoint.

## What Events Does DoorDash Drive Send?

Delivery webhooks carry `event_name` in the JSON body:

| Event | Triggered When |
|-------|----------------|
| `DASHER_CONFIRMED` | A Dasher accepted the delivery and is heading to pickup |
| `DASHER_CONFIRMED_PICKUP_ARRIVAL` | The Dasher arrived at the pickup location |
| `DASHER_PICKED_UP` | The Dasher picked up the delivery |
| `DASHER_CONFIRMED_DROPOFF_ARRIVAL` | The Dasher arrived at the dropoff location |
| `DASHER_DROPPED_OFF` | The delivery was dropped off and is complete |
| `DELIVERY_CANCELLED` | The delivery was cancelled; `cancellation_reason` says why |

Return-to-pickup deliveries only:

| Event | Triggered When |
|-------|----------------|
| `DELIVERY_RETURN_INITIALIZED` | The Dasher couldn't deliver and is returning to the pickup location |
| `DASHER_CONFIRMED_RETURN_ARRIVAL` | The Dasher arrived back at pickup to return the delivery |
| `DELIVERY_RETURNED` | The delivery was returned successfully |
| `DELIVERY_CANCELLED` (`cancellation_reason = failed_to_return`) | The return failed |

Pre-staged batch deliveries only: `DELIVERY_BATCHED` (with `force_batch_id`, shared by all deliveries in the batch).

Delivery tracking (opt-in, ask DoorDash support to enable): `dasher_enroute_to_pickup`,
`dasher_enroute_to_dropoff`, `dasher_enroute_to_return`. They send the Dasher's location every 30
seconds starting 15 minutes before pickup or dropoff. Note the lowercase names.

## Refund Webhooks

Refund webhooks (DoorDash approval required) have **no `event_name`**. The data is nested under
`event_data`: `reason`, `reason_comments`, `amount`, `currency_code`, `amount_details` (with
optional item-level `items`), `order_details` and `customer_refund_details`. Branch on the presence
of `event_data`, as the examples do.

## Payload Structure

Webhooks include every delivery field available at that moment; empty fields are omitted, so always
check a field exists before reading it (for example `pickup_time_actual` only appears after pickup).
Common fields: `event_name`, `created_at`, `updated_at`, `external_delivery_id`, `dasher_id`,
`dasher_name`, `dasher_location` (`lat`, `lng`), `pickup_address`, `dropoff_address`,
`pickup_time_estimated`/`_actual`, `dropoff_time_estimated`/`_actual`, `order_value`, `fee`, `tip`,
`currency`, `support_reference`, `tracking_url`. Times are ISO-8601 UTC.

## Retries

DoorDash sends each event up to 3 times: any response other than `200 OK`, or no response, triggers
2 more attempts. A `401` is retried like any other failure. Make handlers idempotent (for example key
on `external_delivery_id` plus `event_name`).

## Full Reference

- Webhooks guide: https://developer.doordash.com/en-US/docs/drive/how_to/webhooks
- Event and field reference: https://developer.doordash.com/en-US/docs/drive/reference/webhooks
- Refund webhooks: https://developer.doordash.com/en-US/docs/drive/reference/webhooks-refunds
