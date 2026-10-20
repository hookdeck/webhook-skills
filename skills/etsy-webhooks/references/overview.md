# Etsy Webhooks Overview

## What Are Etsy Webhooks?

Etsy webhooks send real-time notifications to approved Etsy Open API v3 applications when something happens in a shop, so your app doesn't have to poll the API. They are available to both commercial and personal applications.

Etsy payloads are **thin notifications**: they tell you what happened and give you a `resource_url` to fetch the current state with your OAuth 2.0 access token. They do not contain the full receipt, listing, or product.

## Which Etsy Webhook Events Are Available?

Events are grouped into three domains: Order, Listing, and Inventory.

### Order Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.paid` | An order receives payment | Start fulfillment, sync to an order management system |
| `order.canceled` | A seller cancels an order | Stop fulfillment, restock, refund in downstream systems |
| `order.shipped` | Shipping information is created for a product on a shop receipt | Notify customers, update tracking dashboards |
| `order.delivered` | An order is marked as delivered | Trigger review requests, close out fulfillment |

### Listing Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `listing.created` | A listing is created | Mirror the catalog to another channel |
| `listing.updated` | Title, Description, Personalization, Taxonomy, Images, Attributes, or State changes | Keep external catalogs in sync |
| `listing.deleted` | A listing is deleted | Remove the listing from other channels |

### Inventory Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `inventory.created` | A product is created | Add the SKU to inventory systems |
| `inventory.updated` | Price, Readiness State, SKU, or State changes | Sync prices and stock across channels |
| `inventory.deleted` | A product is deleted | Remove the SKU downstream |
| `inventory.out_of_stock` | A product's quantity reaches 0 | Alert the seller, pause ads, reorder materials |

A **listing** is a container (e.g. a t-shirt); a **product** is a purchasable variant of it (e.g. the small, blue t-shirt). Inventory events are about products.

Note the spelling `order.canceled` (American, one "l").

## What Does an Etsy Webhook Payload Look Like?

All events share these fields:

| Field | Order | Listing | Inventory | Description |
|-------|:-----:|:-------:|:---------:|-------------|
| `event_type` | ✓ | ✓ | ✓ | The event name, e.g. `order.paid` |
| `resource_url` | ✓ | ✓ | ✓ | Etsy API URL to fetch the updated resource |
| `shop_id` | ✓ | ✓ | ✓ | The shop the event relates to |
| `listing_id` | | ✓ | ✓ | The listing involved |
| `product_id` | | | ✓ | The product (variant) involved |

### Order (`resource_url` → getShopReceipt)

```json
{
  "event_type": "order.paid",
  "resource_url": "https://api.etsy.com/v3/application/shops/{YOUR_SHOP_ID}/receipts/{RECEIPT_ID}",
  "shop_id": "{YOUR_SHOP_ID}"
}
```

### Listing (`resource_url` → getListing, with `?includes=Images,Personalization`)

```json
{
  "event_type": "listing.updated",
  "resource_url": "https://api.etsy.com/v3/application/shops/{YOUR_SHOP_ID}/listings/{LISTING_ID}?includes=Images,Personalization",
  "shop_id": "{YOUR_SHOP_ID}",
  "listing_id": "{LISTING_ID}"
}
```

### Inventory (`resource_url` → getListingProduct)

```json
{
  "event_type": "inventory.updated",
  "resource_url": "https://api.etsy.com/v3/application/shops/{YOUR_SHOP_ID}/listings/{LISTING_ID}/products/{PRODUCT_ID}",
  "shop_id": "{YOUR_SHOP_ID}",
  "listing_id": "{LISTING_ID}",
  "product_id": "{PRODUCT_ID}"
}
```

The event type is in the body's `event_type` field, not in a header. Use the `webhook-id` header as your idempotency key: it stays the same across retries.

## How Does Etsy Retry Failed Deliveries?

A delivery fails if your endpoint doesn't return a 2xx. Etsy retries with exponential backoff, each delay starting after the previous attempt fails: immediately, 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours. You can also retry a message manually, or "Recover" all failed messages since a date, from the Webhook portal.

Because a slow handler can cause a retry, return 200 quickly and do the `resource_url` fetch asynchronously.

## Full Event Reference

See [Etsy's webhook documentation](https://developers.etsy.com/documentation/essentials/webhooks/) and the [Etsy Open API announcements](https://github.com/etsy/open-api/discussions/categories/announcements) for newly added events.
