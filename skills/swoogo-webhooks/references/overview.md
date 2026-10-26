# Swoogo Webhooks Overview

## What Are Swoogo Webhooks?

Swoogo sends HTTP callbacks when resources are created, updated or deleted. You configure them in
the Swoogo UI or with the API (`POST /webhooks/create`). Webhooks live in a **webhook group**,
which controls which Swoogo events (`event_ids`) they apply to. Requests are not signed. If you
add a custom header (`headers: [{key, value}]`) to the webhook, Swoogo sends it on every
request, and that header is how you authenticate the sender.

## Trigger Objects and Actions

Each webhook has exactly one `trigger_object` and fires on the actions you enable.

| `trigger_object` | Common Use Cases |
|------------------|------------------|
| `event` | Sync event details and capacity |
| `contact` | Sync contacts to a CRM |
| `registrant` | New registrations, status changes, cancellations |
| `speaker` | Sync speaker rosters |
| `sponsor` | Sync sponsor lists |
| `session` | Agenda changes |
| `session_attendance` | Session check-ins |
| `registrant_line_item` | Fees and purchases |

| Action flag | Fires when the object is |
|-------------|--------------------------|
| `trigger_on_insert` | Created |
| `trigger_on_update` | Updated |
| `trigger_on_delete` | Deleted |

Other options: `any_event`, `all_fields` (fire on changes to any field), `api_call`,
`admin_user` and `public_user` (who made the change).

## Payload Formats

`content_type` is `json` (`application/json`) or `post` (form-encoded). The body carries the
fields you selected (`post_field_data`, `use_default_fields`). Swoogo documents no delivered
example and no event-type string, so treat this payload as **illustrative**:

```json
{ "id": 1234, "first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.com" }
```

The same registrant as a form-encoded body: `id=1234&first_name=Ada&last_name=Lovelace&email=ada%40example.com`.

Since the body doesn't name the object or the action, create one webhook per object and put it
in the URL (`?object=registrant`). That is a convention of this skill, not a Swoogo feature.

## Delivery

Failed deliveries are retried; return `2xx` to acknowledge. The retry schedule isn't documented, so
make handlers idempotent.

## Full Reference

- [Webhooks overview](https://developer.swoogo.com/api-reference/overviews/webhooks)
- [Create Webhook](https://developer.swoogo.com/api-reference/webhooks/create-webhook)
