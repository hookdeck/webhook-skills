# Threads Webhooks Overview

## What Are Threads Webhooks?

Webhooks for Threads deliver real-time notifications for the topics and fields your app
subscribes to in the Meta App Dashboard. They use Meta's standard webhook mechanism (a GET
handshake with a verify token, then POSTs signed with `X-Hub-Signature-256`).

## Common Event Types

| Field (`values.field`) | Topic | Triggered When | Required permissions |
|------------------------|-------|----------------|----------------------|
| `replies` | `moderate` | A reply is posted on a Threads media owned by the installing user | `threads_basic`, `threads_read_replies` |
| `delete` | `moderate` | A post is deleted by the authenticated user | `threads_basic`, `threads_delete` |
| `mentions` | `interaction` | A public post mentions the installing user | `threads_basic`, `threads_manage_mentions` (optional `threads_read_replies` for `has_replies`, `is_reply`, `replied_to`, `root_post`) |
| `publish` | `interaction` | The authenticated user publishes a post, including replies | `threads_basic` |

## Event Payload Structure

Each POST is one flat notification (not Meta's `{object, entry[]}` batch form, as shown in
the Threads samples):

| Field | Description |
|-------|-------------|
| `app_id` | The Threads App ID (App settings > Basic > Threads App ID) |
| `topic` | `moderate` or `interaction` |
| `target_id` | Media ID for `replies`/`delete`; app-scoped user ID of the mentioned user for `mentions` |
| `time` | Unix time the notification was sent |
| `subscription_id` | Subscription ID for the user |
| `has_uid_field` | Boolean shown in the samples |
| `values.field` | The event: `replies`, `mentions`, `publish` or `delete` |
| `values.value` | The media object (`id`, `username`, `text`, `media_type`, `permalink`, `shortcode`, `timestamp`; `deleted_at` and `owner` for `delete`) |

```json
{
  "app_id": "123456",
  "topic": "interaction",
  "target_id": "78901",
  "time": 1723226877,
  "subscription_id": "234567",
  "has_uid_field": false,
  "values": {
    "field": "publish",
    "value": {
      "id": "8901234",
      "media_type": "TEXT_POST",
      "permalink": "https://www.threads.com/@test_username/post/Pp",
      "timestamp": "2024-08-07T10:33:16+0000",
      "username": "test_username"
    }
  }
}
```

## Limitations

- No notifications when the media was created by a private account (`replies`, `mentions`).
- `delete` and `publish` need a public account, or a private one that authenticated to your app.
- Apps need Advanced Access (tech providers) or Live Mode (non-tech providers) to receive notifications.

## Full Event Reference

See [Webhooks for Threads](https://developers.facebook.com/documentation/threads/webhooks).
