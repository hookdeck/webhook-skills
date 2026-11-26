# Firstbase Webhooks Overview

## What Are Firstbase Webhooks?

Firstbase manages equipment for remote employees. Its webhooks push a notification to your
HTTPS endpoint when an order, return order or inventory order changes, so you don't have to poll
the API. Each notification is **thin**: it names the change and the resource id, and you fetch the
details from the Firstbase API.

Requests are `POST` with a JSON body. Respond with any `2xx` to acknowledge. The endpoint must be
HTTPS with a valid certificate.

Webhooks are **not signed**. Authentication is the secret header you configure with **Custom
header** authentication (see [setup.md](setup.md) and [verification.md](verification.md)).

## Event Types

| eventType | Triggered When | Common Use Cases |
|-----------|----------------|------------------|
| `CREATED` | An order, return order or inventory order is created | Start fulfilment tracking, notify the employee |
| `UPDATED` | One of those resources changes | Sync status, shipment or return progress |
| `DELETED` | One of those resources is deleted | Remove or archive the local record |

Notifications are sent per resource type: orders, return orders and inventory orders.

## Event Payload Structure

Firstbase's documented example:

```json
{
  "eventId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "eventType": "UPDATED",
  "resourceType": "ORDER",
  "resourceId": "550e8400-e29b-41d4-a716-446655440000"
}
```

- `eventId`: a unique UUID for the event. Firstbase says the same event may be delivered more than
  once during retries, so deduplicate on it.
- `eventType`: `CREATED`, `UPDATED` or `DELETED`.
- `resourceType`: `ORDER`, `RETURN_ORDER` or `INVENTORY_ORDER`.
- `resourceId`: the UUID of the order, return or inventory order.

The granular event selected on the webhook (for example order shipped or delivered) decides
whether a notification is sent but isn't in the payload. Fetch the resource from the Firstbase API
(`GET /api/v1/orders/{orderId}`, `/api/v1/returns/{returnId}` or
`/api/v1/inventory-orders/{inventoryOrderId}`) and read its status.

The **Test** button sends `{"type": "webhook.test", "timestamp": "..."}` instead, with no
`eventType`. Return a `2xx` for it.

## Full Event Reference

See [Firstbase's webhook documentation](https://support.firstbase.com/hc/en-us/articles/40623853911191-Setting-up-Webhooks).
