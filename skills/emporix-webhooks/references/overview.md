# Emporix Webhooks Overview

## What Are Emporix Webhooks?

The Emporix Webhook Service lets external systems subscribe to events published by the Commerce Engine
(orders, customers, products, and more) instead of polling APIs. Events flow from the Webhook Service to the
Event Gateway, which delivers them to the endpoints you configured. A tenant can have one webhook
configuration per strategy type: `svix`, `svix_shared`, and `http`.

| Strategy | Dashboard name | Covered here |
|----------|----------------|--------------|
| `svix_shared` | Shared account - Svix (default) | Yes |
| `svix` | Licensed account - Svix (your own Svix API key) | Yes |
| `http` | Other - HTTP (`emporix-event-signature`, optional HMAC) | **No**, and Hookdeck's Emporix source doesn't support it |

Svix-Shared is limited to 5000 events per tenant per month (resets on the first of the month); beyond that,
requests are not sent. The licensed Svix strategy follows your own Svix plan.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.created` | An order is created | Push to an OMS or ERP, send confirmations |
| `order.updated` | An order is updated | Sync order changes |
| `customer.created` | A customer is created | CRM sync, welcome flows |
| `product.created` | A product is created | PIM / search sync |
| `product.updated` | A product is updated | Catalog sync |

## Full Event List (from the Emporix event reference)

| Service | Events |
|---------|--------|
| Availability | `availability.created`, `availability.updated`, `availability.deleted` |
| Cart | `cart.created`, `cart.updated`, `cart.merged`, `cart.closed`, `cart.item-added`, `cart.item-updated`, `cart.item-deleted` |
| Catalog | `catalog.created`, `catalog.updated`, `catalog.deleted` |
| Category Tree | `category.created`, `category.updated`, `category.deleted`, `assignment.created`, `assignment.deleted` |
| Client Management | `client-management.legalentity-created`, `client-management.legalentity-updated`, `client-management.legalentity-deleted`, `client-management.user-assigned-to-legalentity`, `client-management.location-created`, `client-management.location-updated`, `client-management.location-deleted` |
| Customer | `customer.created`, `customer.updated`, `customer.deleted`, `customer.password-reset`, `customer.refresh-token`, `customer.opt-in`, `customer.logged.in`, `customer.email-change`, `customer.email-change-request`, `customer.sign-up` |
| Customer Segment | `customer-segment.segment-created`, `customer-segment.segment-updated`, `customer-segment.segment-deleted`, `customer-segment.customer-assignment-created`, `customer-segment.customer-assignment-updated`, `customer-segment.customer-assignment-deleted`, `customer-segment.item-assignment-created`, `customer-segment.item-assignment-updated`, `customer-segment.item-assignment-deleted` |
| Index Item | `index-item.updated`, `index-item.deleted` |
| Order | `order.created`, `order.updated`, `order.deleted`, `order.cancelled`, `order.status-changed` |
| Price | `price.created`, `price.updated`, `price.deleted`, `price-model.created`, `price-model.updated`, `price-model.deleted`, `price-list.created`, `price-list.updated`, `price-list.deleted`, `price-list-price.created`, `price-list-price.updated`, `price-list-price.deleted` |
| Product | `product.created`, `product.updated`, `product.deleted` |
| Quote | `quote.created`, `quote.updated`, `quote.deleted` |
| Return | `return.created`, `return.updated`, `return.deleted` |
| Schema | `schema.custom-instance-created`, `schema.custom-instance-updated`, `schema.custom-instance-deleted` |
| Site | `site.site-created`, `site.site-updated`, `site.site-deleted` |
| Vendor | `vendor.vendor-created`, `vendor.vendor-updated`, `vendor.vendor-deleted` |

The Management Dashboard page refers to the index events as `index.item-updated`, while the event reference
and the Algolia guide use `index-item.updated`. Check the **Event catalog** in the Svix dashboard for the
exact string your tenant uses.

## Event Payload Structure

Payloads are the event schemas from the event reference, and you choose which attributes are included
when you subscribe. Examples: `order.created` has `id`, `status`, `entries`, and so on; `customer.created`
has `customerNumber`, `id`, `contactEmail`, `firstName`, `lastName`; `product.created` has `id`, `code`,
`name`, `productType`, `published`, `media`. Emporix documents no `eventType` field in the body and Svix
sends no event-type header, so the examples fall back to an `?eventType=` query parameter on the endpoint URL.

`index-item.updated` is emitted once per site a product's prices are assigned to, so one product update can
produce several events.

## Full Event Reference

- [Webhook - Events](https://developer.emporix.io/api-documentation/api-guides/webhooks/webhook-events.md)
- [Webhook Service](https://developer.emporix.io/api-documentation/api-guides/webhooks/webhook-service)
- [Webhooks (Management Dashboard)](https://developer.emporix.io/user-guides/management-dashboard/administration/webhooks)
