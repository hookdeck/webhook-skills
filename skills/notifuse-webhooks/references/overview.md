# Notifuse Webhooks Overview

## What Are Notifuse Webhooks?

[Notifuse](https://www.notifuse.com) is an open-source (self-hostable) email marketing and transactional email platform. It has two kinds of webhooks:

- **Incoming** webhooks are callbacks from your email provider (Amazon SES, Mailgun, Postmark and so on) to Notifuse, configured automatically with the email integration.
- **Outgoing** webhooks are HTTP POSTs Notifuse sends to *your* server when contacts, lists, segments, emails or custom events change. This skill covers these.

Each outgoing **webhook subscription** has a URL, a set of event types and its own signing secret. Deliveries are signed per [Standard Webhooks](https://www.standardwebhooks.com/).

## Common Event Types

The docs list 23 event types and the list may not be exhaustive.

| Event | Triggered when |
|-------|----------------|
| `contact.created` | A new contact was added to the workspace |
| `contact.updated` | Contact data was modified |
| `contact.deleted` | A contact was permanently deleted |
| `list.subscribed` | Contact subscribed to a list |
| `list.unsubscribed` | Contact unsubscribed from a list |
| `list.confirmed` | Contact confirmed a double opt-in subscription |
| `list.resubscribed` | A previously unsubscribed contact resubscribed |
| `list.bounced` | Email to the contact bounced |
| `list.complained` | Contact marked email as spam |
| `list.pending` | Subscription is awaiting confirmation |
| `list.removed` | Contact was removed from the list |
| `segment.joined` | Contact entered a segment |
| `segment.left` | Contact left a segment |
| `email.sent` | Email was sent to the contact |
| `email.delivered` | Delivery confirmed by the recipient's server |
| `email.opened` | Contact opened the email |
| `email.clicked` | Contact clicked a link in the email |
| `email.bounced` | Email delivery failed |
| `email.complained` | Contact marked the email as spam |
| `email.unsubscribed` | Contact unsubscribed via an email link |
| `custom_event.created` | A custom event was recorded |
| `custom_event.updated` | A custom event was updated |
| `custom_event.deleted` | A custom event was soft-deleted |

## Event Payload Structure

```json
{
  "id": "delivery_abc123",
  "type": "contact.created",
  "timestamp": "2026-10-26T10:30:00Z",
  "workspace_id": "ws_1234567890",
  "data": {}
}
```

| Field | Description |
|-------|-------------|
| `id` | Identifier of the webhook delivery (`delivery_...`) |
| `type` | The event type |
| `timestamp` | ISO 8601 timestamp when the webhook was sent |
| `workspace_id` | The workspace where the event occurred |
| `data` | Event-specific data |

The docs show these `data` shapes:

- **Contact:** `id`, `email`, `external_id`, `first_name`, `last_name`, `tags`, `created_at`, `updated_at`
- **Email:** `message_id`, `email`, `subject`, `broadcast_id`, `template_id`, `created_at`
- **Segment:** `email`, `contact_id`, `segment_id`, `segment_name`, `created_at`

The docs give no `data` example for `list.*` and `custom_event.*`, so the examples only log them generically.

## Delivery Semantics

- JSON `POST` to a public address. Private, loopback, link-local and cloud-metadata addresses are refused, including via redirects. Self-hosted instances can allow private hosts with `WEBHOOK_DELIVERY_ALLOW_PRIVATE_HOSTS=true`.
- Return a `2xx` within **30 seconds**.
- Up to **10 retries over about 34 hours**: immediate, 30 s, 1 m, 2 m, 5 m, 15 m, 30 m, 1 h, 2 h, 6 h, then a final 24 h.
- `429` never counts as a failure. `410 Gone` retires the subscription at once.
- After **20 consecutive failures spanning more than 2 hours** the subscription is disabled. Events that occur while it is disabled are dropped, not replayed on re-enable; read them from the API instead.
- Webhooks may rarely arrive twice. Dedupe on the `webhook-id` header.

## Full Event Reference

See [Notifuse's webhook documentation](https://docs.notifuse.com/features/webhooks).
