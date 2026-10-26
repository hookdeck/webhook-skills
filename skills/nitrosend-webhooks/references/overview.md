# Nitrosend Webhooks Overview

## What Are Nitrosend Webhooks?

[Nitrosend](https://nitrosend.com) is a transactional and marketing email platform with an agent inbox. It sends an HTTP POST with a JSON body to every webhook endpoint you register when a transactional email changes state, when a reply reaches one of your brand's inboxes, and when something changes on the account. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the endpoint's `whsec_` secret.

Email events cover transactional email only: single messages your brand sends, not campaigns or flows. SMS and test sends do not emit email events. Opens and clicks come from Nitrosend's own tracking, so a brand that turns open or click tracking off stops receiving `email.opened` and `email.clicked`.

## Event Payload Structure

Every body is `{ type, timestamp, data }`:

```json
{
  "type": "email.bounced",
  "timestamp": "2026-09-30T10:00:00.000Z",
  "data": {
    "message_id": 48213,
    "to": "ada@example.com",
    "subject": "Reset your password",
    "idempotency_key": "reset-8841",
    "tags": { "user_id": "42" },
    "bounce": { "type": "hard", "subtype": "NoEmail" }
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The dotted event type, for example `email.bounced`. This is what handlers switch on |
| `timestamp` | When the event happened (ISO 8601). Use it to order events |
| `data.message_id` | The `id` that `POST /v1/my/messages` returned |
| `data.idempotency_key` | The `Idempotency-Key` you sent the message with; left out when you sent none |
| `data.tags` | The tags you sent the message with |
| `data.bounce` | On `email.bounced`: `type` (the bounce kind, such as `hard`) and `subtype`. Not the event type |
| `data.test` | `true` on test events, whose ids are `null` |

The `webhook-id` header (`evt_...`) is unique per event and stable across retries, so it is the idempotency key.

## Email Events

| Event | Triggered When |
|-------|----------------|
| `email.sent` | The provider accepted the message |
| `email.delivered` | The recipient's mail server accepted it |
| `email.bounced` | It bounced, hard or soft |
| `email.complained` | The recipient marked it as spam |
| `email.opened` | The first time it was opened. Security scanners and bots do not count |
| `email.clicked` | The first human click of each link in it |
| `email.failed` | It failed for good. A failure Nitrosend is still retrying is not reported |
| `email.received` | A message reached one of the brand's inboxes and was not quarantined: a reply, an automatic reply, or new mail to the inbox address |

### email.received

Inboxes are part of the Agent Inbox (in beta, enabled on request). Send with the inbox address as `reply_to` (or `from`) to have replies reported. The body adds:

| Field | Meaning |
|-------|---------|
| `message_id`, `idempotency_key`, `tags` | Identify the send this answers; `message_id` is `null` and `tags` empty otherwise |
| `from`, `to`, `subject` | Sender, inbox address and subject |
| `text`, `html` | Bodies, each capped at 64 KiB; `truncated` is `true` when either was cut |
| `auto_submitted` | `true` for automatic replies such as out-of-office notices |
| `attachments` | Metadata only (`id`, `filename`, `size`, `content_type`, `scanned`, `scan_status`, `downloadable`, `download_requires_confirmation`, optional `availability_reason`). Download only when `downloadable` is `true` |
| `attachments_omitted` | Only when the message carried more than 50 files; counts those past the limit |
| `conversation_id`, `conversation_message_id` | Used to download attachments from the conversation API |

Mail the inbox quarantines (spam, viruses, blocked senders) is not sent, and each message is reported once.

## Account Events

| Event | Triggered When |
|-------|----------------|
| `campaign.completed` | A campaign finished sending to its whole audience |
| `campaign.failed` | A campaign send ended before reaching any recipient |
| `campaign.stopped` | Nitrosend paused a campaign send because its bounce or spam-complaint rate crossed the stop threshold |
| `flow.paused` | Nitrosend paused a flow because its bounce or spam-complaint rate crossed the pause threshold |
| `sending.paused` | Nitrosend paused all sending on the account |
| `sending.limit_approaching` | The account has used most of its rolling 24-hour sending allowance |
| `sending.limit_reached` | The account has used its whole allowance; sends wait for capacity |
| `import.completed` | A contact import finished |
| `import.failed` | A contact import failed |
| `domain.verified` | A sending domain passed DNS verification and can send |
| `domain.verification_lost` | A verified sending domain failed its DNS checks and is no longer verified |
| `domain.dns_degraded` | A verified domain's DNS records could not be confirmed; it stays verified while Nitrosend rechecks |
| `webhook.disabled` | Nitrosend turned off one of the brand's webhooks after three days of failed deliveries |

The three `sending.*` events reach the webhooks of every brand in the account; the others reach the webhooks of the brand they concern. Account events are added to an endpoint through the API; the dashboard lists the email events.

## Full Event Reference

These 21 events are those documented in the [Nitrosend webhooks guide](https://docs.nitrosend.com/integrations/webhooks), which points to the [API Reference](https://docs.nitrosend.com/api.md) for each event's fields. The list may not be exhaustive, so handlers should ignore types they don't recognise.
