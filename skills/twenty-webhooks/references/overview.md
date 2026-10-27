# Twenty Webhooks Overview

## What Are Twenty Webhooks?

Twenty (twenty.com) is an open-source CRM, available as a cloud service or self-hosted. A Twenty webhook sends an HTTP `POST` with a JSON body to your URL whenever a record is created, updated or deleted. All object types are covered, custom objects included. Every event goes to every webhook; Twenty's docs say event filtering may be added in future releases.

> Set a secret on the Twenty webhook (Settings > Developers > Webhooks). Twenty signs deliveries only when the webhook has a secret.

Twenty signs each delivery (see [verification.md](verification.md)) and sends these headers:

| Header | Meaning |
|--------|---------|
| `X-Twenty-Webhook-Signature` | Hex HMAC-SHA256 signature |
| `X-Twenty-Webhook-Timestamp` | `Date.now()` when the request was sent (Unix milliseconds) |
| `X-Twenty-Webhook-Nonce` | Per-request nonce (sent but **not** signed; don't rely on it for security) |

## Common Event Types

The event name is `<object>.<action>` where the action is `created`, `updated` or `deleted`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `person.created` | A person record is created | Sync new contacts, start onboarding |
| `person.deleted` | A person record is deleted | Remove or archive the contact downstream |
| `company.updated` | A company record is updated | Refresh account data |
| `opportunity.updated` | An opportunity record is updated | Track stage or amount changes |
| `note.created` | A note is created | Attach notes to the related record elsewhere |

Other objects work the same way (`company.created`, `opportunity.deleted`, `task.updated`, your custom objects, ...).

## Event Payload Structure

The body is JSON. Dispatch on `eventName`. Twenty's documentation page shows a different envelope:

```json
{
  "event": "person.created",
  "data": { "id": "abc12345", "firstName": "Alice", "lastName": "Doe", "email": "alice@example.com" },
  "timestamp": "2025-02-10T15:30:50Z"
}
```

and Twenty's sender names the event `eventName`. The examples read `eventName` and fall back to `event`, and read the record from `record` falling back to `data`, so they work with either shape. Check a real delivery in the Hookdeck CLI web UI before relying on other fields, since the envelope can differ between Twenty versions.

## Delivery

- Method: `POST`, JSON body.
- A 2xx response (200-299) acknowledges receipt; non-2xx is logged as a delivery failure.
- The sender's HTTP timeout is 5 seconds, so acknowledge quickly and process asynchronously.
- Retries are not documented. Don't assume exactly-once delivery: make handlers idempotent.

## Full Event Reference

See [Twenty's webhook documentation](https://docs.twenty.com/developers/extend/webhooks).
