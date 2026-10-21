# Castle Webhooks Overview

## What Are Castle Webhooks?

Castle is a fraud and account-security platform. Webhooks let Castle push an HTTP POST with a JSON body to your application when a configured condition is met, so you can automate actions such as suspending an account or flagging it for review. A webhook fires when:

- A **Policy** matches
- A specific action (`challenge` or `deny`) is returned by policy evaluation
- An item is added to or removed from a **List**

Castle retries failed deliveries (any non-2xx) up to six additional times with exponential backoff.

## Common Event Types

The event name is in the body's `type` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `$policy.matched` | The conditions of a policy matched | Suspend account, queue for review, step-up auth |
| `$list_item.created` | A new item was added to a List (active by default) | Sync a blocklist/allowlist to your own systems |
| `$list_item.archived` | A list item was archived (equivalent to removed) | Remove the entry from your own blocklist |
| `$list_item.unarchived` | A previously archived item is present in the list again | Re-apply the entry |

## Event Payload Structure

Common envelope:

```json
{
  "api_version": "v1",
  "app_id": "526745498142982",
  "created_at": "2024-12-06T21:35:56.260Z",
  "type": "$policy.matched",
  "data": { }
}
```

- `$policy.matched`: `data.policy` (`id`, `revision_id`, `name`, `action`) and `data.event` (the triggering Castle event: `id`, `type`, `status`, `user`, `device`, `ip`, `scores`, ...).
- `$list_item.*`: `data` holds the item (`id`, `primary_value`, `secondary_value`, `auto_archives_at`, `author`, `comment`) and its `list`.

## Full Event Reference

See [Castle's webhook documentation](https://docs.castle.io/docs/webhooks).
