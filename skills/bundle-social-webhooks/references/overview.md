# bundle.social Webhooks Overview

## What Are bundle.social Webhooks?

bundle.social is an API for scheduling and publishing to social networks
(Instagram, TikTok, YouTube, LinkedIn, Facebook, Threads and more). Instead of
polling for post status, you register an HTTPS endpoint and bundle.social `POST`s
a signed JSON event to it when something happens.

Webhooks are configured at the **organization** level: every team in the
organization shares the same webhook endpoints.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `post.published` | A post finished processing. `data.status` is `POSTED` (live) or `ERROR` (failed permanently) | Mark posts live, store permalinks from `data.externalData`, alert users about failures |
| `post.externally-deleted` | An analytics refresh found the post deleted on TikTok, YouTube, Instagram or Threads. Sent once per post | Mark the post deleted, stop showing analytics |
| `comment.published` | A comment finished processing. `data.status` is `POSTED` or `ERROR` | Confirm or retry first comments |
| `social-account.created` | A user connected a new social account | Sync connected accounts into your app |
| `social-account.updated` | Channel unset, remote disconnection detected, or token refresh failed | Show a "reconnect your account" banner before `deleteOn` |
| `social-account.deleted` | A social account was disconnected or removed | Remove the account from your UI |
| `team.created` | A new team was created | Provision the matching workspace |
| `team.updated` | Team name/avatar changed, or a social account was added to or removed from the team | Keep team metadata and account lists in sync |
| `team.deleted` | A team was deleted | Clean up the matching workspace |

`team.updated` also fires when an account is added to or removed from a team, so if
you already track teams you don't need the social account events.

### Feature-gated events

These only arrive when Direct Messages or Automations is turned on for your
organization (on request). The example handlers don't route them; they're
acknowledged with `200` like any other unknown type.

| Event | Triggered When |
|-------|----------------|
| `comment.received` | Someone else commented on one of the account's posts (Instagram, Facebook, TikTok) |
| `conversation.created` | First message from a new participant, or first private reply |
| `conversation.updated` | Status, preview or participant info changed, or the unread count rose |
| `conversation.read.updated` | You marked a conversation read, or the participant read your messages |
| `conversation.message.created` | New DM, incoming or outgoing |
| `conversation.message.updated` | Message status changed, edited, unsent, or reacted to |

Webhooks with no event filter receive new event types automatically, so always
return `2xx` for types you don't recognise.

## Event Payload Structure

Every delivery has the same envelope:

```json
{
  "type": "post.published",
  "data": {
    "id": "post_abc123",
    "title": "My awesome post",
    "status": "POSTED",
    "postDate": "2026-01-15T10:00:00.000Z",
    "postedDate": "2026-01-15T10:00:02.341Z",
    "teamId": "team_xyz",
    "organizationId": "org_123",
    "error": null,
    "errors": null,
    "errorsVerbose": null,
    "externalData": {
      "INSTAGRAM": { "id": "17900000000000000", "permalink": "https://www.instagram.com/p/example/" }
    },
    "createdAt": "2026-01-14T15:30:00.000Z",
    "updatedAt": "2026-01-15T10:00:02.341Z"
  }
}
```

- **Post events:** `data` is the full post object. A failed post still arrives as
  `post.published`, with `status: "ERROR"` and details in `error`, `errors` or
  `errorsVerbose`. A `POSTED` post can still carry a non-fatal warning in `errors`
  (for example a rejected YouTube thumbnail), so check `status`, not `errors`.
- **`post.externally-deleted`:** `data` is the profile post plus `teamId` and
  `socialAccountType`. `data.postId` is the bundle.social post, or `null` for an
  imported post.
- **Social account events:** `data` is the account (`id`, `type`, `teamId`,
  `username`, `displayName`, `avatarUrl`, `externalId`, `channels`). Tokens and
  secrets are never included.
- **`social-account.updated`:** may include `data.socialAction` with `type`
  (`disconnect-check` or `refresh`) and `details` (`code`, `errorCategory`,
  `providerError`, `scheduledForDeletion`, `deleteOn`). When `deleteOn` is set,
  the account is removed at that time unless the user reconnects.
- **Team events:** `data` is the team (`id`, `name`, `avatarUrl`,
  `organizationId`, `socialAccounts`, ...).

## Delivery and Retries

| Setting | Value |
|---------|-------|
| Method | `POST`, `Content-Type: application/json`, `User-Agent: bundlesocial` |
| Timeout | 15 seconds per request |
| Attempts | 3 (initial + 2 retries) |
| Backoff | Exponential, starting at 30 seconds |
| Concurrency | Up to 50 deliveries at once |
| Auto-disable | After 7 days with no successful delivery |

Events sent while an endpoint is disabled are not replayed. You can resend any
event from the dashboard or API; it's delivered with the same payload.

Duplicates can happen. There's no event ID header, so de-duplicate on `type`,
`data.id`, `data.status` and a timestamp such as `data.updatedAt`.

## Full Event Reference

See [bundle.social's webhook documentation](https://info.bundle.social/api-reference/webhooks).
