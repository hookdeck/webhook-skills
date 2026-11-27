# Klaviyo Webhooks Overview

## What Are Klaviyo Webhooks?

Klaviyo is a marketing automation and customer data platform (CDP). It can push
data **out** of your account to your own endpoints in two ways:

1. **System webhooks** — created under Data management > Webhooks or with the
   [Webhooks API](https://developers.klaviyo.com/en/reference/webhooks). You
   subscribe to one or more **topics** (e.g. `event:klaviyo.opened_email`).
   Klaviyo batches matching events and delivers them to your endpoint with a
   predefined payload format, **signed** with an HMAC-SHA256 signature in the
   `Klaviyo-Signature` header. Only Advanced KDP customers (including an Advanced
   KDP free trial) and Klaviyo app partners can create them.
2. **Flow webhook action** — a step you add inside a flow that POSTs a JSON body
   you write, with any headers you add and an `X-Klaviyo-Flow-ID` header. It has
   no topic and is **not signed** (see [verification.md](verification.md)).

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
| `event:klaviyo.sent_sms` | A profile texted your Klaviyo sending number (inbound) |
| `event:klaviyo.received_sms` | A recipient received an SMS you sent |
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

> This is Klaviyo's table of common topics, which it says isn't exhaustive.
> Topics follow the metrics in your account, including integration and API
> metrics. Fetch the full list for your account with the
> [Get Webhook Topics](https://developers.klaviyo.com/en/reference/get_webhook_topics) endpoint.

## Event Payload Structure

A single request can carry up to 1,000 events, from several topics, in its
`data` array. Klaviyo prints a full example request for Sent SMS on
[Working with system webhooks](https://developers.klaviyo.com/en/docs/working_with_system_webhooks#example-webhook-request).

- `data[].external_id` — the ID of the event. Use it as your **idempotency key**,
  since failed requests are retried.
- `data[].topic` — the topic string; dispatch on this.
- `data[].payload` — the event, in the same shape as a
  [Get Event](https://developers.klaviyo.com/en/reference/get_event) API response.
- `meta.klaviyo_webhook_id` — must equal the `Klaviyo-Webhook-Id` header; don't
  process the request if it doesn't.
- `meta.klaviyo_account_id` — the account the event happened in.
- `meta.timestamp` — when the request was sent.

Klaviyo's printed examples also carry `meta.version`, which its docs don't explain.

Always iterate over `data` — a single delivery may batch multiple events.

## Full Event Reference

- [Webhooks API overview](https://developers.klaviyo.com/en/reference/webhooks)
- [Working with system webhooks](https://developers.klaviyo.com/en/docs/working_with_system_webhooks)
</content>
