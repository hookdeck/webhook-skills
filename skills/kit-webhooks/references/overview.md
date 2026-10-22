# Kit Webhooks Overview

## What Are Kit Webhooks?

Kit (formerly ConvertKit) sends an HTTP `POST` to a URL you register whenever subscribed events
happen in a creator account (a subscriber is created, joins a form, gets a tag, unsubscribes).
You register a **webhook endpoint** with the V4 API (`POST /v4/webhook_endpoints`) or at
[app.kit.com/webhooks](https://app.kit.com/webhooks), choose the events it listens to, and Kit
returns a signing `secret` once.

Webhook endpoints supersede the legacy `/v4/webhooks` resource. Legacy webhooks keep working but
deliver a single event, are **not signed**, and are not retried. Everything in this skill applies to
webhook endpoints.

Deliveries must go to a public HTTP(S) URL (private, internal and loopback addresses are blocked).
Respond with any `2xx` within 10 seconds (5 seconds to connect). Anything else is retried on a
backoff of 30s, 2m, 15m, 1h, 4h, 12h, 24h: 8 attempts over about 41 hours. A `410 Gone` stops
retries immediately; `429`/`503` with `Retry-After` is honoured.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `subscriber.created` | A subscriber is added to the account | Sync to CRM, welcome flows |
| `subscriber.activated` | A subscriber transitions into the `active` state | Start onboarding |
| `subscriber.unsubscribed` | A subscriber unsubscribes | Suppress downstream messaging |
| `subscriber.bounced` | An address hard-bounces | Clean up contact records |
| `subscriber.complained` | A subscriber reports an email as spam | Suppress and investigate |
| `subscriber.subscribed_to_form` | A subscriber joins a form (payload includes `form`) | Attribute signup source |
| `subscriber.added_to_sequence` | A subscriber starts a sequence (includes `sequence`) | Track funnel entry |
| `subscriber.sequence_completed` | A subscriber finishes a sequence's last email | Trigger follow-up offers |
| `subscriber.tag_added` | A tag is added to a subscriber (includes `tag`) | Segment, grant access |
| `subscriber.tag_removed` | A tag is removed from a subscriber (includes `tag`) | Revoke access |
| `subscriber.custom_field_value_updated` | A custom field value changes (one event per field; includes `custom_field`) | Mirror profile data |
| `tag.created`, `tag.deleted` | A tag is created or deleted on the account | Mirror tags (deleting a tag emits only `tag.deleted`, not `subscriber.tag_removed` per subscriber) |
| `custom_field.created`, `custom_field.deleted` | A custom field is created or deleted | Schema sync |
| `sequence.created`, `sequence.deleted`, `sequence.published`, `sequence.disabled` | A sequence changes | Audit |
| `broadcast.created`, `broadcast.sent`, `broadcast.deleted` | A broadcast is created, finishes sending, or is deleted | Reporting |
| `post.published` | A post is published | Cross-post, notify |

`subscriber.product_purchased`, `subscriber.link_clicked`, `subscriber.email_opened`,
`landing_page.created` and `landing_page.deleted` are listed as **Planned**: the API rejects them
with `422` until they ship.

## Event Payload Structure

Every delivery is an envelope. `events` always holds 1 to 100 events, all of the same `type`:

```json
{
  "delivery_id": 123456,
  "events": [
    {
      "id": "9c2e1f3a-6b7d-4e8f-a1b2-c3d4e5f60718",
      "type": "subscriber.created",
      "created": "2026-07-29T14:32:10Z",
      "data": {
        "subscriber": {
          "id": 987654,
          "first_name": "Ada",
          "email_address": "ada@example.com",
          "state": "active",
          "created_at": "2026-07-29T14:32:10Z",
          "fields": {}
        }
      }
    }
  ]
}
```

- `delivery_id` identifies the POST; a retry reuses it (also sent as the `X-Kit-Delivery` header).
- `id` is a UUID that stays the same across re-sends: use it as the idempotency key, not `delivery_id`.
- `created` is when the event occurred, not when it was delivered.
- Headers: `Content-Type: application/json`, `X-Kit-Delivery`, `X-Kit-Signature`, `User-Agent: Kit-Webhooks/2.0`.

## Full Event Reference

See Kit's [webhooks overview](https://developers.kit.com/webhooks/overview) and [event types](https://developers.kit.com/webhooks/event-types).
