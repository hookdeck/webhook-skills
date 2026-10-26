# Planning Center Webhooks Overview

## What Are Planning Center Webhooks?

Planning Center (church management: People, Services, Giving, Check-Ins, Groups, Calendar and more) sends a real-time `POST` to your URL when something changes, as an alternative to polling the API. Subscriptions are created per user at https://api.planningcenteronline.com/webhooks and only return data that user has permission to see.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `people.v2.events.person.updated` | A Person record is updated | Sync contacts to a CRM or mailing list |

This is the only event name published on the public docs (in the Authenticity worked example). Event names follow `<app>.<api version>.events.<resource>.<action>`. The full list of subscribable events is shown in the Webhooks UI after login and via the authenticated `available_events` endpoint; copy names from there instead of guessing.

## Event Payload Structure

The body is a JSON:API document. `data` is an **array** of `EventDelivery` objects:

```json
{
  "data": [
    {
      "id": "cac783dc-75e7-4c5b-88e8-502d9d8682ae",
      "type": "EventDelivery",
      "attributes": {
        "name": "people.v2.events.person.updated",
        "attempt": 1,
        "payload": "{\"data\":{\"type\":\"Person\",\"id\":\"125587227\",\"attributes\":{...}}}"
      },
      "relationships": { "organization": { "data": { "type": "Organization", "id": "127" } } }
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique delivery ID; use it for idempotency and logging |
| `attributes.name` | Event name |
| `attributes.attempt` | Delivery attempt number (1 on the first try) |
| `attributes.payload` | **A JSON string**: parse it again to get the changed resource (`data`, `included`, `meta`) |
| `relationships.organization` | The Planning Center organization |

## Delivery Behavior

- `POST` only. Respond `200` to acknowledge.
- Any other status is retried up to 16 times: 30 s, 1, 2, 4, 8, 16, 32, 64 min, 2.1, 4.2, 8.5, 17 h, then once per day for up to 4 days.
- `410` deactivates the subscription. `429`/`503` with `Retry-After` (capped at 1 hour) is honored.
- Many failures in 24 hours also deactivate the subscription.
- No rate limits on webhooks. Requests and responses can be inspected, and redelivered, in the Webhooks UI.

## Full Event Reference

See [Planning Center's webhook documentation](https://api.planningcenteronline.com/docs/overview/webhooks).
