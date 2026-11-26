# Close Webhooks Overview

## What Close Sends

Close is a sales CRM. A webhook subscription fires "when an event matches a set of object types and actions", for example leads, contacts, opportunities, tasks and activities being created, updated or deleted. See Close's [event log documentation](https://developer.close.com/topics/webhooks/) for the object types and actions you can subscribe to.

## Payload

Each POST body has two top-level fields:

| Field | Meaning |
|---|---|
| `subscription_id` | The subscription that matched |
| `event` | The event |

The `event` object:

| Field | Meaning |
|---|---|
| `id` | Event ID. Use it to skip duplicates |
| `object_type`, `action` | What happened, e.g. `opportunity` / `updated` |
| `object_id` | The object the event is about |
| `lead_id`, `organization_id`, `user_id` | Related lead, organization and acting user |
| `changed_fields` | Fields changed by an update |
| `data` | The object's fields |
| `previous_data` | Prior values of the changed fields |
| `date_created`, `date_updated`, `meta`, `request_id` | Event metadata |

## Delivery

- **Method:** `POST`, JSON body.
- **Headers:** `close-sig-hash` and `close-sig-timestamp`. See [verification.md](verification.md).
- **Response:** "Your endpoint must respond with a 2xx status code within 15 seconds." Establishing the connection must take no longer than 5 seconds.
- **Retries:** failed deliveries are retried with exponential backoff, up to every 20 minutes, for up to 72 hours before being dropped.
- **Timestamp window:** none documented.

## Idempotency

Retries can deliver the same event more than once. Store `event.id` and ignore repeats.
