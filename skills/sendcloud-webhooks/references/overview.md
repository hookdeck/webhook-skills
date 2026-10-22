# Sendcloud Webhooks Overview

## What Are Sendcloud Webhooks?

Sendcloud notifies your application of parcel updates (such as delivery status changes), returns, and integration lifecycle changes by POSTing JSON to a URL you configure. Webhooks are scoped to one integration: you only receive events for parcels created through that integration, and each integration needs its own webhook configuration. Return parcels only produce updates if the outgoing shipment was created through the API integration.

## Common Event Types

The event type is the `action` field in the body.

| Event (`action`) | Triggered When | Common Use Cases |
|------------------|----------------|------------------|
| `parcel_status_changed` | A parcel of this integration shifts to a different status | Update order status, notify customers |
| `return_created` | A return is created via the API or Return Portal (not the Return Form) | Start refund or restock flows |
| `integration_connected` | The integration is created | Provisioning |
| `integration_updated` | The integration is modified | Sync settings |
| `integration_deleted` | The integration is deleted | Clean up |

## Event Payload Structure

Every payload has `action` and `timestamp`.

- `parcel_status_changed`: `timestamp`, `carrier_status_change_timestamp`, and a `parcel` object (`id`, `tracking_number`, `tracking_url`, `status.id`, `status.message`, `carrier`, `shipment`, `order_number`, `external_order_id`, address fields, `label`, ...).
- `return_created`: `data` object (`id`, `brand_id`, `order_number`, `return_reason_id`, `paid_return`, `refund_type`, `items[]`, ...).
- `integration_*`: `integration` object (`id`, `shop_name`, `shop_url`, `system`, `webhook_active`, `webhook_url`, ...).

There is no event ID. Webhooks can arrive out of order, so use `timestamp` to pick the latest parcel update.

## Full Event Reference

See [Sendcloud's webhook documentation](https://sendcloud.dev/api/v3/webhooks/index) and the per-event pages for [parcel status changed](https://sendcloud.dev/api/v3/webhooks/parcel-status-changed) and [return created](https://sendcloud.dev/api/v3/webhooks/return-created).
