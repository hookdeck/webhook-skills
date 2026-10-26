# Missive Webhooks Overview

## What Are Missive Webhooks?

Missive is a shared team inbox. Rules in **Settings > Rules** can have a
**Webhook** action: when the rule triggers, Missive sends an HTTP `POST` with a
JSON body to your URL. Typical uses are creating a CRM entry for every incoming
email that meets some conditions, or reacting to label changes.

## Event Types

There is no event-name header. Each payload carries a `rule` object and you
dispatch on `rule.type`.

| `rule.type` | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `label_change` | A shared label changes on a conversation (the type shown in Missive's payload example) | Notify a channel, create a task, sync state to a CRM |

Missive's docs mention other triggers (incoming emails, outgoing emails and so
on) but name only `label_change` as a `type` value, so treat the type as an open
string: handle the ones you configured and log the rest.

## Validation request

When you save a rule, Missive sends a validation request to confirm your
endpoint accepts a `POST`. Make sure the endpoint is live first. Missive's docs
don't describe the validation body, so the examples verify it like any other
request and acknowledge any verified payload that has no `rule.type`.

## Event Payload Structure

```json
{
  "rule": {
    "id": "45408b30-aa3a-45n1-bh67-0a0cb8da9080",
    "description": "Notify elfs",
    "type": "label_change"
  },
  "conversation": {
    "id": "47a57b76-df42-4d8k-927x-80dbe5d87191",
    "subject": "Mordor GPS coordinates",
    "latest_message_subject": "Fwd: Mordor GPS coordinates",
    "organization": { "id": "93e5e5d5-11a2-4c9b-80b8-94f3c08068cf", "name": "Fellowship" },
    "team": { "id": "2f618f9e-d3d4-4a01-b7d5-57124ab366b8", "name": "Hobbits" },
    "assignees": [{ "id": "6b52b6b9-9b51-46ad-a4e3-82ef3c45512c", "name": "Frodo Baggins", "email": "frodo@fellowship.org" }],
    "messages_count": 1,
    "shared_labels": [{ "id": "146ff5c4-d5la-3b63-b994-76711fn790lq", "name": "Elfs" }],
    "shared_label_names": "Elfs",
    "web_url": "https://mail.missiveapp.com/#inbox/conversations/47a57b76-df42-4d8k-927x-80dbe5d87191"
  },
  "latest_message": {
    "id": "86ef8bb8-269c-4959-a4f0-213db4e67844",
    "subject": "Fwd: Mordor GPS coordinates",
    "type": "email",
    "from_field": { "name": "Samwise Gamgee", "address": "sam@fellowship.org" },
    "to_fields": [{ "name": null, "address": "sam@fellowship.org" }]
  }
}
```

(Abbreviated; Missive's example also includes counts, `authors`, timestamps and
more message fields.) Rules triggered by comments carry a comment object instead
of a message.

- For WhatsApp messages, `from_field.id` and `to_fields[].id` are Business-Scoped User IDs, not phone numbers; `username` holds the WhatsApp username or falls back to the phone number.
- Deliveries are retried (up to 5 times over 8 minutes), so deduplicate, for example on `rule.id` plus `conversation.id` plus the message `id`.

## Full Event Reference

See [Missive's webhook documentation](https://learn.missiveapp.com/api-documentation/webhooks).
