# Knock Webhooks Overview

## What Are Knock Webhooks?

Knock is a notifications infrastructure platform. **Outbound webhooks** let your application receive HTTP POST callbacks whenever a Knock-tracked notification moves through its lifecycle (sent, delivered, bounced, read, clicked, etc.) or whenever a Knock resource (workflow, email layout, translation, etc.) changes.

This skill covers receiving and verifying Knock outbound webhooks — it does **not** cover Knock's inbound source events (where your app sends events into Knock to trigger workflows).

## Why Verify?

Webhook endpoints are public URLs. Knock signs every request with HMAC-SHA256 and a per-endpoint shared secret so your handler can prove the payload came from Knock and was not modified in transit. See [verification.md](verification.md) for details.

## Event Taxonomy

Knock publishes 23 event types across 6 categories.

### Message lifecycle (13 events)

These fire as a notification moves through delivery and recipient interaction:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.sent` | Knock sent the message to a downstream channel | Audit log, send analytics |
| `message.delivered` | Channel confirmed delivery to the recipient | Mark as delivered in your DB |
| `message.delivery_attempted` | A delivery attempt was made (success or failure) | Track per-attempt diagnostics |
| `message.undelivered` | Channel failed to deliver after retries | Surface failure to operators |
| `message.bounced` | Recipient address bounced (typically email) | Suppress further sends to address |
| `message.seen` | Recipient saw the message in feed/inbox | Engagement analytics |
| `message.unseen` | "Seen" state was reverted | Mirror UI state changes |
| `message.read` | Recipient marked as read | Conversation/threading state |
| `message.unread` | "Read" state was reverted | Mirror UI state changes |
| `message.archived` | Recipient archived the message | Sync archived state |
| `message.unarchived` | "Archived" state was reverted | Sync archived state |
| `message.interacted` | Recipient interacted with the message | Track CTAs, custom actions |
| `message.link_clicked` | Recipient clicked a tracked link | Click-through analytics |

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

All Knock webhook events share this shape:

```json
{
  "id": "01H...",
  "type": "message.delivered",
  "created_at": "2026-05-14T12:34:56.789Z",
  "data": {
    "id": "msg_2fG...",
    "channel_id": "...",
    "recipient": { "id": "user_123" },
    "workflow": "comment-created",
    "status": "delivered"
    // ...full Message object for message.* events
  },
  "event_data": {
    // event-specific metadata; null when not applicable
    // examples: failure reason for undelivered, URL for link_clicked,
    // commit id for workflow.committed
  }
}
```

The shape of `data` depends on the event category — message events contain a Message object, workflow events contain a Workflow object, and so on.

## Delivery Semantics

- **At-least-once:** Knock may deliver the same event more than once. Use the top-level `id` field as your idempotency key.
- **Retries:** Up to 8 retry attempts on any non-2xx response. Return `200` (or any 2xx) as soon as the signature is verified and the event is durably enqueued — do downstream work asynchronously.
- **Ordering:** Not guaranteed. Use `created_at` if you need to reconcile state.

## Full Event Reference

For the complete authoritative list of events and per-event payload shapes, see the [Knock Outbound Webhooks Event Types documentation](https://docs.knock.app/developer-tools/outbound-webhooks/event-types).
