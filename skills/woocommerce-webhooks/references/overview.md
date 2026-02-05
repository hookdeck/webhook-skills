# WooCommerce Webhooks Overview

## What Are WooCommerce Webhooks?

WooCommerce webhooks are HTTP callbacks that fire when specific events happen in your WooCommerce store. When an order is created, a product is updated, or a customer registers, WooCommerce can automatically send a POST request to your application with the event details.

This enables real-time integration between your WooCommerce store and external systems like:

- CRM systems (customer data sync)
- Email marketing platforms (order confirmations, abandoned carts)
- Inventory management (stock updates)
- Analytics platforms (sales tracking)
- Fulfillment services (order processing)

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.created` | New order is placed | Send order confirmation emails, create shipping labels, update inventory |
| `order.updated` | Order status or details change | Track order fulfillment, send status updates to customers |
| `order.deleted` | Order is permanently deleted | Clean up external records, reverse inventory changes |
| `order.restored` | Deleted order is restored | Restore external records, reapply inventory changes |
| `product.created` | New product is added | Sync to external catalogs, trigger marketing campaigns |
| `product.updated` | Product details change | Update pricing feeds, sync inventory levels |
| `product.deleted` | Product is permanently deleted | Remove from external catalogs, update recommendations |
| `product.restored` | Deleted product is restored | Restore to external catalogs |
| `customer.created` | New customer account registered | Send welcome emails, add to CRM, create loyalty profiles |
| `customer.updated` | Customer profile changes | Update CRM records, sync preferences |
| `customer.deleted` | Customer account deleted | Clean up external profiles, handle GDPR deletion |
| `coupon.created` | New coupon created | Sync to marketing platforms |
| `coupon.updated` | Coupon terms modified | Update promotional campaigns |
| `coupon.deleted` | Coupon removed | End promotional campaigns |

## Event Payload Structure

All WooCommerce webhooks share common payload elements:

```json
{
  "id": 123,
  "date_created": "2024-01-15T10:30:00",
  "date_modified": "2024-01-15T10:30:00",
  "status": "processing",
  // ... event-specific fields
}
```

### Order Events

Order webhooks include customer details, line items, totals, and shipping information:

```json
{
  "id": 456,
  "status": "processing",
  "currency": "USD",
  "total": "29.99",
  "billing": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  },
  "line_items": [
    {
      "id": 789,
      "name": "T-Shirt",
      "quantity": 1,
      "price": 29.99
    }
  ]
}
```

### Product Events

Product webhooks include details like name, price, stock status, and categories:

```json
{
  "id": 101,
  "name": "Premium T-Shirt",
  "status": "publish",
  "regular_price": "29.99",
  "stock_status": "instock",
  "manage_stock": true,
  "stock_quantity": 50
}
```

### Customer Events

Customer webhooks include profile information and preferences:

```json
{
  "id": 202,
  "email": "customer@example.com",
  "first_name": "Jane",
  "last_name": "Smith",
  "username": "jane_smith",
  "billing": {
    "first_name": "Jane",
    "last_name": "Smith",
    "company": "Example Corp"
  }
}
```

## Webhook Headers

Every WooCommerce webhook includes these important headers:

- **X-WC-Webhook-Topic** - The event type (e.g., "order.created")
- **X-WC-Webhook-Resource** - The resource type (e.g., "order")  
- **X-WC-Webhook-Event** - The action (e.g., "created")
- **X-WC-Webhook-Signature** - HMAC SHA256 signature for verification
- **X-WC-Webhook-Source** - The store URL that sent the webhook
- **X-WC-Webhook-ID** - The webhook configuration ID
- **X-WC-Webhook-Delivery-ID** - Unique identifier for this delivery attempt

## Full Event Reference

For the complete list of events and their payloads, see [WooCommerce's webhook documentation](https://woocommerce.com/document/webhooks/).

The WooCommerce REST API documentation also provides detailed payload schemas for each resource type.