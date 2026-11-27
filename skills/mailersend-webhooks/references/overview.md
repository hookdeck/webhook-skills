# MailerSend Webhooks Overview

## What Are MailerSend Webhooks?

MailerSend is the transactional email and SMS API from the MailerLite group.
When something happens to a message you sent — it was delivered, bounced,
opened, clicked, or reported as spam — MailerSend POSTs a JSON event to a URL
you register per sending domain.

This is **not** MailerLite (the marketing-email product, separate API and
separate webhook scheme), and not Mailgun, Mailchimp or Resend.

Every request carries a `Signature` header: the lowercase hex HMAC-SHA256 of the
raw request body, keyed with the Signing Secret MailerSend generated for that
webhook. See [verification.md](verification.md).

## Two Webhook Surfaces, One Security Model

| | **Email / account webhooks** | **SMS webhooks** | **WhatsApp webhooks** |
|---|---|---|---|
| Configured at | Domains → View domain → Webhooks, or the API | SMS → Webhooks, or the API | WhatsApp → Phone numbers → sender → Webhooks (dashboard only) |
| Docs | [Account webhooks](https://developers.mailersend.com/api/v1/account/webhooks) | [SMS webhooks](https://developers.mailersend.com/api/v1/sms/webhooks) | [WhatsApp webhooks](https://developers.mailersend.com/api/v1/whatsapp/webhooks) |
| Header | `Signature` | `Signature` | `Signature` |
| Algorithm | HMAC-SHA256 hex over the raw body | HMAC-SHA256 hex over the raw body | HMAC-SHA256 hex over the raw body |
| Secret | per-webhook Signing Secret | per-webhook Signing Secret | per-webhook Signing Secret |
| Test ping | `webhook.test`, fixed public secret | `webhook.test`, fixed public secret | none documented |
| Events | the 27 below | `sms.sent`, `sms.delivered`, `sms.failed` | `whatsapp.sent`, `.delivered`, `.read`, `.failed`, `.inbound` |

The security model is identical, so **one verifier handles all three**. The examples
in this skill target the email/activity events.

**Out of scope:** MailerSend *Inbound Routing* forwards parsed inbound email to
a URL and its route object carries its own `secret` field. That is a distinct
surface, configured separately, and its signing construction is not documented
on the webhooks page — do not assume the scheme below applies to it.

## Event Types

### Activity events (message lifecycle)

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `activity.sent` | MailerSend dispatched the email from its servers | Mark queued → sent, start a delivery SLA timer |
| `activity.delivered` | The receiving mail server accepted the email | Confirm delivery, close the SLA timer |
| `activity.soft_bounced` | Temporary failure (mailbox full, greylisting, transient DNS) | Count consecutive soft bounces, retry later |
| `activity.hard_bounced` | Permanent failure (invalid address, domain doesn't exist) | Suppress the address immediately, flag the record |
| `activity.deferred` | Delivery temporarily delayed (**paid plans only**) | Surface delivery lag in ops dashboards |
| `activity.opened` | Recipient opened the email — fires on **every** open | Engagement scoring, open counts |
| `activity.opened_unique` | Recipient opened the email for the **first** time | Unique-open rate without deduping yourself |
| `activity.clicked` | Recipient clicked a tracked link — **every** click | Click counts, link-level analytics |
| `activity.clicked_unique` | Recipient clicked for the **first** time | Unique-click rate |
| `activity.unsubscribed` | Recipient used the unsubscribe link | Update consent, stop sending |
| `activity.spam_complaint` | Recipient marked the email as spam/junk | Suppress immediately — this is a reputation event |
| `activity.survey_opened` | A survey email was opened for the first time | Survey funnel analytics |
| `activity.survey_submitted` | Survey submitted, or closed after a 30-minute idle timeout | Store survey responses |

### Account and platform events

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `sender_identity.verified` | A sender identity completed verification | Unblock sending in your app's onboarding |
| `maintenance.start` | Scheduled MailerSend maintenance began | Pause non-urgent sends, post a status banner |
| `maintenance.end` | Scheduled maintenance ended | Resume sends |
| `inbound_forward.failed` | Forwarding an inbound message to your URL failed | Alert on inbound pipeline breakage |
| `inbound_message.rejected` | An inbound message was rejected | Notify the sender; see rejection reasons below |
| `email_single.verified` | A single-address verification finished | Gate signup on a verified address |
| `email_list.verified` | A list verification job finished | Import the cleaned list |
| `bulk_email.completed` | A bulk send finished processing | Report per-batch results |
| `recipient.on_hold_added` | A recipient was placed on the on-hold list | Stop sending, surface the reason to support |
| `recipient.on_hold_removed` | A recipient was taken off the on-hold list | Resume sending |

`inbound_message.rejected` documents two rejection reasons:
`unsupported_attachment_type` and `attachment_size_exceeded`.

### SMS events

| Event | Triggered when |
|-------|----------------|
| `sms.sent` | The SMS was dispatched |
| `sms.delivered` | The carrier confirmed delivery |
| `sms.failed` | The SMS could not be delivered |

### The URL validation ping

| Event | Triggered when |
|-------|----------------|
| `webhook.test` | You create or update a webhook — MailerSend validates the URL |

## Event Payload Structure

Real events use a three-field envelope:

```json
{
  "type": "activity.delivered",
  "created_at": "2025-08-05T21:23:54.000000Z",
  "data": { }
}
```

For `activity.*` events, `data` holds:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | The activity id — **use this as your idempotency key** |
| `domain_id` | string | The sending domain |
| `message_id` | string | Groups all activities for one message |
| `email_id` | string | The individual email |
| `type` | string | The **bare** activity name (`sent`, `delivered`, `hard_bounced`) — no `activity.` prefix |
| `subject` | string | Subject line |
| `email` | string | Recipient address |
| `tags` | array | Tags you attached at send time |
| `meta` | array \| object | **`[]` when empty**, an object otherwise |

Full example:

```json
{
  "type": "activity.sent",
  "created_at": "2025-08-05T21:23:54.000000Z",
  "data": {
    "id": "6892766a5b66e2daf3dc9155",
    "domain_id": "yv69oxl5kl785kw2",
    "message_id": "6892766ae78995a317577aa1",
    "email_id": "6892766a8d52ba62543d5e71",
    "type": "sent",
    "subject": "Test email",
    "recipient": "test@mailersend.com",
    "tags": ["test", "test2"],
    "meta": []
  }
}
```

### The ping is shaped differently

```json
{
  "type": "webhook.test",
  "message": "This is a ping test message",
  "created_at": "2026-03-27T07:24:20.577080Z"
}
```

It has `message`, **not** `data`. Any code doing `payload.data.id` before
checking `type` will throw on the ping — and because MailerSend requires a 2xx
from the ping to save the webhook, that throw stops the webhook from existing at
all.

### `created_at` has two formats

| Format | Example | Used by |
|--------|---------|---------|
| Microsecond ISO-8601, `Z` suffix | `2025-08-05T21:23:54.000000Z` | activity, `inbound_message.rejected`, on-hold, reputation and `email_list.created` events, `webhook.test` |
| Space-separated, no timezone | `2025-08-05 22:27:14` | `sender_identity.verified`, `maintenance.*`, `inbound_forward.failed`, `email_single.verified`, `email_list.verified`, `bulk_email.completed` |

Parse defensively. In JavaScript, `new Date("2025-08-05 22:27:14")` is
implementation-defined and is interpreted as **local time** where it works at
all; normalise the space to `T` and append `Z` first. In Python,
`datetime.fromisoformat` accepts both on 3.11+, but only the first on 3.9/3.10.

### `meta` is an array when empty

```json
"meta": []            // nothing to report
"meta": { "...": "" } // event-specific detail
```

This breaks strongly typed deserialisation (C# `Dictionary`, Go `map[string]any`,
Pydantic `dict`). Normalise before use:

```javascript
const meta = Array.isArray(data.meta) ? {} : (data.meta || {});
```

## Delivery Semantics

- Respond **within 3 seconds** or the attempt is recorded as failed.
- Only **2xx** counts as success.
- Failures retry with exponential backoff for **about 3 days**; after that the
  webhook is **automatically paused** and must be re-enabled in the dashboard.
- **4xx other than 429, and DNS resolution failures, are treated as
  unrecoverable and are never retried.** A 401 from a signature rejection gets
  exactly one attempt.
- MailerSend explicitly recommends acknowledging with 2xx immediately and moving
  processing to an async background job.
- There is **no delivery-id header**, **no timestamp**, and **no nonce**. Dedupe
  on `type` plus `data.id`; `data.id` alone is shared by the unique and
  non-unique open and click events, and some events have no `data.id`.
- There is **no documented source-IP allowlist** and **no `X-MailerSend-*`
  header**. Don't build either into your receiver.

## Full Event Reference

- [Account webhooks](https://developers.mailersend.com/api/v1/account/webhooks.html)
- [Webhook security](https://developers.mailersend.com/api/v1/account/webhooks.html#security)
- [SMS webhooks](https://developers.mailersend.com/api/v1/sms/webhooks)
- [WhatsApp webhooks](https://developers.mailersend.com/api/v1/whatsapp/webhooks)
