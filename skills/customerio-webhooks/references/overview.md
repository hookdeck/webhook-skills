# Customer.io Webhooks Overview

## What Are Customer.io Reporting Webhooks?

Customer.io **Reporting Webhooks** push message-activity and customer-subscription events to
your endpoint as they happen. Every time a message is drafted, sent, delivered, opened,
clicked, bounced (etc.), Customer.io sends a single HTTP `POST` to your configured URL.

Unlike many providers, Customer.io payloads **do not carry a single dotted event-name string**
(there is no `"event": "email.opened"`). Instead, each POST is **one event object** you
identify by two fields together:

- `object_type` — the channel/entity: `email`, `push`, `web_push`, `sms`, `in_app`, `inbox`,
  `slack`, `webhook`, `whatsapp`, or `customer`. Customer.io's OpenAPI file spells the in-app type
  `in_app`, but the examples on its Reporting webhooks page print `in-app`, so accept both.
- `metric` — the action: `sent`, `delivered`, `opened`, `clicked`, `bounced`, `dropped`,
  `spammed`, `failed`, `converted`, `unsubscribed`, `subscribed`, and more.

**Always branch on the `object_type` + `metric` pair.** The same `metric` (e.g. `sent`) appears
under many `object_type`s.

## Event Payload Structure

Every payload has the same top-level shape:

```json
{
  "event_id": "01E4C4CT6YDC7Y5M7FE1GWWPQJ",
  "object_type": "email",
  "metric": "opened",
  "timestamp": 1613063089,
  "data": {
    "customer_id": "42",
    "delivery_id": "RPILAgUBcRhIBqSbvEZotk16z5A=",
    "recipient": "test@example.com",
    "identifiers": { "id": "42", "email": "test@example.com" }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event_id` | string | Unique ID for this event — use it for idempotency/de-duplication |
| `object_type` | enum | Channel/entity that produced the event |
| `metric` | enum | The action that occurred |
| `timestamp` | integer | Unix (seconds) time the event occurred |
| `data` | object | Event-specific fields (see below) |

Common `data` fields: `customer_id`, `delivery_id`, `recipient`, `identifiers`, `subject`
(email), `href` and `link_id` (clicks), `failure_message` / `reason` (bounces, failures).

## Common Event Types (`object_type` + `metric`)

### Message metrics (email, sms, push, in_app, slack, whatsapp, webhook)

| `object_type` | `metric` | Triggered when | Common use cases |
|---------------|----------|----------------|------------------|
| `email` | `drafted` | Message queued/drafted | Debug send timing |
| `email` | `attempted` | Send attempted | Track attempts |
| `email` | `sent` | Handed to the sending provider | Delivery analytics |
| `email` | `delivered` | Recipient's server accepted it | Confirm delivery |
| `email` | `opened` | Recipient opened the email | Engagement scoring |
| `email` | `clicked` | Tracked link clicked (`data.href`, `data.link_id`) | Click attribution |
| `email` | `converted` | Conversion goal met | Campaign ROI |
| `email` | `bounced` | Hard/soft bounce | Suppress bad addresses |
| `email` | `dropped` | Dropped before send (suppression) | Deliverability hygiene |
| `email` | `spammed` | Marked as spam | List cleanup |
| `email` | `failed` | Send failed | Alerting, retries |
| `email` | `undeliverable` | Could not be delivered | Suppress |
| `sms` | `sent`, `delivered`, `clicked`, `failed`, `bounced` | SMS lifecycle | SMS analytics |
| `sms` | `replied` | Recipient replied | Two-way messaging |
| `push` | `sent`, `delivered`, `opened`, `bounced`, `dropped`, `failed` | Push lifecycle | Push analytics |
| `in_app` | `sent`, `opened`, `clicked`, `converted`, `failed` | In-app message lifecycle | In-app engagement |
| `slack` / `webhook` | `drafted`, `attempted`, `sent`, `failed` | Slack/webhook action lifecycle | Ops alerting |
| `whatsapp` | `sent`, `delivered`, `opened`, `clicked`, `replied`, `failed`, `bounced` | WhatsApp lifecycle | WhatsApp analytics |

### Customer metrics (`object_type: "customer"`)

| `metric` | Triggered when |
|----------|----------------|
| `subscribed` | Customer (re)subscribed |
| `unsubscribed` | Customer unsubscribed |
| `cio_subscription_preferences_changed` | Subscription preferences changed |

## Retry & Timeout Behavior

- **4-second timeout.** Return a `2xx` within 4 seconds or the delivery is treated as failed.
- **7-day retries** with exponential backoff on failure. Subsequent events for the same
  workspace can backlog behind a failing endpoint (ordering pressure) — acknowledge fast and
  process asynchronously.
- Responses of `400`, `401`, `402`, `403`, `404`, `405`, `410`, `422`, `429`, `500`, `502` or `521`
  (and connection errors such as `EOF` or `connection refused`) put the call in a batch that is
  retried after an hour.
- After 7 days, pending events expire and can't be recovered.

## Full Event Reference

For the complete list of object types and metrics, see
[Customer.io's Reporting Webhooks documentation](https://docs.customer.io/integrations/data-out/connections/webhooks/).
