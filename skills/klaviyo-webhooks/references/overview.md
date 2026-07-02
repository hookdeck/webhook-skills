# Klaviyo Webhooks Overview

## What Are Klaviyo Webhooks?

Klaviyo is a marketing automation and customer data platform (CDP). It can push
data **out** of your account to your own endpoints in two ways:

1. **System webhooks** (recommended) — created via the [Webhooks API](https://developers.klaviyo.com/en/reference/webhooks_api_overview).
   You subscribe to one or more **topics** (e.g. `event:klaviyo.opened_email`).
   Klaviyo batches matching events and delivers them to your endpoint with a
   predefined payload format, **signed** with an HMAC-SHA256 signature in the
   `Klaviyo-Signature` header.
2. **Flow "Webhook" action** — a step you add inside a flow that POSTs a custom
   JSON payload you define. This delivery is **not signed**; secure it with a
   secret token in the URL (see [verification.md](verification.md)).

This skill focuses on receiving and verifying **system webhooks**.

## Common Event Types (Topics)

Topics are strings prefixed with `event:klaviyo.`. Subscribe to what you need.

### Email

| Topic | Triggered When |
|-------|----------------|
| `event:klaviyo.received_email` | An email was delivered to the recipient |
| `event:klaviyo.opened_email` | Recipient opened an email |
| `event:klaviyo.clicked_email` | Recipient clicked a link in an email |
| `event:klaviyo.bounced_email` | An email bounced |
| `event:klaviyo.dropped_email` | An email was dropped before sending |
| `event:klaviyo.marked_email_as_spam` | Recipient marked an email as spam |
| `event:klaviyo.subscribed_to_email_marketing` | Profile subscribed to email marketing |
| `event:klaviyo.unsubscribed_from_email_marketing` | Profile unsubscribed from email marketing |
| `event:klaviyo.manually_suppressed_from_email_marketing` | Profile manually suppressed |
| `event:klaviyo.manually_unsuppressed_from_email_marketing` | Profile manually unsuppressed |
| `event:klaviyo.updated_email_preferences` | Profile updated email preferences |

### SMS

| Topic | Triggered When |
|-------|----------------|
| `event:klaviyo.sent_sms` | An SMS was sent |
| `event:klaviyo.received_sms` | An inbound SMS was received |
| `event:klaviyo.clicked_sms` | Recipient clicked a link in an SMS |
| `event:klaviyo.failed_to_deliver_sms` | An SMS failed to deliver |
| `event:klaviyo.received_automated_response_sms` | An automated-response SMS was received |
| `event:klaviyo.failed_to_deliver_automated_response_sms` | An automated-response SMS failed to deliver |
| `event:klaviyo.subscribed_to_sms_marketing` | Profile subscribed to SMS marketing |
| `event:klaviyo.unsubscribed_from_sms_marketing` | Profile unsubscribed from SMS marketing |

### Push

| Topic | Triggered When |
|-------|----------------|
| `event:klaviyo.received_push` | A push notification was received |
| `event:klaviyo.opened_push` | A push notification was opened |
| `event:klaviyo.bounced_push` | A push notification bounced |

### Reviews

| Topic | Triggered When |
|-------|----------------|
| `event:klaviyo.ready_to_review` | A profile is ready to leave a review |
| `event:klaviyo.submitted_review` | A review was submitted |
| `event:klaviyo.submitted_rating` | A rating was submitted |

> Topic availability depends on your account and enabled channels. Fetch the
> exact list for your account with the
> [Get Webhook Topics](https://developers.klaviyo.com/en/reference/get_webhook_topics) endpoint.

## Event Payload Structure

A single request can carry up to 1,000 events in its `data` array:

```json
{
  "data": [
    {
      "external_id": "01H8...ABC",
      "topic": "event:klaviyo.opened_email",
      "payload": {
        "// ...": "the full Get Event API response for this event"
      }
    }
  ],
  "meta": {
    "klaviyo_webhook_id": "01H8...WHK",
    "klaviyo_account_id": "AbC123",
    "timestamp": "2026-07-02T12:00:00+00:00",
    "version": "2025-07-15"
  }
}
```

- `data[].external_id` — unique event ID. Use it as your **idempotency key**.
- `data[].topic` — the topic string; dispatch on this.
- `data[].payload` — the event's full payload (same shape as the Get Event API).
- `meta` — account/webhook identifiers, delivery timestamp, and API version.

Always iterate over `data` — a single delivery may batch multiple events.

## Full Event Reference

- [Webhooks API overview](https://developers.klaviyo.com/en/reference/webhooks_api_overview)
- [Working with system webhooks](https://developers.klaviyo.com/en/docs/working_with_system_webhooks)
</content>
