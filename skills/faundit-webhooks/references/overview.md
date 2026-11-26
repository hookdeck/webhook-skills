# Faundit Webhooks Overview

## What Are Faundit Webhooks?

[Faundit](https://faundit.com) is a lost-and-found / returns platform. Faundit webhooks
notify your application in real time when a found item or a lost-item request changes
status — for example, when an item is scheduled for pickup, is in route, is delivered, or
when a request is registered or resolved. This lets you keep your own systems in sync
without polling the Faundit API.

Faundit signs every webhook with **HMAC-SHA256** so you can verify the request genuinely
came from Faundit and was not tampered with in transit.

## Common Event Types

Faundit sends only **two** event types. The `event-type` field names the event; the
granular status lives in the `data.status` field — the individual statuses (delivered,
finished, expired, …) are **not** separate events.

| `event-type` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `item-status` | A found/lost item's status changes | Update order/return tracking, notify the owner, trigger fulfillment |
| `request-status` | A lost-item request's status changes | Update the customer on their lost-item claim, close resolved tickets |

### `item-status` — `data.status` values

| Status | Meaning |
|--------|---------|
| `contact-missing` | No contact details available for the owner |
| `waiting-response` | Awaiting a response from the owner |
| `wrong-owner` | The contacted owner says the item isn't theirs |
| `pickup-by-guest` | The guest/owner will pick the item up |
| `left-behind` | The owner doesn't want the item back |
| `finished` | Handling complete |
| `shipment-paid` | Shipment has been paid for |
| `pickup-scheduled` | A pickup has been scheduled |
| `in-route` | Item is in transit |
| `delivered` | Item delivered to the owner |
| `deleted` | Item record deleted |
| `expired` | Item handling expired |
| `anonymized` | Personal data anonymized (retention/GDPR) |

### `request-status` — `data.status` values

| Status | Meaning |
|--------|---------|
| `registered` | A lost-item request was registered |
| `awaiting-guest-response` | The location asked the guest for more details (listed on Faundit's Request status page only) |
| `not-found` | The location marked the request as not found |
| `resolved` | Request resolved (item matched/returned) |
| `deleted` | Request record deleted |
| `expired` | Request unresolved for more than 18 days |
| `anonymized` | Personal data anonymized (retention/GDPR) |

## Event Payload Structure

Both event types share the same envelope:

```json
{
  "event-type": "item-status",
  "data": {
    "id": 133378,
    "timestamp": "2022-08-01T08:48:09.621Z",
    "status": "shipment-paid",
    "locationID": "locationID"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event-type` | string | `item-status` or `request-status` |
| `data.id` | integer | ID of the item or request |
| `data.timestamp` | string (ISO 8601) | When the status change occurred |
| `data.status` | string | The granular status (see tables above) |
| `data.locationID` | string | The location the item/request belongs to |

### API v2 naming note

In API v2, **Members** were renamed to **Locations**, and `faundit_memberID` became
`locationID`. Legacy identifiers are still accepted, but new integrations should read
`locationID`.

## Full Event Reference

For the complete, authoritative list of events and statuses, see
[Faundit's webhook documentation](https://faundit.gitbook.io/faundit-api-v2/webhooks).
