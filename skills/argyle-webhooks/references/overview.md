# Argyle Webhooks Overview

## What Are Argyle Webhooks?

Argyle is a payroll and income verification API. You create a webhook subscription (Console or
`POST /v2/webhooks`) and Argyle sends an HTTP request to your `url` when verification, account or
data-resource changes happen (paystubs, gigs, shifts, payroll documents, user uploads and more), for
every user of the API key. When the subscription has a `secret`, each delivery includes
`X-Argyle-Signature`.

## Common Event Types

The top-level `event` field names the subscribed event as `<resource>.<action>`. Argyle documents 46
event types; the examples handle these 14 and log everything else.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `accounts.added` | A new account is added | Track a user's linked payroll accounts |
| `accounts.connected` | An account connects | Start fetching data |
| `accounts.failed` | An account connection fails | Prompt the user to retry |
| `accounts.removed` | An account is removed | Clean up stored data |
| `accounts.updated` | An account changes | Refresh connection state |
| `gigs.added`, `gigs.updated`, `gigs.removed` | Gig data changes | Sync gig records |
| `gigs.partially_synced`, `gigs.fully_synced` | Gig sync progresses or completes | Know when data is ready |
| `identities.added`, `identities.updated` | Identity data changes | Refresh identity records |
| `items.updated`, `items.removed` | A supported employer or platform changes | Refresh your item list |

## Event Payload Structure

```json
{
  "event": "accounts.connected",
  "name": "name-for-the-webhook-subscription",
  "data": {
    "account": "0187c66e-e7e5-811c-b006-2232f00f426a",
    "user": "018051aa-f7a9-a0db-2f38-6cfa325e9d69"
  }
}
```

- `event`: the subscribed event name. No header names the type.
- `name`: the subscription's own name.
- `data`: the ids of the affected objects (the resource itself is included as `data.resource` when the
  subscription config sets `include_resource`).

## Delivery

- Answer `200` within 10 seconds.
- Without that, Argyle retries once after 30 seconds, and only for 429, 500, 502, 503 or 504.
- Deliveries can repeat: make handlers idempotent.
- Argyle doesn't log bodies; the subscription's `last_sent_at` shows the last attempt.
- The docs don't name the HTTP method, so the examples accept GET, POST, PUT, PATCH and DELETE.

## Full Event Reference

For the complete list of events, see [Argyle's webhook documentation](https://docs.argyle.com/api-guide/webhooks).
