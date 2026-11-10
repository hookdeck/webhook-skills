# Ordering During Recovery

Neither the providers nor Hookdeck guarantee webhook delivery order. Shopify documents that it doesn't guarantee ordering within a topic or across topics for the same resource. Stripe documents that it doesn't guarantee delivery in the order events were generated. How you replay a backlog decides how close recovery gets to the original order. The difference is large, so choose deliberately.

Handlers must be correct regardless of order. See [webhook-handler-patterns › ordering](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/ordering.md).

## What each recovery operation does to order

Measured on a live project: numbered webhooks were replayed or retried, and delivery order was compared with the sequence numbers.

| Operation | How events are queued | Measured order |
|-----------|-----------------------|----------------|
| **Ordered replay**: replay requests one at a time, oldest first ([incident-standby.md § 5a](incident-standby.md#5a-ordered-replay)) | Each replay finishes before the next starts, so each event's queue timestamp follows the original order | **Exact.** 40 of 40 in order, zero inversions. Runs at about 4 requests a second (the API rate limit) |
| **Bulk replay** ([§ 5b](incident-standby.md#5b-bulk-replay)) | Requests are taken oldest first in batches of 100, but the 100 replays in a batch run concurrently | **Ordered between batches, random within each batch.** With 150 requests, all of 1–100 arrived before any of 101–150, but within each batch the order was close to a random shuffle (max displacement 87). A backlog under 100 arrives in no particular order |
| **Unpause** | Up to 5,000 held events get one shared queue timestamp per batch | Random within each block of up to 5,000. 20 held events arrived fully shuffled |
| **Bulk event retry** | Same as unpause: one shared timestamp per batch of up to 5,000 | Random within each block. 40 retried events: 310 of 780 pairs out of order |
| **Live traffic on the same connection** | Queued as it arrives | New live events interleave with, or overtake, an older backlog |

The destination's delivery rate drains the queue lowest timestamp first. It keeps whatever order the events were queued in, but it can't repair an order that was already shuffled when they were queued.

## Choosing a replay mode

| Situation | Use |
|-----------|-----|
| Handlers are order-sensitive, or the backlog is small enough to replay at about 4 a second (around 14,000 an hour) | **Ordered replay**, with the recovery destination set to `concurrent` 1 |
| Large backlog, and handlers already tolerate out-of-order events (see the handler patterns) | **Bulk replay**, which is much faster to enqueue |
| Large backlog, order-sensitive, can't wait | Bulk replay, plus reconciliation against the provider's API for order-sensitive resources afterwards |

## How to stay close to original order

1. **Replay into a dedicated recovery connection.** No live traffic shares its queue, so nothing overtakes the backlog. This is why the standby runbook uses a separate recovery lane.
2. **Use ordered replay when order matters.** It is the only mode that queues events in their original order.
3. **Deliver one at a time.** Set the recovery destination to `--rate-limit 1 --rate-limit-period concurrent`, so only one delivery is in flight and the handler processes events in queue order. Throughput is one event per handler round trip; estimate the drain time (backlog × average response time) first.
4. **Throttle with the delivery rate, not with pause.** A rate limit keeps the queue's order. Pause then unpause turns it into shuffled blocks of up to 5,000.
5. **Retries reorder.** A delivery that fails and retries lands after its neighbours. Short retry intervals limit how far it drifts. A handler that returns `2xx` quickly and processes asynchronously avoids retries caused by slowness.
6. **Replay each window once.** Overlapping or repeated replays deliver old events again after newer ones.

## What "good enough" looks like

For most commerce flows, aim for **near-original order plus a handler that tolerates the rest**:

- Compare a version or timestamp on the resource (Shopify `updated_at`, the `X-Shopify-Triggered-At` header, Stripe object state) and ignore stale updates.
- Or treat the webhook as a signal: fetch the current state of the order or payment from the provider's API and act on that.

Both are covered in the handler-side reference linked above.
