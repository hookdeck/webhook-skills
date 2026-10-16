# Fanvue Webhooks Overview

## What Are Fanvue Webhooks?

When something happens in a creator's account, on a checkout link, in your app's
billing or inside one of your experiences, Fanvue sends a signed HTTPS `POST` to
your endpoint. Use webhooks to react as it happens instead of polling the API.
Each delivery is signed with `X-Fanvue-Signature`; see
[verification.md](verification.md).

## Event Families

| Family | Topics | Who receives the event |
|---|---|---|
| Creator | `creator.*` | Every app the creator has authorised with the topic's scope and that has a destination for the topic. `creator.experience_subscription.*` go only to the app that owns the experience and the creator's own destinations |
| Checkout | `checkout_link.*`, `payout.*` | Destinations registered for the topic by the creator, or by an app the creator authorised with `read:creator` |
| App | `app.*` | Your app only, for its own sales and for priced actions inside its experiences. Not available through `POST /webhooks/subscriptions` |
| Legacy | Flat names such as `purchase.new` | Same fan-out as Creator. **Deprecated**: each has a `creator.*` replacement |

Creator and Legacy events fan out: if two apps are authorised by the same creator
with `read:creator`, both receive `creator.payment.succeeded`.

## Event Envelope

Every Creator, Checkout and App event uses the same envelope:

```json
{
  "id": "f1a2b3c4-1111-4a2b-9c3d-aaaaaaaaaaaa",
  "type": "creator.payment.succeeded",
  "timestamp": "2026-06-09T08:39:33.139Z",
  "data": { "object": "payment", "...": "resource fields" }
}
```

| Field | Description |
|---|---|
| `id` | Event id. Identical on every retry of the same event, so it is the deduplication key |
| `type` | The topic. Route on this field, never on a header |
| `timestamp` | ISO 8601 time the delivery was built. A retry carries a new `timestamp` and the same `id` |
| `data` | The resource. `data.object` names its type (`payment`, `subscription`, `refund`, `dispute`, `message`, `payout`, ...). Fields inside `data` are snake_case |

**Legacy events have no envelope.** The body is the event's own camelCase fields
with an `eventId` appended, and nothing in it names the topic.

## Event Catalogue

