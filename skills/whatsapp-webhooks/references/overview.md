# WhatsApp Webhooks Overview

## What Are WhatsApp Webhooks?

The **WhatsApp Business Platform** (Cloud API) delivers real-time events through
Meta's Graph API webhooks. When a user messages your business number, or when the
status of a message you sent changes, Meta sends an HTTP `POST` to the callback URL
you registered for your app.

WhatsApp webhooks are **Meta webhooks**, so they behave differently from most SaaS
providers:

- A one-time **GET verification handshake** proves you own the endpoint.
- Every event `POST` is signed with `X-Hub-Signature-256` (HMAC-SHA256, keyed on
  your **app secret**).
- They do **not** follow the [Standard Webhooks](https://www.standardwebhooks.com/) spec.
- Events are **subscription fields** (e.g. `messages`), not dotted event names.

## Payload Envelope

Every payload is wrapped under the `whatsapp_business_account` object:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102290129340398",
      "changes": [
        {
          "field": "messages",
          "value": { "...": "..." }
        }
      ]
    }
  ]
}
```

- `object` — always `whatsapp_business_account` for WhatsApp.
- `entry[]` — one per WhatsApp Business Account (WABA). A single POST may **batch up
  to 1000 entries**, and payloads can be up to **3 MB**.
- `changes[].field` — the **subscription field** that fired (e.g. `messages`).
- `changes[].value` — the field-specific payload.

## Subscription Fields (the `field` property)

WhatsApp events are identified by the `field` value, **not** a dotted event type.
The primary one is `messages`, which carries both inbound messages and outbound
status updates.

| `field` | Description |
|---------|-------------|
| `messages` | Inbound user messages (`value.messages[]`) and outbound status updates (`value.statuses[]`) |
| `message_template_status_update` | A message template was approved, rejected, paused, or disabled |
| `message_template_quality_update` | Template quality rating changed |
| `template_category_update` | Template category was reclassified |
| `account_update` | Business account changes, bans, or verification status |
| `account_review_update` | Result of an account review |
| `phone_number_name_update` | Display-name approval result |
| `phone_number_quality_update` | Phone number quality rating or messaging limit changed |
| `business_capability_update` | Messaging limits / capability changes |

## The `messages` Field

The `messages` field is where almost all traffic lands. Its `value` object may
contain **either or both** of:

### Inbound messages — `value.messages[]`

Sent by users to your business number. The `type` field determines the shape:

| `type` | Payload key | Notes |
|--------|-------------|-------|
| `text` | `text.body` | Plain text |
| `image` / `audio` / `video` / `document` / `sticker` | `image` / `audio` / … | Media with an `id` to download |
| `location` | `location` | Latitude / longitude |
| `contacts` | `contacts` | Shared contact cards |
| `interactive` | `interactive` | Replies to list / button messages |
| `button` | `button` | Quick-reply button taps (template) |
| `reaction` | `reaction` | Emoji reaction to a prior message |
| `order` | `order` | Cart / catalog order |
| `system` | `system` | User changed number, etc. |

### Outbound status updates — `value.statuses[]`

Delivery receipts for messages **you** sent. The `status` field is one of:

| `status` | Meaning |
|----------|---------|
| `sent` | Accepted by WhatsApp servers |
| `delivered` | Delivered to the recipient's device |
| `read` | Read by the recipient |
| `failed` | Delivery failed (see `errors[]`) |

## Deduplication & Retries

- **Retries** — Failed deliveries are retried with **decreasing frequency for up to
  7 days**. Retries are sent to **every subscribed app**, so the same event can
  arrive more than once.
- **Dedupe by id** — Use the WhatsApp message id (`messages[].id` / `statuses[].id`,
  a `wamid...` value) as an idempotency key so reprocessing is harmless.

## Full Event Reference

- [Webhooks overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)
- [Messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages)
