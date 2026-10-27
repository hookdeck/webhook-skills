# useSend Webhooks Overview

## What Are useSend Webhooks?

useSend (usesend.com) is an open-source email sending platform, formerly called
Unsend. It sends an HTTP `POST` with a JSON body to your endpoint when events
happen in your account. Your endpoint must return a `2xx` within 10 seconds.

## Common Event Types

There are 20 documented event types (13 email, 3 contact, 4 domain), plus the
`webhook.test` event from the dashboard: 21 in all.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `email.queued` | Email has been queued for sending | Audit log |
| `email.sent` | Email was sent to the recipient's mail server | Status tracking |
| `email.delivered` | Email was successfully delivered | Mark as delivered |
| `email.delivery_delayed` | Delivery is being retried | Alert on delays |
| `email.bounced` | Email bounced (permanent or temporary) | Suppress address |
| `email.rejected` | Email was rejected | Investigate content |
| `email.rendering_failure` | Template rendering failed | Fix the template |
| `email.complained` | Recipient marked the email as spam | Unsubscribe the recipient |
| `email.failed` | Email failed to send | Retry or alert |
| `email.cancelled` | Scheduled email was cancelled | Status tracking |
| `email.suppressed` | Recipient is on the suppression list | Reporting |
| `email.opened` | Recipient opened the email | Engagement analytics |
| `email.clicked` | Recipient clicked a link | Engagement analytics |
| `contact.created` | New contact was created | Sync a CRM |
| `contact.updated` | Contact was updated | Sync a CRM |
| `contact.deleted` | Contact was deleted | Sync a CRM |
| `domain.created` | New domain was added | Audit log |
| `domain.verified` | Domain verification completed | Enable sending |
| `domain.updated` | Domain settings were updated | Audit log |
| `domain.deleted` | Domain was deleted | Audit log |
| `webhook.test` | You click "Send Test" in the dashboard | Check connectivity |

The examples handle `email.delivered`, `email.bounced`, `email.complained`,
`email.opened`, `email.clicked`, `contact.created`, `domain.verified` and
`webhook.test`, and log every other type.

## Event Payload Structure

```json
{
  "id": "call_abc123",
  "type": "email.delivered",
  "version": "2026-01-18",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "teamId": 123,
  "data": {
    "id": "email_123",
    "status": "DELIVERED",
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "Welcome!",
    "occurredAt": "2024-01-15T10:30:00Z"
  },
  "attempt": 1
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for this webhook call. Use it to deduplicate. |
| `type` | The event type. Dispatch on this field. |
| `version` | API version of the payload format |
| `createdAt` | When the event was created |
| `teamId` | Your team ID |
| `data` | Event-specific data |
| `attempt` | Delivery attempt number (1 to 6) |

The `webhook.test` event has a different body:
`{"test": true, "webhookId": "wh_abc123", "sentAt": "2024-01-15T10:30:00.000Z"}`.

## Request Headers

| Header | Description |
|--------|-------------|
| `X-UseSend-Signature` | `v1=` followed by the hex HMAC-SHA256 signature |
| `X-UseSend-Timestamp` | Unix timestamp in **milliseconds** |
| `X-UseSend-Event` | Event type |
| `X-UseSend-Call` | Unique webhook call ID |
| `X-UseSend-Retry` | `true` if this is a retry attempt |

## Retries

useSend makes 6 attempts in all: immediately, then after about 5, 10, 20, 40
and 80 seconds. After 30 consecutive failed calls the webhook is disabled until
you re-enable it from the dashboard. Duplicates are possible, so deduplicate on
the payload `id`.

## Full Event Reference

See [useSend's webhook documentation](https://docs.usesend.com/guides/webhooks).
