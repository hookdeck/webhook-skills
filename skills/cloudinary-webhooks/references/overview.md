# Cloudinary Webhooks Overview

## What Are Cloudinary Webhooks?

**Cloudinary** is a media management platform (image and video upload, storage,
transformation, and delivery). It sends webhook **notifications** to a URL you
register — the **Notification URL** — so your app learns about asset and account
events in real time instead of polling. Notifications fire for asynchronous
operations (uploads processed in the background, eager transformations,
moderation) and for changes to assets and folders.

## How Delivery Works

1. Cloudinary POSTs a JSON notification to your registered HTTPS Notification URL.
2. Every request carries two headers used for authentication:
   - `x-cld-signature` — a hex digest of the raw body signed with your account
     API Secret.
   - `x-cld-timestamp` — the unix timestamp (seconds) that was included in the
     signed material.
3. Your endpoint verifies the signature against the **raw body**, processes the
   notification, and returns **HTTP 2xx**.
4. If your endpoint fails or is unreachable, Cloudinary retries the notification.

See [verification.md](verification.md) for the signature scheme.

## Notification Types (`notification_type`)

The event kind is in the body's `notification_type` field:

| `notification_type` | Triggered When | Common Use Cases |
|---------------------|----------------|------------------|
| `upload` | An asset finished uploading (async/eager or large uploads) | Store the `public_id`/`secure_url`, advance a processing step |
| `eager` | Eager (asynchronous) transformations finished generating | Mark derived assets ready, cache URLs |
| `delete` | One or more assets were deleted | Reconcile your own asset records |
| `rename` | An asset was renamed (its `public_id` changed) | Update stored references |
| `moderation` | A moderation result became available | Approve/reject assets, notify reviewers |
| `resource_tags_changed` | Tags were added to or removed from assets | Re-index or re-categorize assets |
| `resource_context_changed` | Contextual metadata changed on assets | Sync metadata |
| `resource_metadata_changed` | Structured metadata changed on assets | Sync metadata |
| `access_control_changed` | An asset's access control changed | Update authorization state |
| `create_folder` | A folder was created | Mirror folder structure |
| `delete_folder` | A folder was deleted | Mirror folder structure |
| `move` | Assets were moved | Update stored paths |

The most commonly used types are `upload`, `eager`, `delete`, `rename`,
`moderation`, and `resource_tags_changed`.

## Event Payload Structure

Notifications are JSON. All include a `notification_type` and a `timestamp`; most
asset notifications include `public_id`, `resource_type`, and `version`. A
representative `upload` notification:

```json
{
  "notification_type": "upload",
  "timestamp": "2026-07-28T10:30:00Z",
  "public_id": "sample",
  "version": 1690000000,
  "resource_type": "image",
  "format": "jpg",
  "secure_url": "https://res.cloudinary.com/demo/image/upload/v1690000000/sample.jpg",
  "signature": "..."
}
```

Common fields:

| Field | Description |
|-------|-------------|
| `notification_type` | The notification kind (see table above) |
| `timestamp` | When the notification was generated |
| `public_id` | The asset's identifier (on asset notifications) |
| `resource_type` | `image`, `video`, or `raw` |
| `version` | Asset version number |
| `signature` | A signature Cloudinary also embeds in the body |

> **Authenticate using the headers, not the in-body fields.** The body contains a
> `timestamp` and `signature` too, but the receiver verifies the
> `x-cld-signature` / `x-cld-timestamp` **headers** against the raw body. See
> [verification.md](verification.md).

Type-specific fields (treat defensively — availability varies by operation and
account configuration):

| `notification_type` | Extra fields |
|---------------------|--------------|
| `eager` | `eager` (array of generated transformations) |
| `rename` | `from_public_id`, `to_public_id` |
| `moderation` | `moderation_status`, `moderation_kind` |
| `delete` / `resource_tags_changed` | `resources` (affected assets) |
| `create_folder` / `delete_folder` | `folder_path` |

## Idempotency

Cloudinary may redeliver a notification on retry. Deduplicate so the same
notification is not actioned twice — a good key combines `public_id`, `version`,
and `notification_type`, or the `x-cld-timestamp` plus `public_id`. See
[webhook-handler-patterns / idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Full Documentation

- [Cloudinary notifications](https://cloudinary.com/documentation/notifications)
- [Notification signatures](https://cloudinary.com/documentation/notification_signatures)
- [cloudinary_npm SDK](https://github.com/cloudinary/cloudinary_npm)
