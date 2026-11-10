# Ordering During Recovery

Neither the providers nor Hookdeck guarantee webhook delivery order. Shopify documents that it doesn't guarantee ordering within a topic or across topics for the same resource. Stripe documents that it doesn't guarantee delivery in the order events were generated. Recovery can still get **close** to original order, and these choices decide how close.

Handlers must be correct regardless of order. See [webhook-handler-patterns › ordering](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/ordering.md).

## What each recovery operation does to order

| Operation | Walks the backlog | How events are queued for delivery | Effect on order |
|-----------|-------------------|------------------------------------|-----------------|
| **Bulk request replay** (standby runbook) | Oldest first (`created_at` ascending), 100 requests per batch | Each replayed event gets its own queue timestamp when it's created; the 100 replays in a batch run concurrently | Close to original order. Disorder is bounded by roughly one batch of 100 |
| **Delivery-rate limit** on the destination | — | Queue drains lowest timestamp first | Preserves the order events were queued in |
| **Unpause** | Oldest first, up to 5,000 events per batch | Every event in a batch gets the **same** queue timestamp; ties break on a random event ID | Order shuffled within each block of up to 5,000 |
| **Bulk event retry** | Oldest first, up to 5,000 events per batch | Same as unpause: one shared timestamp per batch | Order shuffled within each block of up to 5,000 |
| **Live traffic on the same connection** | — | Queued as it arrives | New live events interleave with, or overtake, an older backlog |

## How to stay close to original order

1. **Replay into a dedicated recovery connection.** No live traffic shares its queue, so nothing overtakes the backlog. This is the main reason the standby runbook uses a separate recovery lane.
2. **Throttle with the delivery rate, not with pause.** A rate limit keeps the queue's order. Pause then unpause turns it into blocks of up to 5,000.
3. **Use a low concurrency cap if order matters a lot.** `--rate-limit 1 --rate-limit-period concurrent` on the recovery destination means only one delivery is in flight at a time, so events are processed in queue order. It's slow; calculate the drain time (backlog size × average handler latency) before choosing it.
4. **Retries reorder.** A delivery that fails and retries lands later than its neighbours. A retry rule with short intervals limits how far it drifts. A handler that returns `2xx` and processes asynchronously avoids retries caused by slowness.
5. **Replay one window, once.** Overlapping or repeated replays deliver old events again after newer ones.

## What "good enough" looks like

For most commerce flows, **approximately oldest first, plus a handler that tolerates the rest** is the target:

- Compare a version or timestamp on the resource (Shopify `updated_at`, the `X-Shopify-Triggered-At` header, Stripe object state) and ignore stale updates.
- Or treat the webhook as a signal: fetch the current state of the order or payment from the provider's API and act on that.

Both are covered in the handler-side reference linked above.
