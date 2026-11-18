# Trendyol Webhooks Overview

## What Are Trendyol Webhooks?

Trendyol Marketplace sellers can subscribe to webhooks for order packages instead of polling
`getShipmentPackages`. When a package reaches a subscribed status, Trendyol sends an HTTP `POST`
with a JSON body to the URL you registered. One webhook covers all statuses.

Webhooks are not signed. The request carries the webhook's `apiKey` as plain text in the
`x-api-key` header (when created with `authenticationType` `API_KEY`). See
[verification.md](verification.md).

Trendyol recommends still polling `getShipmentPackages` periodically to reconcile data, because
sending data by webhook isn't always possible.

## Package Statuses

| Status | Meaning |
|--------|---------|
| `CREATED` | Package is ready to ship |
| `PICKING` | Seller reports it has started picking or preparing the package |
| `INVOICED` | Seller reports the invoice is issued |
| `SHIPPED` | Package is in transit with the carrier |
| `DELIVERED` | Package reached the customer (final) |
| `UNDELIVERED` | Package couldn't be delivered to the customer |
| `CANCELLED` | Package cancelled, including unsupplied ones |
| `RETURNED` | Undelivered package is back with the seller (final) |
| `UNSUPPLIED` | Seller cancelled items it can't supply |
| `AWAITING` | Order awaits payment approval; use for stock updates only |
| `UNPACKED` | Package was split |
| `AT_COLLECTION_POINT` | Package waits at a pickup point for the customer |
| `VERIFIED` | Order awaits payment approval, documented with `AWAITING` |

The docs list these in upper case, but the example payload has `"status": "Delivered"` and
`"shipmentPackageStatus": "Delivered"`. The body reuses the getShipmentPackages model, whose docs
write the statuses as `Created`, `UnDelivered`, `AtCollectionPoint`, `UnPacked` and so on. Remove
underscores and upper-case before comparing; upper-casing alone turns `AtCollectionPoint` into
`ATCOLLECTIONPOINT`, which never matches `AT_COLLECTION_POINT`.

## Event Payload Structure

Whatever the status, Trendyol sends the full order package. The body is a page of packages:

```json
{
  "totalElements": 1,
  "totalPages": 1,
  "page": 0,
  "size": 1,
  "content": [
    {
      "orderNumber": "10654411111",
      "shipmentPackageId": 3330111111,
      "status": "Delivered",
      "shipmentPackageStatus": "Delivered",
      "cargoTrackingNumber": 7280027504111111,
      "cargoProviderName": "Trendyol Express",
      "lines": [{ "lineId": 4765111111, "quantity": 1, "barcode": "8683772071724" }],
      "shipmentAddress": { "city": "İstanbul", "countryCode": "TR" },
      "packageHistories": [{ "createdDate": 1762242537624, "status": "Created" }],
      "createdBy": "order-creation"
    }
  ]
}
```

Key fields: `orderNumber`, `shipmentPackageId`, `status`, `lines[]` (items, barcode, cancel reason),
`shipmentAddress` and `invoiceAddress`, cargo tracking fields, `invoiceStatus`/`invoiceLink`,
`packageHistories[]`. `createdBy` is `order-creation`, `cancel`, `split` or `transfer`.

Loop over `content[]` and dispatch on each package's `status`.

## Delivery and Retries

- Requests are `POST` with a JSON body.
- Delivery is at least once: the same package can arrive more than once, and Trendyol says endpoints
  must be idempotent.
- A failed request is re-sent every 5 minutes until it succeeds (Trendyol says this may change).
- After repeated failures Trendyol emails you and deactivates the webhook; reactivate it after
  fixing the endpoint.
- A seller can have at most 15 webhooks (inactive ones count).
- The endpoint URL must not contain "Trendyol", "Dolap" or "Localhost".

## Full Reference

See [Trendyol's webhook documentation](https://developers.trendyol.com/docs/webhook-model) (in Turkish).
