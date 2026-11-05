# Instagram Webhooks Overview

## What Are Instagram Webhooks?

Instagram webhooks send real-time notifications to your server when supported activity happens
on an Instagram professional account connected to your app: comments, mentions, story insights,
direct messages and related messaging events. They use Meta's webhook mechanism (a GET
handshake with a verify token, then POSTs signed with `X-Hub-Signature-256`).

## Which API Setup Are You Using?

Field availability, permissions, tokens and some payloads depend on the setup:

| API setup | Token | API host | Account ID used to subscribe |
|-----------|-------|----------|------------------------------|
| Instagram API with Unified Login | Business Integration System User Access Token | `graph.facebook.com` | Instagram professional account ID |
| Instagram API with Instagram Login | Instagram User access token | `graph.instagram.com` | Instagram professional account ID or `/me` |
| Instagram API with Facebook Login | Facebook Page access token | `graph.facebook.com` | Facebook Page ID or `/me` (account must be linked to a Page) |

Instagram messaging can also be built on the Messenger Platform ("Instagram Messaging API"),
which delivers the same `object: "instagram"` messaging payloads.

## Fields and Permissions

| Field | Instagram Login | Facebook Login | Messenger Platform (IG messaging) | Unified Login |
|-------|-----------------|----------------|-----------------------------------|---------------|
| `comments` | `instagram_business_basic`, `instagram_business_manage_comments` | `instagram_basic`, `instagram_manage_comments`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list` | — | `instagram_manage_comments` |
| `live_comments` | same as `comments` | same as `comments` | — | `instagram_manage_comments` |
| `mentions` | Included in `comments` | same as `comments` | — | `instagram_manage_comments` |
| `story_insights` | — | `instagram_basic`, `instagram_manage_insights`, Page permissions | — | `instagram_manage_insights` |
| `messages` | `instagram_business_basic`, `instagram_business_manage_messages` | — | `instagram_basic`, `instagram_manage_messages`, Page permissions | `instagram_manage_messages` |
| `message_reactions` | same as `messages` | — | same as `messages` | `instagram_manage_messages` |
| `messaging_postbacks` | same as `messages` | — | same as `messages` | `instagram_manage_messages` |
| `messaging_referral` | same as `messages` | — | same as `messages` | `instagram_manage_messages` |
| `messaging_seen` | same as `messages` | — | same as `messages` | `instagram_manage_messages` |
| `messaging_optins` | same as `messages` | — | — | — |
| `messaging_handover`, `standby` | same as `messages` | — | same as `messages` | — |
| `message_echoes` | `instagram_business_basic`, `instagram_business_manage_comments` (as listed by Meta) | — | Included in `messages` (`is_echo: true`) | — |
| `messaging_policy_enforcement`, `response_feedback` | — | — | same as `messages` | — |

"Page permissions" = `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`. See
[Instagram webhook fields and permissions](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)
for the authoritative matrix.

## Event Payload Structure

```json
{
  "object": "instagram",
  "entry": [
    { "id": "<IG_ACCOUNT_ID>", "time": 1569262486134, "changes": [ ... ] }
  ]
}
```

- `entry[].id` is your app user's Instagram professional account ID.
- `entry[].time` is when Meta sent the notification.
- An entry has **`changes[]`** for field changes (comments, mentions, insights) or
  **`messaging[]`** for messaging events. Handover-protocol deliveries use `standby[]`.
- Meta may batch up to 1000 updates in one POST; batching isn't guaranteed. Iterate every
  `entry` and every item.
- Some samples on Meta's examples page are wrapped in a top-level JSON array; the messaging
  pages and Meta's general guide show a single object. The examples here accept both.

### `changes[]` events

`comments` / `live_comments`:

```json
{
  "field": "comments",
  "value": {
    "id": "<COMMENT_ID>",
    "from": { "id": "<IGSID>", "username": "<USERNAME>" },
    "text": "<COMMENT_TEXT>",
    "media": { "id": "<MEDIA_ID>", "media_product_type": "<MEDIA_PRODUCT_TYPE>" }
  }
}
```

Instagram Login samples use `value.id`; Unified Login / Facebook Login samples use
`value.comment_id` plus optional `parent_id` and ad fields (`media.ad_id`, `media.ad_title`,
`media.original_media_id`). Read whichever is present.

`mentions` (Facebook / Unified Login only):

```json
{ "field": "mentions", "value": { "media_id": "17918195224117851", "comment_id": "17894227972186120" } }
```

`comment_id` is present only for a mention in a comment.

`story_insights` (from the Graph API Instagram webhooks reference): `value.media_id`,
`impressions`, `reach`, `taps_forward`, `taps_back`, `exits`, `replies`. Counts under 5 are
returned as `-1`. The `story_insights` sample on the Instagram examples page is a copy of the
postback sample, so rely on the reference fields above.

### `messaging[]` events

Every item has `sender.id`, `recipient.id` and `timestamp`. When the account **receives** a
message, `recipient.id` is your account and `sender.id` is the user's Instagram-scoped ID
(IGSID); for a message the account **sends** (echo), they're swapped.

| Key on the item | Field | Notes |
|-----------------|-------|-------|
| `message` | `messages` | `mid`, `text`, `attachments[]`, `is_echo`, `is_deleted`, `is_self`, `is_unsupported`, `quick_reply`, `referral`, `reply_to`; handoffs can carry `admin_text` and `handoff_reason` without `mid` |
| `reaction` | `message_reactions` | `mid`, `action` (`react`/`unreact`), `reaction`, `emoji` |
| `postback` | `messaging_postbacks` | `mid`, `title`, `payload` |
| `referral` | `messaging_referral` | `ref`, `source`, `type: OPEN_THREAD` |
| `read` | `messaging_seen` | `mid` of the message that was seen |
| `message_edit` | (shown on the examples page) | `mid`, `text`, `num_edit` |

Attachment types include `image`, `video`, `audio`, `file`, `ig_post`, `ig_reel`, `reel`,
`story_mention`, `ig_story`; the legacy `share` type is deprecated after February 2026 in
favour of `ig_post`.

## Limitations

- The app must be Live; `comments` and `live_comments` need Advanced Access.
- Media owned by private accounts doesn't trigger comment or mention notifications.
- Live comment notifications stop when the broadcast ends.
- Fields are selected per app, not per account.
- No album IDs, and no ad IDs for media in dynamic ads.
- `story_insights` only covers the first 24 hours.
- Instagram messaging: GIFs and stickers don't trigger a webhook; disappearing media isn't supported.

## Retries

Meta retries failed deliveries immediately, then a few more times with decreasing frequency
over 36 hours, then drops them. Deduplicate (comment ID, message `mid`).

## Full Event Reference

- [Instagram Webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)
- [Webhook fields and permissions](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)
- [Webhook notification examples](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples)
- [Webhooks for Instagram Messaging](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks)
