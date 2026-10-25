# Mailtrap Webhooks Overview

## What Are Mailtrap Webhooks?

Mailtrap (Email API/SMTP) pushes near-real-time notifications about email
deliverability events, and about account activity (Audit Log, Enterprise only),
to an HTTPS endpoint you configure. Requests are `POST`, batched (up to 500
events, flushed every 30 seconds), signed with the `Mailtrap-Signature` header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `delivery` | Email successfully delivered | Confirm delivery, update message status |
| `bounce` | Permanent delivery failure | Suppress the address |
| `soft bounce` | Temporary failure (will retry) | Count repeated failures |
| `spam` | Recipient reported spam | Suppress immediately |
| `unsubscribe` | Recipient unsubscribed | Update consent |
| `open` | Email opened | Engagement analytics |
| `click` | Link clicked | Link analytics |
| `suspension` | Message suspended | Alert on sending limits |
| `reject` | Message rejected (e.g. recipient in suppression list) | Alert, clean lists |

`soft bounce` has a space. Audit Log events (Enterprise only) are `activity_log.*`
(for example `activity_log.user.login`, `activity_log.user.updated`).

## Event Payload Structure

Sending events (all in the `event` field; JSON wraps them as `{"events": [...]}`,
JSON Lines sends one object per line):

| Field | Notes |
|-------|-------|
| `event` | Event type, required |
| `message_id` | Unique message ID |
| `event_id` | Unique event ID, use for idempotency |
| `email` | Recipient address |
| `sending_stream` | `transactional` or `bulk` |
| `sending_domain_name` | Sending domain |
| `timestamp` | Unix epoch seconds |
| `category`, `custom_variables` | Optional, from the original send |
| `reason` | `suspension`, `reject` |
| `response`, `response_code`, `bounce_category` | `bounce`, `soft bounce` |
| `ip`, `user_agent` | `open`, `click`, `unsubscribe` |
| `url` | `click` |

Audit Log events: `event`, `description`, `actor` (`id`, `type` = `user` or
`api_token`, `name`), optional `resource` and `changes`, `timestamp`.

## Full Event Reference

[Mailtrap webhooks documentation](https://docs.mailtrap.io/email-api-smtp/advanced/webhooks)
