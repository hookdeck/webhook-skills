# Skovik Webhooks Overview

## What Are Skovik Webhooks?

[Skovik](https://skovik.com) is an operations platform whose [API](https://developer.skovik.com) exposes
resources such as users, branches and export orders. Webhooks notify your systems when one of them
changes, so you don't have to poll. You register an HTTPS endpoint in the settings UI, and Skovik sends a
JSON `POST` for each subscribed event, signed with
[Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) headers (`webhook-id`,
`webhook-timestamp`, `webhook-signature`).

Deliveries are thin, JSON:API-style notifications. They link to the related resource instead of embedding
it. Treat a webhook as a signal, then call the API to fetch the current state.

Requests carry `Content-Type: application/json` and `User-Agent: Skovik-Webhook (+https://developer.skovik.com)`.

## Common Event Types

Ten events are documented, and the list may not be exhaustive. The name is the top-level `type` field. The
examples handle all of these:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `users.created` | A user is created | Provision the user in your system |
| `users.updated` | Some part of the user object changed | Re-fetch the user and sync |
| `users.archived` | A user is archived | Deprovision the user |
| `export_orders.created` | An export order is created | Track export requests |
| `export_orders.completed` | An export order completed successfully | Fetch the order to get the export file URL |
| `export_orders.failed` | An export order failed | Fetch the order and read `error_message` |
| `branches.created` | A branch is created | Sync branches |
| `branches.updated` | A branch changed | Re-fetch the branch and sync |
| `branches.archived` | A branch is archived | Remove or flag the branch |
| `misc.ping` | A test is triggered from the settings UI | Check that the endpoint verifies and answers `2xx` |

## Event Payload Structure

```json
{
  "id": "60c7d63a8f4c4b9e9c2e1a2b",
  "type": "export_orders.completed",
  "timestamp": "2026-05-25T14:30:45Z",
  "data": {
    "id": "8b1d4f122c0e4b1a9f9d3d0e",
    "type": "webhook_events",
    "attributes": {
      "created_at": "2026-05-25T14:30:45Z",
      "name": "export_orders.completed"
    },
    "links": { "self": "/v1/webhook_events/8b1d4f122c0e4b1a9f9d3d0e" },
    "relationships": {
      "related_object": {
        "data": { "type": "export_orders", "id": "f3a9c7e15b344a8cb6f122b0" },
        "links": { "related": "/v1/export_orders/f3a9c7e15b344a8cb6f122b0" }
      }
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `id` | Delivery id, equal to the `webhook-id` header |
| `type` | The event name. `data.attributes.name` repeats it, and `data.type` is always `webhook_events` |
| `timestamp` | When this delivery attempt was signed and dispatched |
| `data.id` | The event id. Use it as the deduplication key; it is the same across endpoints |
| `data.relationships.related_object` | The related resource (`type`, `id`) and a `links.related` URL to fetch it. Omitted for events with no related resource, such as `misc.ping` |

`GET /v1/webhook_events/{id}` (scope: read `webhook_events`) returns an event as Skovik sent it.

## Full Event Reference

See [Receiving webhooks](https://developer.skovik.com/docs/api-webhooks-receiving) and the per-event
pages in Skovik's API reference:
[users](https://developer.skovik.com/reference/webhookuser),
[export orders](https://developer.skovik.com/reference/webhookexportorder),
[branches](https://developer.skovik.com/reference/webhookbranch) and
[misc.ping](https://developer.skovik.com/reference/webhookmiscping).