Status per the [Fanvue event catalogue](https://api.fanvue.com/docs/webhooks/event-catalog):

- **live**: delivered
- **reserved**: accepted by manifest validation but never delivered
- **deprecated**: still delivered, but migrate to the replacement

### Creator (`creator.*`)

| Event | Status | Notes |
|---|---|---|
| `creator.payment.succeeded` | live | Every fan payment; `data.source` says what was bought (e.g. `tip`, `subscription` for renewals). Money is in minor units |
| `creator.payment.pending` | reserved | Never delivered |
| `creator.payment.failed` | reserved | Never delivered |
| `creator.reward.created` | live | |
| `creator.reward.reversed` | live | |
| `creator.subscription.activated` | live | |
| `creator.subscription.renewed` | live | |
| `creator.subscription.deactivated` | live | |
| `creator.subscription.cancel_at_period_end_changed` | live | |
| `creator.experience_subscription.activated` | live | Owning app and the creator's own destinations only |
| `creator.experience_subscription.deactivated` | live | Owning app and the creator's own destinations only |
| `creator.message.received` | live | |
| `creator.message.sent` | live | Never carries broadcasts |
| `creator.message.mass_sent` | live | Broadcasts. Subscribing to `sent` alone misses every one |
| `creator.message.read` | live | |
| `creator.message.read_by_fan` | live | |
| `creator.message.deleted` | live | |
| `creator.message.reaction` | live | |
| `creator.chat.marked_unread` | live | Conversation state, not message state |
| `creator.follow.created` | live | `data.id` is always `null`; identity is the (follower, creator) pair |
| `creator.post.liked` | live | |
| `creator.post.commented` | live | |
| `creator.refund.created` | live | |
| `creator.dispute.flagged` | live | |
| `creator.dispute.created` | live | |
| `creator.fan.status_changed` | live | |
| `creator.fan.presence_changed` | live | |

### Checkout (`checkout_link.*`, `payout.*`)

| Event | Status | Notes |
|---|---|---|
| `checkout_link.payment.pending` | live | |
| `checkout_link.payment.succeeded` | live | |
| `checkout_link.payment.failed` | live | |
| `checkout_link.subscription.activated` | live | |
| `checkout_link.subscription.deactivated` | live | |
| `checkout_link.subscription.cancel_at_period_end_changed` | live | |
| `checkout_link.refund.created` | live | |
| `checkout_link.refund.requested` | live | |
| `checkout_link.refund.rejected` | reserved | Never delivered |
| `checkout_link.refund.failed` | reserved | Never delivered |
| `checkout_link.dispute.flagged` | live | |
| `checkout_link.dispute.created` | live | |
| `checkout_link.installment.paid` | live | |
| `checkout_link.installment.failed` | live | |
| `checkout_link.plan.completed` | live | |
| `payout.paid` | live | Creator-level, not link-scoped. API and manifest only |
| `payout.failed` | live | API and manifest only |

### App (`app.*`)

| Event | Status | Notes |
|---|---|---|
| `app.payment.pending` | live | |
| `app.payment.succeeded` | live | |
| `app.payment.failed` | live | |
| `app.subscription.activated` | live | |
| `app.subscription.cancel_at_period_end_changed` | live | |
| `app.subscription.deactivated` | reserved | Never emitted. Read live state from `GET /apps/{appUuid}/subscription-status` |
| `app.refund.created` | live | |
| `app.payment.refunded` | deprecated | Alias of `app.refund.created` |
| `app.dispute.flagged` | live | |
| `app.dispute.created` | live | |
| `app.experience.action.payment.pending` | live | |
| `app.experience.action.payment.succeeded` | live | |
| `app.experience.action.payment.failed` | live | |
| `app.experience.action.refund.created` | live | |
| `app.experience.action.dispute.flagged` | live | |
| `app.experience.action.dispute.created` | live | |

### Legacy flat events

| Event | Status | Replacement |
|---|---|---|
| `follow.new` | deprecated | `creator.follow.created` |
| `purchase.new` | deprecated | `creator.payment.succeeded` |
| `tip.new` | deprecated | `creator.payment.succeeded` with `source: "tip"` |
| `subscription.new` | deprecated | `creator.subscription.activated` (the legacy body bundles the subscription and its payment; the replacement sends them as separate events) |
| `subscription.renewed` | deprecated | `creator.subscription.renewed` |
| `subscription.cancelled` | deprecated | `creator.subscription.cancel_at_period_end_changed` |
| `subscription.expired` | deprecated | `creator.subscription.deactivated` |
| `message.received` | deprecated | `creator.message.received` |
| `message.read` | deprecated | `creator.message.read` |
| `message.reaction` | reserved | `creator.message.reaction` |
| `post.like` | reserved | `creator.post.liked` |
| `post.comment` | reserved | `creator.post.commented` |

Subscribe to a legacy event **or** its `creator.*` replacement, never both, or you
count each occurrence twice.

## Delivery Behaviour

Source: [Delivery and idempotency](https://api.fanvue.com/docs/webhooks/delivery-and-idempotency)

| Guarantee | Behaviour |
|---|---|
| Delivery | **At least once.** Duplicates are possible and expected |
| Ordering | **Not guaranteed.** Two related events can arrive in either order |
| Transport | HTTP `POST`, `Content-Type: application/json` |
| Success | Any `2xx`. Any other status, or a timeout, is a failure and is retried |
| Retries | With backoff. Every attempt carries the same `id`; once retries are exhausted the event is not delivered again and there is no manual replay |

Return `2xx` as soon as you have persisted the event, then process it
asynchronously. Doing the work first risks a timeout, a retry and a duplicate.

### Auto-disable, no backfill

A destination that keeps failing is **disabled** and stops receiving events.

- Events tab / manifest: the app owner is notified in the Developer Area; re-enable with the row's toggle.
- API subscriptions: no notification, and `GET /webhooks/subscriptions` has no enabled flag. Detect silence yourself, then delete and recreate.

Events that occurred while a destination was disabled are **not backfilled**.
Reconcile the gap from the relevant API endpoints.

Return `2xx` for event types you don't recognise. A `4xx` counts as a failure and
walks an otherwise healthy endpoint towards auto-disable.

### Deduplication

Use `event.id` (envelope) or `event.eventId` (legacy) as the idempotency key,
with two exceptions:

- **Legacy `message.read`** reuses one `eventId` for every read receipt in a conversation. Key on `${eventId}:${timestamp}`. (`creator.message.read` and `creator.message.read_by_fan` are not affected.)
- **`app.subscription.*`**: the same transition repeated for one subscription reuses the earlier id. Pair `id` with `timestamp`, or read current state from `GET /apps/{appUuid}/subscription-status`.

## Full Documentation

- [Fanvue webhooks](https://api.fanvue.com/docs/webhooks)
- [Event catalogue](https://api.fanvue.com/docs/webhooks/event-catalog)
- [Delivery and idempotency](https://api.fanvue.com/docs/webhooks/delivery-and-idempotency)
