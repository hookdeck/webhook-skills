# Gopuff Webhooks Overview

## What Are Gopuff Webhooks?

The Powered by Gopuff partner API pushes order fulfillment updates to endpoints you register in the Svix App Portal, so you don't need to poll the Order API. Deliveries are signed by Svix (`svix-id`, `svix-timestamp`, `svix-signature`).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.status.v2` | Order status changes (recommended) | Update customers with delivery progress |
| `order.status` | Order status changes (full order object; end of support 08/15/2025) | Legacy integrations |
| `order.delivered` | Order successfully delivered | Post-delivery actions |

Gopuff also documents Delivery Status and Delivery ETA webhooks. Their pages give payloads but no event-type strings, so none are listed here.

## Order Status Flow

`Pending` (no event) -> `Packing_Now` -> `Packed` -> `Delivery` -> `Finished`, or `Cancelled` (terminal). In the Dev environment only `Cancelled` can be tested, by calling the cancel order endpoint.

## Event Payload Structure

There is no event-type field in the body; identify payloads by shape.

`order.status.v2`:

```json
{ "order": { "id": "0123456789", "location_id": 482, "partner_order_id": "ABC-512351", "status": "Delivery", "cancel_reason": null } }
```

`order.status` (legacy): `{ "order": <full Order object> }`.

Delivery Status (fires on driver location updates while status is `Delivery`):

```json
{ "id": "0123456789", "driver": { "location": { "latitude": 37.7749, "longitude": -122.4194 } },
  "partner_order_id": "ABC-512351", "delivering_multiple_orders": true, "delivering_this_order_next": false }
```

Delivery ETA (sent after order creation, repeated until terminal state):

```json
{ "id": "0123456789", "partner_order_id": "ABC-512351",
  "expected_delivery_time": { "min": "2025-08-21T18:35:00.000Z", "max": "2025-08-21T18:50:00.000Z" } }
```

The `order.delivered` payload is not documented; the examples treat any order payload with status `Finished` as delivered.

## Full Event Reference

[Gopuff webhook documentation](https://devportaldocs.poweredbygopuff.com/#/webhooks/introduction)
