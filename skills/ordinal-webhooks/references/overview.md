# Ordinal Webhooks Overview

## What Are Ordinal Webhooks?

[Ordinal](https://www.tryordinal.com/) (tryordinal.com) is a social-media content
planning, approval and scheduling platform for marketing teams — LinkedIn and X posts,
campaigns, approval workflows and comment threads. Ordinal webhooks push workspace
activity to your endpoint as JSON `POST` requests so you can sync posts into a CRM or data
warehouse, route approval requests into Slack, or alert on a failed publish.

Ordinal webhooks are **not** Bitcoin Ordinals / inscriptions, Ordinal Stats, or Ordinal
Labs. There is **no official Ordinal npm or pip SDK**.

Official docs:
- [Webhooks introduction](https://docs.tryordinal.com/integrations/webhooks/introduction)
- [Event types](https://docs.tryordinal.com/integrations/webhooks/event-types)

## Event Payload Structure

Every delivery uses exactly this envelope:

```json
{
  "type": "post.published",
  "data": { "...": "event-specific payload" },
  "createdAt": "2025-02-26T14:30:00.000Z"
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event type string (see the table below) |
| `data` | Event-specific payload. **One key**, whose name depends on the event family |
| `createdAt` | ISO 8601 timestamp of when the event was emitted |

Respond with **any 2xx** status to acknowledge receipt.

### There Is No Event Id

**No top-level event id and no delivery-id header are documented.** If you need dedupe,
derive a key yourself — for example `type` + the resource id inside `data` + `createdAt`.
That is a suggestion for your own bookkeeping, **not** a documented idempotency key.

### What Is Not Documented

Do not fabricate values for any of these. Ordinal's docs do not specify:

- Retry policy or number of delivery attempts
- Delivery timeout
- Ordering guarantees
- Source IP ranges (**there is no IP allowlist to enumerate**)
- `User-Agent` string
- Any Ordinal-specific delivery header
- A test or `ping` event (there is none)

## All Event Types (20 topics)

`data` carries **one key per family**. Reading `data.post` on a comment or approval event
returns `undefined` — this is the single most common Ordinal handler bug.

| Event | `data` key | Triggered when | Common use cases |
|-------|-----------|----------------|------------------|
| `social_profile.connected` | `data.profile` | A profile is connected to the workspace | Track connected channels, onboarding |
| `social_profile.disconnected` | `data.profile` | A profile is disconnected from the workspace | Alert on lost publishing capability |
| `social_profile.reconnect_needed` | `data.profile` | A profile needs reconnecting (e.g. token expired) | Page the social team before scheduled posts fail |
| `post.created` | `data.post` | A new post is created | Mirror drafts into a content calendar |
| `post.scheduled` | `data.post` | A post is scheduled for publishing | Populate a publishing calendar |
| `post.rescheduled` | `data.post` | A post's scheduled time is changed | Keep calendar entries in sync |
| `post.unscheduled` | `data.post` | A post is unscheduled | Remove calendar entries |
| `post.published` | `data.post` | A post is successfully published to a channel | Record the live `postUrl`, kick off reporting |
| `post.publish_failed` | `data.post` | A post fails to publish | Alerting and retry workflows (`data.post.error`) |
| `post.archived` | `data.post` | A post is archived (moved to trash) | Soft-delete the mirrored record |
| `post.permanently_deleted` | `data.post` | A post is permanently deleted | Hard-delete the mirrored record |
| `post.content.edited` | `data.post` | A post's content is edited | Re-sync copy; see the debounce note below |
| `post.comment.created` | `data.comment` | A post-level comment is added | Route feedback into Slack |
| `post.inline_comment.created` | `data.comment` | An inline (text-anchored) comment is added | Route inline review notes |
| `post.approval.requested` | `data.approval` | Someone requests approval from users for a post | Create review tasks for approvers |
| `post.approval.approved` | `data.approval` | An approver grants approval for a post | Close review tasks, unblock scheduling |
| `campaign.approval.requested` | `data.approval` | Someone requests approval for a campaign | Campaign-level sign-off routing |
| `campaign.approval.approved` | `data.approval` | An approver grants approval for a campaign | Campaign-level sign-off tracking |
| `invite.created` | `data.invite` | A user is invited to the workspace | Seat/provisioning tracking |
| `invite.accepted` | `data.invite` | A user accepts a workspace invite | Provision the user in your own systems |

### Behaviour Notes From the Docs

- **`post.content.edited` is debounced per post** and fires roughly **5 minutes after**
  edits. It includes the latest content for **all channels**, so treat it as "here is the
  current state", not "here is a diff".
- **`post.inline_comment.created` fires once per comment, including replies in a
  thread** — each reply is its own event, with the thread in `data.comment.thread`. The
  docs state this for inline comments only; they don't say whether replies to post-level
  comments also emit `post.comment.created`.
- **`invite.created`:** if the invitee already has an account they are added directly and
  **no email is sent**.

### Mixed Separators — Use the Exact Strings

`publish_failed`, `reconnect_needed`, `permanently_deleted` and `inline_comment` use
**underscores inside an otherwise dot-separated name**:

| Correct | Wrong |
|---------|-------|
| `post.publish_failed` | `post.publish.failed`, `post.publishFailed` |
| `social_profile.reconnect_needed` | `social_profile.reconnect.needed`, `socialProfile.reconnectNeeded` |
| `post.permanently_deleted` | `post.permanently.deleted`, `post.deleted` |
| `post.inline_comment.created` | `post.inline.comment.created`, `post.inlineComment.created` |
| `post.content.edited` | `post.content_edited`, `post.edited` |

## Documented Payloads

### `post.published`

```json
{
  "type": "post.published",
  "data": {
    "post": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Q4 Product Launch Announcement",
      "channel": "LinkedIn",
      "campaign": {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "name": "Launch 2025",
        "startDate": "2025-01-01",
        "endDate": "2025-12-31"
      },
      "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
      "postUrl": "https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678",
      "profile": {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Acme Inc",
        "detail": "acme-inc"
      },
      "workspace": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "slug": "acme",
        "name": "Acme Inc"
      },
      "publishedBy": {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@example.com"
      },
      "publishedAt": "2025-02-26T14:30:00.000Z"
    }
  },
  "createdAt": "2025-02-26T14:30:00.000Z"
}
```

`campaign` and `postUrl` **may be `null`** — `url` is the Ordinal app link, `postUrl` is
the live link on the social channel.

### `post.publish_failed`

`data.post` carries `id`, `title`, `channel`, **`error`** (e.g. `"Token expired"`),
`campaign` (nullable), `url`, `profile`, `scheduledPublishAt`, `workspace`, `createdBy`,
and **`failedAt`**. Note it is `createdBy` here, not `publishedBy`.

### `post.created`

`data.post` carries `id`, `title`, `status` (e.g. `"draft"`), **`channels`** (an array,
e.g. `["LinkedIn"]` — plural, unlike `post.published`'s singular `channel`), `campaign`
(nullable), `url`, `labels[]` (`{id, name, color, backgroundColor}`), `workspace`,
`createdBy`, `createdAt`, plus per-channel content blocks:

- **`linkedIn`** (nullable): `{ profile, copy, assets[] }`
- **`x`** (nullable): `{ profile, tweets: [{ copy, assets }] }`

### `social_profile.connected`

`data.profile` carries `id`, `name`, `detail`, `channel`, `profileImageUrl`, `workspace`,
`connectedBy`, `connectedAt`.

### `post.approval.requested`

`data.approval` carries `post` (`{id, title, url}`), `campaign`, `workspace`,
`createdApprovals[]` and `existingApprovals[]`. Each approval entry:
`{id, isBlocking, message, dueDate, createdAt, status: "Requested", user, requestedBy}`.

`campaign.approval.requested` uses the **same `data.approval` key** but has `campaign`
instead of `post`.

### `post.comment.created`

`data.comment` carries `id`, `message`, `post` (`{id, title, url}`), `workspace`,
`createdBy`, `createdAt`.

### `invite.accepted`

`data.invite` carries `id`, `email`, `createdAt`, `acceptedAt`, `invitedBy`, `acceptedBy`,
`workspace`.

## Full Event Reference

For any event whose fields are not listed above, read its own docs page rather than
guessing. Page URLs replace both dots and underscores with hyphens:

`https://docs.tryordinal.com/integrations/webhooks/<type>` — e.g.
[`post-publish-failed`](https://docs.tryordinal.com/integrations/webhooks/post-publish-failed),
[`social-profile-reconnect-needed`](https://docs.tryordinal.com/integrations/webhooks/social-profile-reconnect-needed),
[`post-inline-comment-created`](https://docs.tryordinal.com/integrations/webhooks/post-inline-comment-created).

The canonical list lives at
[docs.tryordinal.com/integrations/webhooks/event-types](https://docs.tryordinal.com/integrations/webhooks/event-types).
