# Copper Webhooks Overview

## What Are Copper Webhooks?

Copper is a CRM built for Google Workspace. Its webhooks give near real-time notification when a
record changes, so you can trigger workflows. You register a **subscription** (a target URL, an
entity `type` and an `event`) through the API. When a matching event happens, Copper sends an
HTTPS `POST` notification to the target.

Webhooks are unsigned. The only authentication is whatever you put in the subscription's
optional `headers` object, which Copper sends as HTTP headers. See
[verification.md](verification.md).

## Common Event Types

Each subscription is for one `type` and one `event`.

| `event` | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| `new` | A record is created | Sync new leads and people to another system |
| `update` | Any field on an existing record changes (excludes new relationships, new activities, metadata changes) | Keep a data warehouse current, react to stage changes |
| `delete` | A record is removed | Remove the record downstream |

| `type` | Record | `new` | `update` | `delete` |
|--------|--------|:-----:|:--------:|:--------:|
| `lead` | Lead | yes | yes | yes |
| `person` | Person | yes | yes | yes |
| `company` | Company | yes | yes | yes |
| `opportunity` | Opportunity | yes | yes | yes |
| `project` | Project | yes | yes | yes |
| `task` | Task | yes | yes | yes |
| `activity_log` | Activity | yes | yes | yes |

The table follows Copper's webhooks overview. Its Create subscription reference lists only `lead`,
`person`, `company`, `opportunity`, `project` and `task` as valid `type` values, so confirm an
`activity_log` subscription is accepted before relying on it.

## Event Payload Structure

```json
{
  "ids": [12345, 12346],
  "type": "person",
  "event": "update",
  "subscription_id": 987,
  "updated_attributes": { "title": ["Engineer", "Senior Engineer"] },
  "key1": "value1",
  "timestamp": "2021-12-13T19:18:22.084Z"
}
```

| Field | Meaning |
|-------|---------|
| `ids` | Array of affected record IDs. 1 to 30 per notification; more records produce several notifications |
| `type` | Entity type (table above) |
| `event` | `new`, `update` or `delete` |
| `subscription_id` | ID of the subscription that fired |
| `updated_attributes` | Changed fields as `[old, new]`; only on `update` events |
| `timestamp` | ISO 8601 timestamp string |
| your `secret` keys | Each key/value pair of the subscription's optional `secret` object, merged into the top level of the body (here `"key1": "value1"`). There is no `secret` wrapper field |

The notification carries IDs, not full records. Fetch the records from the Copper API if you need
their data.

## Delivery Behavior

- Notifications fire **at most once** per event and are **not retried**, whatever status you return.
- Limits: 600 notifications per minute and 1,800 per 10 minutes per account.
- Up to 100 active subscriptions per account.
- Only `https://` targets are accepted.

## Full Event Reference

See [Copper's webhook documentation](https://developer.copper.com/webhooks/overview.html).
