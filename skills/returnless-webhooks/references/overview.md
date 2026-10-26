# Returnless Webhooks Overview

## What Are Returnless Webhooks?

Returnless is a returns management platform for e-commerce. Webhooks let Returnless notify your application when something happens in your Returnless panel, which is useful for asynchronous work such as syncing a new return to your ERP or reacting to a delivered shipment.

Each webhook is configured in the panel with an endpoint URL, the events it should receive, a test-mode switch, and a signing secret. Returnless sends a `POST` request with a JSON body whenever a selected event occurs.

## Request Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Event-Name` | The event that triggered the webhook, e.g. `return.created` |
| `X-Signature` | Lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `request.created` | A return request is submitted | Open a ticket, notify the warehouse |
| `request.approved` | A request is approved | Issue a label, notify the customer |
| `request.approved_with_manual_shipment` | Approved with a manually created shipment | Track the manual shipment |
| `request.approved_without_shipment` | Approved with no shipment | Skip logistics, go to refund |
| `request.rejected` | A request is rejected | Notify support |
| `request.status_changed` | A request changes status | Keep an external status in sync |
| `request.deleted` | A request is deleted | Remove it from downstream systems |
| `return.created` | A return is created | Start receiving and refund flows |
| `return.status_changed` | A return changes status | Status sync |
| `return.notes.added` | A note is added to a return | Surface notes in your helpdesk |
| `return.product.marked_as_received` | A returned product is marked received | Restock, trigger refund |
| `return.product.qty_received_changed` | The received quantity changes | Adjust inventory |
| `return.deleted` | A return is deleted | Cleanup |
| `shipment.created` | A shipment is created | Store tracking number |
| `shipment.status_changed` | A shipment changes status | Tracking updates |
| `shipment.delivered` | A shipment is delivered | Expect the parcel at the warehouse |
| `depreciation.created` | A depreciation is created | Adjust refund amounts |

These are the 17 events in Returnless's supported events list. The event name is **only** in the `X-Event-Name` header.

## Event Payload Structure

The body is a JSON:API resource object. For return events, `data` is a return resource:

```json
{
  "data": {
    "id": "return_12vM04vDdaQQJHxWprprL0IX",
    "resource_type": "string",
    "return_number": "string",
    "state": "string",
    "status": { "color": "string", "label": "string" },
    "created_at": "2019-08-24T14:15:22Z",
    "includes": {
      "customer": { "id": "customer_...", "name": "string", "email": "string" },
      "notes": [],
      "shipments": []
    },
    "links": { "panel": "string", "api": "string" }
  }
}
```

## Delivery and Retries

- Any `2XX` response is a success.
- Otherwise Returnless retries up to 10 times with exponential backoff over 15 hours, then sends a notification email and marks the event failed.
- 24 hours after that email, a webhook with 5 or more failed events is disabled automatically. Re-enable it in the panel, which resets the failed counter.
- The endpoint's TLS certificate is validated.

## Full Event Reference

See [About webhooks](https://support.returnless.com/article/991-about-webhooks) in the Returnless product guide.
