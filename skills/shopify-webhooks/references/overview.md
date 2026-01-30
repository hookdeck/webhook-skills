# Shopify Webhooks Overview

## What Are Shopify Webhooks?

Shopify uses webhooks to notify your application when events occur in a store. Instead of polling the API for changes, Shopify sends HTTP POST requests to your configured endpoint URL whenever something happens—like a new order, product update, or customer creation.

Webhooks are essential for building Shopify apps and integrations that react to store events in real-time.

## Common Event Types

Shopify webhook topics use a `resource/action` format:

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `orders/create` | New order is placed | Fulfill order, sync to ERP, send notifications |
| `orders/updated` | Order details change | Update fulfillment status, sync changes |
| `orders/paid` | Order payment completes | Trigger fulfillment, record revenue |
| `orders/cancelled` | Order is cancelled | Refund processing, inventory adjustment |
| `products/create` | New product added | Sync to external catalog |
| `products/update` | Product details change | Update external listings |
| `products/delete` | Product removed | Remove from external catalog |
| `customers/create` | New customer registers | Welcome email, CRM sync |
| `customers/update` | Customer info changes | Update CRM, mailing lists |
| `app/uninstalled` | App is uninstalled | Cleanup, data export |
| `shop/update` | Store settings change | Update integrations |

## Event Payload Structure

All Shopify webhook payloads include:

```json
{
  "id": 123456789,
  "admin_graphql_api_id": "gid://shopify/Order/123456789",
  "created_at": "2024-01-15T10:30:00-05:00",
  "updated_at": "2024-01-15T10:30:00-05:00",
  // ... resource-specific fields
}
```

Key headers included with each webhook:

| Header | Description |
|--------|-------------|
| `X-Shopify-Topic` | The webhook topic (e.g., `orders/create`) |
| `X-Shopify-Shop-Domain` | The store domain (e.g., `my-store.myshopify.com`) |
| `X-Shopify-API-Version` | API version used for the payload |
| `X-Shopify-Hmac-SHA256` | HMAC signature for verification |
| `X-Shopify-Webhook-Id` | Unique webhook delivery ID |

## Mandatory Webhooks

Shopify apps must implement certain webhooks to comply with data privacy requirements:

| Webhook | Purpose |
|---------|---------|
| `customers/data_request` | Customer requests their data (GDPR) |
| `customers/redact` | Customer requests data deletion (GDPR) |
| `shop/redact` | Store owner requests data deletion |

These must be configured even if your app doesn't store customer data.

## Full Event Reference

For the complete list of webhook topics, see [Shopify Webhook Topics](https://shopify.dev/docs/api/admin-rest/current/resources/webhook).

For detailed payload schemas, see [Shopify Webhooks Documentation](https://shopify.dev/docs/apps/build/webhooks).
