# Unipile Webhooks Overview

## What Are Unipile Webhooks?

Unipile is a unified API for messaging (LinkedIn, WhatsApp, Instagram, Messenger,
Telegram, X) and email (Google, Microsoft, IMAP). Webhooks replace polling: when
something changes on a connected account, Unipile sends an HTTP POST to the
`request_url` you registered.

Create webhooks with `POST /api/v1/webhooks` (or the SDK) or in the Unipile
dashboard. Each webhook has one `source`, an optional `events` list, optional
`account_ids` (default: every current and future account), and an optional
`headers` array.

## Common Event Types

| Event | `source` | Triggered When | Common Use Cases |
|-------|----------|----------------|------------------|
| `message_received` | `messaging` | A message is received or sent on a connected account | Inbox sync, auto-replies, CRM logging |
| `message_read` | `messaging` | A message is marked read | Read receipts |
| `message_reaction`, `message_edited`, `message_deleted`, `message_delivered` | `messaging` | Other message lifecycle changes | Keeping a mirror in sync |
| `mail_received` | `email` | A new email arrives (sent emails are included too) | Email ingestion |
| `mail_sent`, `mail_moved` | `email` | An email is sent or moved between folders | Mailbox sync |
| `mail_opened`, `mail_link_clicked` | `email_tracking` | A tracked email is opened or a link clicked | Outreach analytics |
| `new_relation` | `users` | A new connection is detected | LinkedIn outreach |
| Account status (`OK`, `CREDENTIALS`, ...) | `account_status` | An account's status changes | Reconnect prompts |

## Event Payload Structure

Messaging (abridged):

```json
{
  "account_id": "dfXlh46vQYCsMbVarumWlg",
  "account_type": "LINKEDIN",
  "account_info": { "type": "LINKEDIN", "feature": "classic", "user_id": "ACoAAAcD..." },
  "event": "message_received",
  "chat_id": "R8J-xM9WX7eoHLp6gSVtWQ",
  "timestamp": "2023-09-24T13:49:07.965Z",
  "webhook_name": "Webhook demo",
  "message_id": "ykmhfXlRW0W_cqReJYrfBw",
  "message": "Hello World !",
  "sender": { "attendee_id": "...", "attendee_name": "Kim Unipile", "attendee_provider_id": "..." },
  "attendees": [],
  "attachments": []
}
```

Email (abridged):

```json
{
  "email_id": "--R9___qXQKIu80oAF0lJA",
  "account_id": "GxwlUMaZTHefegva16XcWw",
  "event": "mail_received",
  "from_attendee": { "display_name": "Julien", "identifier": "julien@example.com", "identifier_type": "EMAIL_ADDRESS" },
  "subject": "Hello",
  "body": "Hello World",
  "origin": "external"
}
```

Account status (no `event` field):

```json
{ "AccountStatus": { "account_id": "h_EKCy2lRLef5NzHp0iw4A", "account_type": "LINKEDIN", "message": "CREDENTIALS" } }
```

`message` is the status: `OK`, `ERROR`/`STOPPED`, `CREDENTIALS`, `CONNECTING`,
`DELETED`, `CREATION_SUCCESS`, `RECONNECTED`, `SYNC_SUCCESS`. When it isn't `OK`,
the account stops producing new-message webhooks until it is reconnected.

## Delivery

Reply `200` in under 30 seconds. Otherwise Unipile makes five retry attempts with
an increasing delay. There is no delivery ID header, so dedupe on payload fields.

## Full Event Reference

For the complete list of events and payloads, see [Unipile's webhook documentation](https://developer.unipile.com/docs/webhooks-2).
