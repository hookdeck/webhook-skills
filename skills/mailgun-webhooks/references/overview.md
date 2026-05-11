# Mailgun Webhooks Overview

## What Are Mailgun Webhooks?

Mailgun webhooks are HTTPS POST requests Mailgun sends to your application as email events occur in real time — when a message is accepted for delivery, delivered to the recipient, opened, clicked, bounced, or marked as spam. They let you track engagement and react to delivery problems without polling the Logs API.

## Account-Level vs Domain-Level Webhooks

Webhooks can be configured in two places, with **identical payload format and the same signing key**:

- **Account-level** — fires for events across **every** sending domain on the account. Useful when one application processes events for many domains.
- **Domain-level** — fires only for events on a single sending domain. Useful for multi-tenant setups where each domain points at a different consumer.

Both deliver the same JSON shape and verify against the same **HTTP Webhook Signing Key** — handler code is identical.

## Webhook Payload Structure

Every Mailgun webhook has the same top-level shape:

```json
{
  "signature": {
    "timestamp": "1529006854",
    "token": "a8ce0edb2dd8301dee6c2405235584e45aa91d1e9f979f3de0",
    "signature": "d2271d12299f6592d9d44cd9d250f0704e4674c30d79d07c47a66f95ce71cf55"
  },
  "event-data": {
    "event": "delivered",
    "id": "CPgfbmQMTCKtHW6uIWtuVe",
    "timestamp": 1521243339.873676,
    "recipient": "alice@example.com",
    "message": {
      "headers": {
        "message-id": "20180412195244.1.E9F32C40C2BFD43E@example.com"
      }
    }
    /* event-specific fields ... */
  }
}
```

- `signature` — the verification object: `timestamp`, `token`, `signature` (and optionally `parent-signature` for subaccounts).
- `event-data` — the event details. Always contains an `event` field naming the event type.

## Common Event Types

| Event | Triggered When | Notable Fields |
|-------|----------------|----------------|
| `accepted` | Mailgun accepted the message for delivery | `recipient`, `method` |
| `rejected` | Mailgun rejected the message before sending (e.g., suppression list) | `reject.reason`, `reject.description` |
| `delivered` | Receiving mail server accepted the message | `recipient`, `delivery-status` |
| `failed` | Permanent or temporary delivery failure | `recipient`, `severity` (`permanent` / `temporary`), `delivery-status.code`, `delivery-status.message` |
| `opened` | Recipient opened the email (open tracking required) | `recipient`, `ip`, `client-info` (browser, device, OS), `geolocation` |
| `clicked` | Recipient clicked a tracked link | `recipient`, `url`, `ip`, `client-info` |
| `unsubscribed` | Recipient clicked the unsubscribe link | `recipient`, `tags` |
| `complained` | Recipient marked the message as spam (FBL) | `recipient` |
| `stored` | Inbound message stored via a route | `storage.url`, `storage.key` |
| `list_member_uploaded` | Member added to a mailing list | `mailing-list.address`, `member` |
| `list_member_upload_error` | Failure uploading a member to a list | `mailing-list`, `error` |
| `list_uploaded` | Mailing list import finished | `mailing-list` |

## Permanent vs Temporary Failures

The `failed` event always carries a `severity` field:

- `permanent` — hard bounce. Address is invalid (mailbox doesn't exist, domain unreachable). **Stop sending.** Mailgun adds these to the bounce suppression list automatically.
- `temporary` — soft bounce. Mailbox full, transient DNS issue, greylisting. Mailgun keeps retrying internally for several hours before giving up.

```javascript
if (eventData.event === 'failed' && eventData.severity === 'permanent') {
  await markAddressBounced(eventData.recipient);
}
```

## Engagement Tracking

`opened` and `clicked` events fire only when tracking is enabled on the domain (default for new domains). They include:

- `ip` — recipient's IP at the time of the event
- `geolocation` — country/region/city derived from IP
- `client-info` — `client-name`, `client-os`, `device-type`, `user-agent`
- `clicked` events additionally include `url` — the link that was clicked

Pre-fetching by spam filters and corporate proxies can fire `opened` events without a real human view; treat single opens as a soft signal.

## Full Event Reference

See the [official Mailgun events documentation](https://documentation.mailgun.com/docs/mailgun/user-manual/events/events) for the complete catalog and per-event field reference, and the [webhooks documentation](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks) for delivery semantics.
