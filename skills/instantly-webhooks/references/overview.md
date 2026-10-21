# Instantly Webhooks Overview

## What Are Instantly Webhooks?

Instantly is a cold email outreach platform. Its webhooks are real-time
notifications about campaign activity: Instantly sends an HTTP `POST` with a
JSON body to your URL when an email is sent, opened or bounces, when a lead
replies or unsubscribes, and when a lead's status or label changes.

- Available on the **Hyper Growth plan or above**.
- A webhook subscribes to one event type or to `all_events`, for one campaign
  or all campaigns in the workspace.
- Payloads are **not signed**. Authenticate with a custom header you attach to
  the webhook (see [verification.md](verification.md)).

## Common Event Types

The event name is in the payload's `event_type` field. These values come from
the API v2 `event_type` enum ([Create webhook](https://developer.instantly.ai/api-reference/webhook/create-webhook))
and the [Webhook events guide](https://developer.instantly.ai/guides/webhook-events).

### Email events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `email_sent` | A campaign email was sent | Log outreach activity in a CRM |
| `email_opened` | A lead opened an email | Engagement scoring |
| `email_link_clicked` | A lead clicked a tracked link | Hot-lead alerts |
| `reply_received` | A lead replied | Route to sales, create CRM task |
| `auto_reply_received` | An auto-reply was received | Ignore or tag as out of office |
| `email_bounced` | An email bounced | Mark the address invalid |
| `lead_unsubscribed` | A lead unsubscribed | Sync to a suppression list |
| `account_error` | A sending account hit an error | Alert ops to fix the mailbox |
| `campaign_completed` | A campaign completed | Reporting, kick off next campaign |

**Link clicks:** the API enum (what you subscribe to) uses
`email_link_clicked`, while the events guide lists `link_clicked`. The
examples handle both values in the same branch.

### Lead status events

| Event | Triggered When |
|-------|----------------|
| `lead_interested` | Lead marked as interested |
| `lead_not_interested` | Lead marked as not interested |
| `lead_neutral` | Lead marked as neutral |
| `lead_meeting_booked` | Lead status changed to Meeting booked |
| `lead_meeting_completed` | Lead status changed to Meeting complete |
| `lead_no_show` | Lead marked as no-show (API enum only) |
| `lead_closed` | Lead status changed to Closed |
| `lead_out_of_office` | Lead is out of office |
| `lead_wrong_person` | Lead marked as wrong person |

### Custom labels

Any custom lead label in your workspace is sent with the **label name as the
`event_type`**, as-is. Your handler must accept unknown `event_type` values
(log them, or map them by name) rather than reject them. In the API, custom
label webhooks are created with `event_type: null` plus
`custom_interest_value`; `all_events` includes them.

The API enum also includes `supersearch_enrichment_completed`.

To list everything available in a workspace, including custom labels, call
`GET /api/v2/webhooks/event-types`.

## Event Payload Structure

```json
{
  "timestamp": "2026-10-20T21:44:23.244Z",
  "event_type": "reply_received",
  "workspace": "01a15b45-cbcb-78f8-aacd-5a2b788de0d5",
  "campaign_id": "01a15b45-cbcc-7e79-9923-767240005bcf",
  "campaign_name": "Q4 Outbound",
  "lead_email": "jane@example.com",
  "email_account": "sales@yourdomain.com",
  "unibox_url": "https://app.instantly.ai/app/unibox?...",
  "step": 1,
  "variant": 1,
  "is_first": true,
  "email_id": "01a15b46-...",
  "reply_subject": "Re: Quick question",
  "reply_text_snippet": "Sounds interesting, can we talk Tuesday?",
  "reply_text": "Sounds interesting, can we talk Tuesday? ...",
  "reply_html": "<p>Sounds interesting...</p>"
}
```

| Field | Present | Notes |
|-------|---------|-------|
| `timestamp` | Always | ISO time of the event |
| `event_type` | Always | See tables above |
| `workspace` | Always | Workspace UUID |
| `campaign_id`, `campaign_name` | Always | |
| `lead_email` | Lead events | |
| `email_account` | When applicable | Your mailbox that contacted the lead |
| `unibox_url` | Reply events | Link to the conversation |
| `step`, `variant` | When available | Sequence step / variant, starting at 1 |
| `is_first` | When available | First event of this type for the lead |
| `email_id` | Sent emails | Use with the reply endpoint |
| `email_subject`, `email_text`, `email_html` | Sent emails | |
| `reply_subject`, `reply_text`, `reply_text_snippet`, `reply_html` | Reply events | |

Lead data from your lead list (`firstName`, `lastName`, `companyName`,
`website`, `phone`, and custom variables) may appear as extra top-level keys.

## Idempotency

Payloads carry **no event ID**. Instantly retries failed deliveries, and with
no signature a captured request can be replayed, so derive a key:

```
event_type + timestamp + lead_email + campaign_id (+ step, email_id when present)
```

## Full Event Reference

- [Webhooks help article](https://help.instantly.ai/en/articles/6261906-webhooks)
- [Webhook events guide](https://developer.instantly.ai/guides/webhook-events)
- [Create webhook API](https://developer.instantly.ai/api-reference/webhook/create-webhook)
