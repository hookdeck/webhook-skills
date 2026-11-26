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
   notification, and returns **HTTP 200** within 20 seconds.
4. For any response other than `200 OK`, Cloudinary makes three more attempts,
   listed in its docs as after 3, 6 and 9 minutes. It doesn't disable failing URLs.

See [verification.md](verification.md) for the signature scheme.

## Notification Types (`notification_type`)

The event kind is in the body's `notification_type` field:

| `notification_type` | Triggered When | Common Use Cases |
|---------------------|----------------|------------------|
| `upload` | An asset was uploaded | Store the `public_id`/`secure_url`, advance a processing step |
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
`moderation`, and `resource_tags_changed`. Cloudinary's
[triggers reference](https://cloudinary.com/documentation/admin_api_triggers#event_types_table)
lists all 28 types.

## Event Payload Structure

Notifications are JSON. Every default body includes `notification_type`, and most
end with `notification_context` (when and by whom the action was triggered) and
`signature_key`. Some types also carry `timestamp` and `request_id`. Cloudinary's
example `rename` notification:

```json
{
  "notification_type": "rename",
  "timestamp": "2024-06-25T11:29:10+00:00",
  "request_id": "92d1f2181fa4f5875fcbda17e9a14e10",
  "resource_type": "image",
  "type": "upload",
  "asset_id": "005b8a1aca3783a729054c1533624cbb",
  "asset_folder": "",
  "display_name": "strawberry_milk_splash-qwer129-aslk-srghta",
  "from_public_id": "strawberry_milk_splash-qwer129-aslk-srghta",
  "to_public_id": "strawberry_milk_splash",
  "notification_context": {
    "triggered_at": "2024-06-25T11:29:09.004998Z",
    "triggered_by": {
      "source": "api",
      "id": "614335564976464"
    }
  },
  "signature_key": "614335564976464"
}
```

A trigger with a `payload_template` sends your own rendered JSON instead.

Common fields:

| Field | Description |
|-------|-------------|
| `notification_type` | The notification kind (see table above) |
| `notification_context` | `triggered_at` and `triggered_by` (`source` and an API key or user) |
| `signature_key` | The API key whose secret signed the notification |
| `public_id` / `asset_id` | The asset (top level, or per entry under `resources`) |
| `timestamp` | On some types, such as `upload` and `rename` |

> **Authenticate using the headers.** There is no signature in the body: verify
> the `x-cld-signature` / `x-cld-timestamp` **headers** against the raw body. See
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

Cloudinary may redeliver a notification on retry, and sends no delivery ID.
Deduplicate so the same notification is not actioned twice: combine
`notification_type`, the asset ID and `notification_context.triggered_at`, and
make writes idempotent. See
[webhook-handler-patterns / idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md).

## Full Documentation

- [Cloudinary notifications](https://cloudinary.com/documentation/notifications)
- [Notification signatures](https://cloudinary.com/documentation/notification_signatures)
- [cloudinary_npm SDK](https://github.com/cloudinary/cloudinary_npm)
