# Knock Webhooks Overview

## What Are Knock Webhooks?

Knock is a notifications infrastructure platform. **Outbound webhooks** let your application receive HTTP POST callbacks whenever a Knock-tracked notification moves through its lifecycle (sent, delivered, bounced, read, clicked, etc.) or whenever a Knock resource (workflow, email layout, translation, etc.) changes.

This skill covers receiving and verifying Knock outbound webhooks — it does **not** cover Knock's inbound source events (where your app sends events into Knock to trigger workflows).

## Why Verify?

Webhook endpoints are public URLs. Knock signs every request with HMAC-SHA256 and a per-endpoint shared secret so your handler can prove the payload came from Knock and was not modified in transit. See [verification.md](verification.md) for details.

## Event Taxonomy

Knock publishes 27 event types across 7 categories.

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

### Workflow events (2)

| Event | Triggered When |
|-------|----------------|
| `workflow.updated` | A workflow draft was updated |
| `workflow.committed` | A workflow was committed to an environment |

### Email layout events (2)

| Event | Triggered When |
|-------|----------------|
| `email_layout.updated` | An email layout draft was updated |
| `email_layout.committed` | An email layout was committed to an environment |

### Translation events (2)

| Event | Triggered When |
|-------|----------------|
| `translation.updated` | A translation draft was updated |
| `translation.committed` | A translation was committed to an environment |

### Source event action events (2)

| Event | Triggered When |
|-------|----------------|
| `source_event_action.updated` | A source event action draft was updated |
| `source_event_action.committed` | A source event action was committed to an environment |

### Partial events (2)

| Event | Triggered When |
|-------|----------------|
| `partial.updated` | A partial draft was updated |
| `partial.committed` | A partial was committed to an environment |

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

- **At-least-once:** Knock may deliver the same event more than once. The payload has no event-level `id`, so build an idempotency key from `type`, the entity in `data` (`data.id` for message events), and `created_at`.
- **Retries:** Knock retries non-2xx responses "a handful of times" over a few hours; the exact count and intervals are not fixed. It **never** retries `301`, `302`, `303`, `400`, `401`, `402`, `403`, `404`, or `405`, and on a `429` it tries to respect a well-formed `Retry-After` header. Return `200` (or any 2xx) as soon as the signature is verified and the event is durably enqueued — do downstream work asynchronously, since a timeout also triggers a retry.
- **Ordering:** Not guaranteed. Use `created_at` if you need to reconcile state.

## Full Event Reference

For the complete authoritative list of events and per-event payload shapes, see the [Knock Outbound Webhooks Event Types documentation](https://docs.knock.app/developer-tools/outbound-webhooks/event-types).
