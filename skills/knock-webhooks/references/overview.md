# Knock Webhooks Overview

## What Are Knock Webhooks?

Knock is a notifications infrastructure platform. **Outbound webhooks** let your application receive HTTP POST callbacks whenever a Knock-tracked notification moves through its lifecycle (sent, delivered, bounced, read, clicked, etc.) or whenever a Knock resource (workflow, email layout, translation, etc.) changes.

This skill covers receiving and verifying Knock outbound webhooks — it does **not** cover Knock's inbound source events (where your app sends events into Knock to trigger workflows).

## Why Verify?

Webhook endpoints are public URLs. Knock signs every request with HMAC-SHA256 and a per-endpoint shared secret so your handler can prove the payload came from Knock and was not modified in transit. See [verification.md](verification.md) for details.

## Event Taxonomy

Knock documents 38 event types in five groups: messages, workflow runs, commits, branches and resources. Commit and branch events are only sent on accounts with environments enabled.

### Message lifecycle (14 events)

These fire as a notification moves through delivery and recipient interaction:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.sent` | Knock sent the message to a downstream channel | Audit log, send analytics |
| `message.delivered` | Channel confirmed delivery to the recipient | Mark as delivered in your DB |
| `message.delivery_attempted` | A delivery attempt failed and may be retried (`event_data` has `attempt`, `max_attempts`, `retryable`) | Track per-attempt diagnostics |
| `message.undelivered` | Delivery failed permanently and will not be retried (`event_data.failure_reason` is `fatal_error` or `retries_exhausted`) | Surface failure to operators |
| `message.bounced` | Recipient address bounced (typically email) | Suppress further sends to address |
| `message.complaint` | Recipient reported a delivered email as spam (select email providers only) | Suppress further sends to address |
| `message.seen` | Recipient saw the message in feed/inbox | Engagement analytics |
| `message.unseen` | "Seen" state was reverted | Mirror UI state changes |
| `message.read` | Recipient marked as read | Conversation/threading state |
| `message.unread` | "Read" state was reverted | Mirror UI state changes |
| `message.archived` | Recipient archived the message | Sync archived state |
| `message.unarchived` | "Archived" state was reverted | Sync archived state |
| `message.interacted` | Recipient interacted with the message | Track CTAs, custom actions |
| `message.link_clicked` | Recipient clicked a tracked link | Click-through analytics |

### Workflow recipient run events (3)

| Event | Triggered When |
|-------|----------------|
| `workflow_recipient_run.started` | A workflow run for a single recipient began execution |
| `workflow_recipient_run.completed` | A workflow run for a single recipient completed |
| `workflow_recipient_run.error` | An error occurred during a workflow run for a single recipient |

### Commit events (1)

| Event | Triggered When |
|-------|----------------|
| `commits.promoted` | Commits were promoted into an environment, including a branch merge. `data` is the promote group; Knock says to deduplicate on its `id` |

### Branch events (3)

Sent to webhooks in the branch's parent environment (usually `development`).

| Event | Triggered When |
|-------|----------------|
| `branch.created` | A branch was created |
| `branch.deleted` | A branch was deleted |
| `branch.rebased` | A branch was rebased onto its parent environment |

### Resource events (17)

Knock sends `*.updated` when a resource changes in an environment and `*.committed` when that change is committed (`event_data.commit_id` carries the commit). Promoted commits don't send `*.committed`; subscribe to `commits.promoted` for those. Goals publish on save, so they send only `goal.updated`.

| Resource | Events |
|----------|--------|
| Audiences | `audience.updated`, `audience.committed` |
| Email layouts | `email_layout.updated`, `email_layout.committed` |
| Goals | `goal.updated` |
| Guides | `guide.updated`, `guide.committed` |
| Message types | `message_type.updated`, `message_type.committed` |
| Partials | `partial.updated`, `partial.committed` |
| Reusable requests | `reusable_request.updated`, `reusable_request.committed` |
| Translations | `translation.updated`, `translation.committed` |
| Workflows | `workflow.updated`, `workflow.committed` |

Knock removed `source_event_action.updated` and `source_event_action.committed` from its docs on 2026-10-27: they can't be subscribed to and are no longer sent.

## Event Payload Structure

All Knock webhook events share this base shape (from Knock's documented sample payload):

```json
{
  "__typename": "Event",
  "type": "message.undelivered",
  "created_at": "2026-01-31T17:12:59.958652Z",
  "data": {
    // The entity the event references, e.g. the full Message object for message.* events
  },
  "event_data": {
    "__typename": "EventData",
    "failure_reason": "fatal_error",
    "failure_details": "The message could not be delivered to the provider."
  }
}
```

The shape of `data` depends on the event category — message events contain a Message object, workflow recipient run events a WorkflowRecipientRun, workflow events a Workflow, and so on. `event_data` is `null` for event types that carry no extra context.

There is **no event-level `id`** in the envelope. Each request also carries an `x-knock-event` header (the same value as `type`) and an `x-knock-environment-id` header (the environment the webhook belongs to).

## Delivery Semantics

- **Duplicates:** Knock retries failed deliveries, so the same event can arrive more than once. The payload has no event-level `id`. For `commits.promoted`, deduplicate on the promote group ID (`data.id`), as Knock's docs say. For other events, `type` plus the entity ID repeats on real events (a second `message.read` after `message.unread`, each `message.delivery_attempted`), so write state changes as idempotent upserts. Knock doesn't document whether a retry repeats `created_at`.
- **Retries:** Knock retries non-2xx responses "a handful of times" over a few hours; the exact count and intervals are not fixed. It **never** retries `301`, `302`, `303`, `400`, `401`, `402`, `403`, `404`, or `405`, and on a `429` it tries to respect a well-formed `Retry-After` header. Return `200` (or any 2xx) as soon as the signature is verified and the event is durably enqueued — do downstream work asynchronously, since a timeout also triggers a retry.
- **Ordering:** Knock doesn't document delivery order. Compare `created_at` (or the message's `updated_at`) with the last value you applied before changing state.

## Full Event Reference

For the complete authoritative list of events and per-event payload shapes, see the [Knock Outbound Webhooks Event Types documentation](https://docs.knock.app/developer-tools/outbound-webhooks/event-types).
