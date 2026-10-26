# Treet Webhooks Overview

## What Are Treet Webhooks?

Treet (treet.co) provides branded resale and trade-in marketplaces. Treet webhooks notify your system when something happens in a Treet shop. They aren't self-serve: you email the Treet team at support@treet.co with the topic, trigger and URL you want, and Treet sets them up. Treet documents one topic today, **Shipping Label**.

Nothing is documented about retries, timeouts or the expected response. Return a `2xx` once you have handled the request, and make handlers idempotent.

## Common Event Types

Dispatch on the body's top-level `trigger` field. The top-level `topic` is the coarser topic (`label`) and is the same for both triggers.

| `trigger` | Triggered When | Common Use Cases |
|-----------|----------------|------------------|
| `label/created` | A shipping label is created for a bundle | Store carrier and tracking number, notify the customer |
| `label/updated` | A shipping label changes (for example `status` becomes `SHIPPED`) | Update shipment status, trigger inventory or refund steps |

Triggers contain a `/`, so use a safe form (such as `label.updated`) if you turn one into a file name.

## Event Payload Structure

Shipping label payload, as shown in Treet's docs:

```json
{
  "topic": "label",
  "trigger": "label/updated",
  "shopId": "boyish",
  "bundleId": "12345678-1234-1234-1234-123456789105",
  "bundleType": "TRADE_IN",
  "carrier": "USPS",
  "trackingNumber": "28735625627856237856287",
  "status": "SHIPPED",
  "updatedAt": "2024-01-01T12:00:00+00:00",
  "items": [
    {
      "id": "11345678-1234-1234-1234-123456789101",
      "variantId": "01345678-1234-1234-1234-123456789101",
      "sku": "large-pink-shirt",
      "stockImageUrl": "https://ucarecdn.com/405d9723-c637-4f50-bd11-a10aaf9ff4ce/",
      "variantOptions": { "size": "L", "color": "pink" },
      "category": "shirts",
      "title": "Large Pink Shirt"
    }
  ]
}
```

Treat every field as untrusted until you have checked its type, even after the signature passes.

## Full Event Reference

For the complete list of events and payload fields, see [Treet's webhook documentation](https://apidocs.treet.co/webhooks/introduction).
