# Handling Out-of-Order Webhooks

Webhook delivery order is not guaranteed. Shopify and Stripe both document this, and retries, parallel processing, outage recovery and replays all reorder events. A handler that assumes `orders/create` arrives before `orders/updated`, or `charge.succeeded` before `charge.refunded`, will eventually corrupt data.

Design for three facts:

1. Events for the same resource can arrive in any order.
2. The same event can arrive more than once (see [idempotency.md](idempotency.md)).
3. After an outage, a backlog of old events can arrive minutes or hours late, interleaved with new ones.

## Pattern 1: Fetch current state

Treat the webhook as a signal that something changed, not as the source of truth. Fetch the resource's current state from the provider's API and act on that.

```javascript
app.post('/webhooks/stripe', async (req, res) => {
  const event = verifyAndParse(req);         // signature check first
  await queue.add('sync-payment-intent', { id: event.data.object.id });
  res.status(200).send('OK');
});

// Worker: order of webhooks no longer matters, only the latest state
async function syncPaymentIntent({ id }) {
  const paymentIntent = await stripe.paymentIntents.retrieve(id);
  await db.upsertPaymentIntent(paymentIntent);
}
```

- **Pros:** simple, and always converges on the correct state.
- **Cons:** one API call per webhook. Watch the provider's rate limits at peak, and debounce bursts for the same resource ID.

## Pattern 2: Ignore stale updates

Store a version or timestamp with each resource, and only apply an event if it is newer than what you have.

```javascript
async function applyOrderUpdate(order) {
  // updated_at comes from the provider's payload, not from your clock
  const result = await db.query(
    `UPDATE orders
       SET status = $1, total = $2, source_updated_at = $3
     WHERE shop_order_id = $4
       AND (source_updated_at IS NULL OR source_updated_at < $3)`,
    [order.status, order.total, order.updated_at, order.id]
  );
  if (result.rowCount === 0) {
    // Either a stale event (ignore it) or the order doesn't exist yet (see Pattern 3)
  }
}
```

Good version sources:

- **Shopify:** the resource's `updated_at`, or the `X-Shopify-Triggered-At` header.
- **Stripe:** don't use the event's `created`. Stripe advises against it for ordering. Prefer Pattern 1, or a state machine (Pattern 4).
- **Your own sequence numbers:** if the provider includes a version or sequence field, use that.

The comparison must happen atomically, in the same `UPDATE ... WHERE`, or under a row lock. Check-then-write races when two deliveries for the same resource run concurrently.

## Pattern 3: Handle "child before parent"

An update, refund or fulfilment can arrive before the create event. Choose one approach:

- **Upsert:** create the record from whatever event arrives first, then fill in fields as later events arrive.
- **Fetch the parent:** on an unknown parent ID, fetch it from the provider's API (Pattern 1) and create it.
- **Retry later:** return a non-`2xx` status so the provider or Hookdeck retries later. Use this sparingly. It adds load during a surge and relies on the parent arriving within the retry window.

## Pattern 4: State machines that only move forward

For lifecycle resources (order: `pending → paid → fulfilled → refunded`), define the allowed transitions and ignore events that would move the state backwards.

```javascript
const ORDER_STATE_RANK = { pending: 0, paid: 1, fulfilled: 2, refunded: 3, cancelled: 3 };

function shouldApply(currentState, incomingState) {
  return ORDER_STATE_RANK[incomingState] > ORDER_STATE_RANK[currentState];
}
```

## After an outage

A recovery backlog arrives approximately oldest first. Events delivered live after the fix may arrive before older backlog events for the same resource. Patterns 1, 2 and 4 make that safe. For how Hookdeck keeps a recovery backlog close to its original order, see [bfcm-webhook-playbook › ordering](https://github.com/hookdeck/webhook-skills/blob/main/skills/bfcm-webhook-playbook/references/ordering.md).
