# Printify Webhooks Overview

## What Are Printify Webhooks?

Printify is a print-on-demand platform. Webhooks notify your app when something happens in a Printify shop (an order ships, a product is published, a shop disconnects) so you don't have to poll the API. Each webhook subscribes to **one topic** and is created through the API, not the dashboard. Printify sends a `POST` with a JSON body to your URL and expects `200 OK`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order:created` | An order was created (no data sent) | Fetch and store the order |
| `order:updated` | An order's status changed | Sync production status |
| `order:line-item:canceled` | A single line item was canceled | Notify the customer, restock |
| `order:sent-to-production` | An order was sent to production | Mark as in production |
| `order:shipment:created` | Some or all items were fulfilled | Email tracking details |
| `order:shipment:delivered` | Some or all items were delivered | Mark delivered, request a review |
| `product:created` | A product was created | Sync the catalog |
| `product:updated` | A product was updated | Sync the catalog |
| `product:publish:started` | Publishing to your storefront began | Create the listing, then confirm via the API |
| `product:deleted` | A product was deleted | Remove the listing |
| `shop:disconnected` | The shop was disconnected | Stop syncing, flag the account |
| `personalization-preview-task:processed` | A preview task completed, was corrupt or failed | Fetch mockups or retry |

## Event Payload Structure

```json
{
  "id": "653b6be8-2ff7-4ab5-a7a6-6889a8b3bbf5",
  "type": "order:shipment:created",
  "created_at": "2017-04-18 13:24:28+00:00",
  "resource": {
    "id": "5cb87a8cd490a2ccb256cec4",
    "type": "order",
    "data": {
      "shop_id": 815256,
      "shipped_at": "2017-04-18 13:24:28+00:00",
      "carrier": { "code": "USPS", "tracking_number": "9400110200828911663274" },
      "skus": ["6220"]
    }
  }
}
```

- `id` is unique per event: use it for idempotency.
- `resource.type` is one of `shop`, `product`, `order`, `personalization-preview-task`.
- `resource.data` varies by event; `order:created`, `order:sent-to-production` and `shop:disconnected` send none.
- For `product:publish:started`, `data.action` is `create`, `update` or `delete`; `delete` carries only `action`.

## Full Event Reference

For the complete list of events, see [Printify's webhook documentation](https://developers.printify.com/#webhooks).
