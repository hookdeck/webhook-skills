# Mighty Networks Webhooks Overview

## What Are Mighty Networks Webhooks?

Mighty Networks (the community platform) can push real-time HTTP notifications to your server when
events occur in your Network, instead of you polling the API. You set a webhook URL and an API key
in your Network settings and choose which events to receive. Mighty Networks then sends an HTTP
`POST` with a JSON body for each event.

Requests are **not signed**. Each one carries `Authorization: Bearer <your API key>`, the key you
configured with the webhook, so you can confirm it came from Mighty Networks. Delivery is
asynchronous (background jobs), so there can be a slight delay after the event.

## Delivery Format

```
POST /your-webhook-endpoint
Content-Type: application/json
Accept: application/json
Authorization: Bearer YOUR_CONFIGURED_API_KEY

{
  "event_id": "abc123-uuid",
  "event_timestamp": "2024-01-15T10:30:00Z",
  "event_type": "PostCreatedHook",
  "payload": { "id": 12345, "title": "Example post title", "space_id": 111 }
}
```

| Field | Meaning |
|-------|---------|
| `event_id` | UUID of the event. Use it to dedupe retries. |
| `event_timestamp` | When the event happened (ISO 8601) |
| `event_type` | Event name **with a `Hook` suffix** (`PostCreatedHook`) |
| `payload` | Event-specific object; its shape is on each event's reference page |

The reference pages name events without the suffix (`PostCreated`). Strip a trailing `Hook` from
`event_type` before dispatching, and the names below work as written.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `MemberJoined` | A member joins a space | Welcome message, CRM sync |
| `MemberLeft` | A member leaves a space | Churn tracking |
| `MemberPurchased` | A member purchases a plan | Grant access, record revenue |
| `MemberPurchaseRequested` | A member requests to purchase a plan | Approve or follow up |
| `MemberSubscriptionRenewed` | A member's subscription is renewed | Extend access |
| `MemberSubscriptionCanceled` | A member cancels their subscription | Win-back flow |
| `MemberPlanChanged` | A member upgrades or downgrades | Adjust entitlements |
| `MemberRemovedFromPlan` | A member is removed from a plan | Revoke access |
| `PostCreated` | A post is created in a space | Moderation, cross-posting |
| `PostUpdated` | A post is updated | Re-sync content |
| `CommentCreated` | A comment is created on a post or other commentable content | Notifications |
| `RsvpCreated` | An RSVP is created for an event | Attendee lists |
| `EventCreated` | An event is scheduled in a space | Calendar sync |
| `EventCanceled` | An event is canceled | Notify attendees |
| `ReportedContentCreated` | A post, comment or chat is reported | Moderation queue |

## All Events

The webhook spec (`https://api.mn.co/webhooks/v1/spec.json`) defines 48 events:

- **Members**: `MemberJoined`, `MemberJoinRequested`, `MemberLeft`, `MemberReturned`, `MemberUpdated`,
  `MemberPurchased`, `MemberPurchaseRequested`, `MemberSubscriptionRenewed`,
  `MemberSubscriptionCanceled`, `MemberPlanChanged`, `MemberRemovedFromPlan`, `MemberTagAdded`,
  `MemberTagRemoved`, `MemberBadgeAdded`, `MemberBadgeRemoved`, `MemberAmbassadorLeveledUp`,
  `InviteRequested`
- **Courses**: `MemberCourseProgressStarted`, `MemberCourseProgressUpdated`,
  `MemberCourseProgressCompleted`, `MemberLessonCompleted`
- **Content**: `PostCreated`, `PostUpdated`, `ArticleCreated`, `ArticleUpdated`, `QuestionCreated`,
  `QuestionUpdated`, `CommentCreated`, `ReactionCreated`, `ReactionDeleted`,
  `ReportedContentCreated`
- **Polls**: `MultipleChoicePollCreated`, `MultipleChoicePollUpdated`, `PercentagePollCreated`,
  `PercentagePollUpdated`, `HotColdPollCreated`, `HotColdPollUpdated`
- **Events**: `EventCreated`, `EventUpdated`, `EventCanceled`, `EventInstanceCanceled`,
  `RsvpCreated`, `RsvpUpdated`, `RsvpDeleted`
- **Other**: `CustomFieldResponseCreated`, `CustomFieldResponseUpdated`,
  `CustomFieldResponseRemoved`, `GiftLeaderboardUpdated`

## Payload Examples

- `MemberJoined` / `MemberLeft`: `member` (id, email, first_name, last_name, ...), `space_id`,
  `network_id` (plus `reason` on `MemberLeft`)
- `MemberPurchased`: `member`, `plan`, `purchase`
- `PostCreated` / `PostUpdated`: post `id`, `title`, `summary`, `creator_id`, `space_id`,
  `permalink`, `status`
- `CommentCreated`: comment `id`, `text`, `author_id`, `space_id`, `targetable_id`,
  `targetable_type`
- `RsvpCreated`: `id`, `status`, `event`, `member`

## Delivery and Retries

- Respond with any `2xx` (200, 201, 202, 204, ...) within **10 seconds**.
- Any non-2xx response, timeout or connection error is a failure; the webhook is retried up to
  5 times over a period of several hours. Handlers must be idempotent: dedupe on `event_id`.
- Repeated consecutive failures trip a **circuit breaker** that pauses delivery to your endpoint.
  After a cooldown Mighty Networks probes it again and resumes once it answers `2xx`.
- Acknowledge fast and process asynchronously if the work is slow.

## Full Event Reference

For every event and its payload schema, see
[Mighty Networks webhooks](https://docs.mightynetworks.com/api/webhooks).
