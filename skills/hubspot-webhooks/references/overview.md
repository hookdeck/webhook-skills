# HubSpot Webhooks Overview

## What Are HubSpot Webhooks?

HubSpot uses webhooks to notify your application when CRM objects change in a portal. Instead of polling HubSpot's API for changes, HubSpot sends an HTTP POST request to your endpoint whenever a subscribed event occurs — a contact is created, a deal property changes, a ticket is opened, and so on.

Webhooks are configured on a **HubSpot app** (public or private) and subscribe to events for **all portals that have installed the app**. Each delivery batches one or more events into a single request body.

## Common Event Types

HubSpot identifies events by `subscriptionType`. The most common ones:

| Subscription Type | Triggered When | Common Use Cases |
|-------------------|----------------|------------------|
| `contact.creation` | A new contact is created | CRM sync, welcome workflow, lead routing |
| `contact.propertyChange` | A property on a contact changes | Sync to data warehouse, score updates |
| `contact.deletion` | A contact is deleted | Mirror deletion downstream, GDPR cleanup |
| `company.creation` | A new company is created | Account-level provisioning |
| `company.propertyChange` | A property on a company changes | Update CRM mirror |
| `deal.creation` | A new deal is created | Pipeline notifications, forecasting |
| `deal.propertyChange` | A property on a deal changes | Stage automation, revenue ops |
| `ticket.creation` | A new ticket is created | Routing to support tools |

## Event Payload Structure

HubSpot delivers an **array** of events per webhook call. A typical payload looks like:

```json
[
  {
    "eventId": 1,
    "subscriptionId": 12345,
    "portalId": 62515,
    "appId": 54321,
    "occurredAt": 1462216307945,
    "subscriptionType": "contact.creation",
    "attemptNumber": 0,
    "objectId": 123,
    "changeSource": "CRM",
    "changeFlag": "NEW"
  }
]
```

For `*.propertyChange` events the payload also includes `propertyName` and `propertyValue`.

Key headers on every delivery:

| Header | Description |
|--------|-------------|
| `X-HubSpot-Signature-v3` | HMAC-SHA256 signature (base64) over method + URI + body + timestamp |
| `X-HubSpot-Request-Timestamp` | Millisecond Unix timestamp included in the signed content |
| `Content-Type` | Always `application/json` |

## Multiple Events Per Request

Because a single delivery can contain many events, your handler must iterate the JSON array rather than expect a single object. Process each event independently and use `eventId` (unique per portal/app) for idempotency.

## Full Event Reference

For the complete list of subscription types, see [HubSpot Webhooks API](https://developers.hubspot.com/docs/api/webhooks).
