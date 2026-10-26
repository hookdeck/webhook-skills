# Canny Webhooks Overview

## What Are Canny Webhooks?

[Canny](https://canny.io) is a product feedback platform. With webhooks, your server is notified of Canny events as they happen: if a user creates a new post, Canny sends a request to your server. Every request is signed following the Standard Webhooks specification so you can confirm Canny sent it.

You set up webhooks in **Your Subdomain > Settings > API**.

## Which Canny Webhook Events Are There?

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `post.created` | A new post is created | Create a ticket, notify a channel |
| `post.edited` | A post is edited | Sync changes to your tracker |
| `post.deleted` | A post is deleted | Remove the linked item |
| `post.status_changed` | A post's status is changed | Notify voters, update a roadmap |
| `post.tag_added` | A post is tagged | Route by tag |
| `post.tag_removed` | A post's tag is removed | Undo tag-based routing |
| `post.jira_issue_linked` | A Jira issue is linked to a post | Mirror links |
| `post.jira_issue_unlinked` | A Jira issue is unlinked from a post | Mirror unlinks |
| `comment.created` | A new portal comment is created | Alert the team |
| `comment.edited` | A portal comment is edited | Sync edits |
| `comment.deleted` | A portal comment is deleted | Remove the mirrored comment |
| `vote.created` | A user votes on a post | Update demand counts |
| `vote.deleted` | A user unvotes on a post | Update demand counts |

## What Does a Canny Webhook Payload Look Like?

Every event has the same envelope:

| Field | Description |
|-------|-------------|
| `created` | When the event was created, ISO 8601 |
| `object` | The object the event is about |
| `objectType` | The type of object in `object` (for example `post`) |
| `type` | The event type, for example `post.created` |

```json
{
  "created": "2017-07-15T22:11:00.000Z",
  "object": {
    "id": "6a2889c586d7b8843bf4cf05",
    "author": { "id": "6a2889c586d7b8843bf4cf07", "name": "Sally Doe", "email": "test@test.test", "userID": "1234" },
    "board": { "id": "6a2889c586d7b8843bf4cf01", "name": "Feature Requests" },
    "commentCount": 10,
    "details": "Test post details",
    "score": 72,
    "status": "in progress",
    "title": "An awesome feature request",
    "url": "https://your-company.canny.io/admin/board/feature-requests/p/post-title"
  },
  "objectType": "post",
  "type": "post.created"
}
```

Canny's docs show only the post object in full. Treat the fields of comment and vote objects as something to confirm against a real delivery. The body has no event ID, so dedupe on the `webhook-id` header.

## Full Event Reference

See [Canny's webhook documentation](https://developers.canny.io/api-reference) (Webhooks > Event types).
