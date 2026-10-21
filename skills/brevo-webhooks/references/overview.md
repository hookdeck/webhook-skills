# Brevo Webhooks Overview

## What Are Brevo Webhooks?

Brevo (formerly Sendinblue) sends an HTTP POST with a JSON body to your
**notify URL** whenever a tracked event happens: a transactional email is sent
or delivered, a campaign email is opened or clicked, a message bounces, a
recipient complains or unsubscribes, or a contact changes. Each webhook has a
`type` (`transactional`, `marketing`, or `inbound`), a `channel` (`email` or
`sms`), and a list of events it subscribes to. An account can have up to 40
webhooks (marketing + transactional combined).

Brevo does **not** sign payloads. You secure the endpoint with Basic auth,
a bearer token, or custom headers plus Brevo's IP allowlist. See
[verification.md](verification.md).

## Subscription Names vs Payload `event` Values

The names you pass in `events` when creating a webhook are **camelCase**; the
`event` field in the delivered payload is **snake_case**. Dispatch on the
payload value.

| Subscribe with (`events`) | Payload `event` |
|---------------------------|-----------------|
| `sent` or `request` | `request` |
| `delivered` | `delivered` |
| `opened` | `opened` |
| `uniqueOpened` | `unique_opened` |
| `click` | `click` |
| `softBounce` | `soft_bounce` |
| `hardBounce` | `hard_bounce` |
| `spam` | `spam` |
| `unsubscribed` | `unsubscribed` (transactional), `unsubscribe` (marketing) |
| `invalid` | `invalid_email` |
| `blocked` | `blocked` |
| `deferred` | `deferred` |
| `listAddition` | `list_addition` |
| `contactUpdated` | `contact_updated` |
| `contactDeleted` | `contact_deleted` |

## Common Event Types

### Transactional email

| `event` | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| `request` | Email sent ("Sent") | Log sends, start delivery tracking |
| `delivered` | Recipient's server accepted the email | Mark message delivered |
| `opened` | Email opened | Engagement analytics |
| `unique_opened` | First opening of the email | Unique open rate |
| `click` | Link clicked (`link` field) | Click-through tracking |
| `soft_bounce` | Temporary delivery failure | Retry or monitor |
| `hard_bounce` | Permanent delivery failure | Suppress the address |
| `spam` | Recipient marked the email as spam | Suppress / unsubscribe |
| `unsubscribed` | Recipient unsubscribed | Update preferences |
| `invalid_email` | Address is invalid | Clean your list |
| `blocked` | Brevo blocked the send | Investigate the recipient |
| `deferred` | Delivery delayed | Monitor |
| `error` | Sending failed | Alert / retry the send |
| `proxy_open` / `unique_proxy_open` | Opened through a privacy proxy (e.g. Apple Mail Privacy Protection) | Treat separately from real opens |

### Marketing email (campaigns)

| `event` | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| `delivered` | Campaign email delivered | Campaign analytics |
| `opened` | Campaign email opened | Engagement scoring |
| `click` | Link clicked (`URL` field) | Click-through tracking |
| `soft_bounce` / `hard_bounce` | Delivery failed | List hygiene |
| `spam` | Marked as spam | Suppress the contact |
| `unsubscribe` | Unsubscribed from the campaign | Sync opt-outs |
| `proxy_open` | Opened through a privacy proxy | Treat separately from real opens |

### Contacts (marketing type)

| `event` | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| `list_addition` | Contact added to one or more lists (`list_id` array) | Sync audiences |
| `contact_updated` | Contact attributes changed (`content`) | Sync CRM fields |
| `contact_deleted` | Contact deleted | Remove from your system |

### SMS

SMS webhooks (`"channel": "sms"`) have **no `event` field**. They carry
`msg_status` (for example `sent`, `delivered`, `soft_bounce`, `hard_bounce`)
plus `to`, `messageId`, and `type` (`transactional` or `marketing`). Branch on
`msg_status` if you subscribe to SMS events.

## Event Payload Structure

Transactional email (`delivered`):

```json
{
  "event": "delivered",
  "email": "example@domain.com",
  "id": 26224,
  "date": "2020-10-09 00:00:00",
  "ts": 1604933619,
  "message-id": "201798300811.5787683@relay.domain.com",
  "ts_event": 1604933654,
  "subject": "My first Transactional",
  "tags": ["transac_messages"],
  "sending_ip": "xxx.xxx.xxx.xxx",
  "ts_epoch": 1604933654
}
```

Marketing email (`hard_bounce`):

```json
{
  "id": 123456,
  "camp_id": 12,
  "email": "example@domain.com",
  "campaign_name": "My First Campaign",
  "date_sent": "2020-10-09 00:00:00",
  "date_event": "2020-10-09 00:00:00",
  "event": "hard_bounce",
  "reason": "server is down",
  "tag": "",
  "ts_sent": 1604933619,
  "ts_event": 1604933737,
  "ts": 1604937337
}
```

Key fields:

- `event` — the event type (see tables above)
- `email` — recipient
- `id` — the **webhook** ID (the same for every payload sent to that webhook), not an event ID
- `message-id` — transactional message ID; use with `event` as an idempotency key
- `camp_id` — marketing campaign ID
- `ts_event`, `ts_epoch` — UTC timestamps; `date` is in CET/CEST

## Batched Webhooks

Create the webhook with `"batched": true` to receive events in batches: events
accumulate in 5-minute windows, with up to 500 events per batch. Handle both a
single object and an array.

## Full Event Reference

- [Getting started with webhooks](https://developers.brevo.com/docs/how-to-use-webhooks)
- [Transactional webhooks](https://developers.brevo.com/docs/transactional-webhooks)
- [Marketing webhooks](https://developers.brevo.com/docs/marketing-webhooks)
- [Batched webhooks](https://developers.brevo.com/docs/batch-webhooks)

Brevo also offers inbound parsing, payment, loyalty, meeting, push notification,
Sales CRM, and Conversations webhooks, each with its own payload format.
