# Surge Webhooks Overview

## What Are Surge Webhooks?

[Surge](https://surge.app) is an SMS/MMS and voice messaging API for businesses. Webhooks tell your
systems when something happens in a project: a message arrives or fails, a contact opts out, a campaign
is approved, a call ends. You register **one endpoint URL per project**, which receives events from every
account under the project for the subscribed types, and filter on `type` in your handler. Each request is
a JSON `POST` signed with [Standard Webhooks](https://www.standardwebhooks.com/) headers (`webhook-id`,
`webhook-timestamp`, `webhook-signature`).

## Common Event Types

Fourteen events are documented, and the list may not be exhaustive. The name is the top-level `type`
field. The examples handle all of these and acknowledge other types with 200:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.sent` | Surge accepts an outbound message and sends it to the carrier (before delivery is confirmed) | Mark a send as confirmed |
| `message.delivered` | The carrier confirms delivery. Not every carrier reports it, and it doesn't always mean the handset got it | Update delivery status |
| `message.failed` | An outbound message could not be delivered; `failure_reason` explains why | Stop sending on `opted_out` or `invalid_mobile_number`, retry `carrier_error` |
| `message.received` | A contact sends a message to one of your numbers | Auto-replies, support tickets, hand-off to an agent |
| `contact.opted_in` | A contact who had opted out sends START, YES or UNSTOP | Re-enable messaging for the contact |
| `contact.opted_out` | A contact sends STOP, CANCEL, UNSUBSCRIBE, END or QUIT | Suppress the contact in your own systems |
| `conversation.created` | A new thread between a number and a contact is created (alongside the first `message.received`) | Create a ticket or CRM lead |
| `campaign.approved` | A campaign becomes `active` after carrier approval | Progress onboarding, attach numbers |
| `phone_number.imported` | A number is imported by porting or hosting; check `data.campaign.attachment_status` | Notify the customer that the import finished |
| `phone_number.attached_to_campaign` | A number is attached to a campaign and ready for production | Flip a "ready" flag |
| `link.followed` | A contact first clicks a shortened link (later clicks don't fire) | Click-through tracking |
| `call.ended` | A call ends, whatever the direction or how it ended | Call logs, follow-up messages |
| `recording.completed` | A non-voicemail call recording finished processing | `GET /recordings/{recording_id}/file` to download audio |
| `voicemail.received` | A voicemail recording finished processing | Missed-call alerts, transcription |

Other lifecycle events (for example campaign rejection or submission) may exist but have no documentation
page, so don't rely on their payloads.

## Event Payload Structure

Every delivery shares one envelope:

```json
{
  "id": "evt_01jav96823f9x9054d6gyzpp16",
  "type": "message.received",
  "timestamp": "2024-10-21T23:29:43Z",
  "account_id": "acct_01jrz...",
  "data": { "...": "varies by event type" }
}
```

Some of Surge's own examples omit `id`, so treat it as optional. A `message.received` example:

```json
{
  "type": "message.received",
  "data": {
    "id": "msg_01jav96823f9x9054d6gyzpp16",
    "blast_id": null,
    "body": "Is the 3pm slot still available?",
    "metadata": {},
    "attachments": [],
    "received_at": "2024-10-21T23:29:43Z",
    "conversation": {
      "id": "cnv_01jav8xy7fe4nsay3c9deqxge9",
      "phone_number": { "id": "pn_01jsjwe4d9fx3tpymgtg958d9w", "number": "+18015556789", "type": "local" },
      "contact": { "id": "ctc_01ja88cboqffhswjx8zbak3ykk", "phone_number": "+18015551234" }
    }
  }
}
```

A `phone_number.imported` example:

```json
{
  "type": "phone_number.imported",
  "account_id": "acct_01japd271aeatb7txrzr2xj8sg",
  "timestamp": "2024-10-21T23:29:41Z",
  "data": {
    "id": "pn_01jsjwe4d9fx3tpymgtg958d9w",
    "number": "+18015551234",
    "type": "local",
    "campaign": { "id": "cpn_01jjnn7s0zfx5tdcsxjfy93et2", "attachment_status": "attachment_pending" },
    "campaign_id": "cpn_01jjnn7s0zfx5tdcsxjfy93et2"
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event name |
| `id` | Event id, when present. Use it as the deduplication key |
| `timestamp` | When the event was created |
| `account_id` | The account under your project that the event belongs to |
| `data` | Event payload. Messages carry `id`, `body`, `conversation`; `message.failed` adds `failure_reason`; `link.followed` carries `message.id` (the top-level `message_id` is deprecated) |

For `message.failed`, `failure_reason` is one of codes such as `opted_out`, `invalid_mobile_number`,
`message_filtered`, `daily_message_cap_reached` and `carrier_error`. See Surge's
[error reference](https://docs.surge.app/api-reference/errors) for the full list.

## Delivery and Retries

Surge expects a `2xx` within the request timeout (the value isn't documented). Non-2xx responses and
timeouts are retried with exponential back-off, so delivery is at least once and handlers must be
idempotent. Redirects are not followed: a `3xx` counts as a failure.

## Full Event Reference

See the [webhooks overview](https://docs.surge.app/api-reference/webhooks), the
[event index](https://docs.surge.app/receiving/events) and
[Receiving Messages & Webhooks](https://docs.surge.app/receiving/index).
