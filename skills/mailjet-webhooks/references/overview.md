# Mailjet Webhooks Overview

## What Are Mailjet Webhooks?

Mailjet's Event API pushes an HTTP POST with a JSON body to your URL each time something happens to a message you sent. It works for both transactional (Send API) and marketing (campaign) email. Mailjet calls the URL an "event callback URL" (`/eventcallbackurl` resource) and the dashboard section "Event tracking".

Mailjet does not sign requests. See [verification.md](verification.md) for how to authenticate them.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sent` | The destination SMTP server accepted the message | Delivery logs, own statistics |
| `open` | Recipient opened the email | Engagement analytics |
| `click` | Recipient clicked a tracked link | Link tracking, lead scoring |
| `bounce` | Delivery failed (`hard_bounce` true = permanent) | Suppress undeliverable addresses |
| `blocked` | Send was blocked (invalid recipient, preblocked, duplicate in campaign, ...) | Diagnose rejected sends |
| `spam` | Recipient reported the message as spam via a feedback loop | Suppression, reputation monitoring |
| `unsub` | Recipient unsubscribed | Sync unsubscribes to a CRM |

## Event Payload Structure

Common fields on every event:

| Field | Description |
|-------|-------------|
| `event` | Event type string (above) |
| `time` | Unix timestamp |
| `email` | Recipient address |
| `mj_campaign_id` | Mailjet campaign ID |
| `mj_contact_id` | Mailjet contact ID |
| `customcampaign` | Value of the `X-Mailjet-Campaign` header, if set |
| `MessageID` | Unique message ID |
| `CustomID` | Custom ID provided at send time |
| `Payload` | Event payload provided at send time |

Additional fields per event:

- `sent`: `smtp_reply`, `mj_message_id` (deprecated, use `MessageID`)
- `open`: `ip`, `geo`, `agent`
- `click`: `url`, `ip`, `geo`, `agent`
- `bounce`: `blocked`, `hard_bounce`, `error_related_to`, `error`, `comment`
- `blocked`: `error_related_to`, `error`
- `spam`: `source` (feedback loop program)
- `unsub`: `mj_list_id`, `ip`, `geo`, `agent`

Example `bounce`:

```json
{
  "event": "bounce",
  "time": 1430812195,
  "MessageID": 13792286917004336,
  "email": "bounce@mailjet.com",
  "mj_campaign_id": 0,
  "mj_contact_id": 0,
  "customcampaign": "",
  "CustomID": "helloworld",
  "Payload": "",
  "blocked": false,
  "hard_bounce": true,
  "error_related_to": "recipient",
  "error": "user unknown",
  "comment": "Host or domain name not found."
}
```

## Grouped Events

With **Group Events** enabled (or `version: 2` on the `/eventcallbackurl`), Mailjet sends a JSON **array** of event objects in one request. Without it, each request has a single object. Handle both.

## Delivery and Retries

Return `200 OK`. Any other status is retried every 30 seconds for up to 24 hours. A backup URL can be set with `isBackup`, used if the primary is suspended.

## Full Event Reference

See [Mailjet event types](https://dev.mailjet.com/docs/email-api/webhooks/event-types) and [error values](https://dev.mailjet.com/docs/email-api/webhooks/values-for-errors).
