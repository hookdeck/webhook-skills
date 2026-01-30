# Idempotency Patterns

## Why Idempotency Matters

Webhook providers guarantee **at-least-once delivery**, not exactly-once. This means:

- The same event may be delivered multiple times
- Network issues can cause retries even after successful processing
- Your handler must safely handle duplicate events

Without idempotency, you might:
- Charge a customer twice
- Send duplicate emails
- Create duplicate records
- Corrupt data with duplicate operations

## Using Event IDs for Deduplication

Every webhook provider includes a unique event ID. Use this to detect duplicates.

### Stripe
```javascript
const eventId = event.id; // evt_1234567890
```

### Shopify
```javascript
const eventId = req.headers['x-shopify-webhook-id'];
```

### GitHub
```javascript
const eventId = req.headers['x-github-delivery']; // GUID
```

## Database-Level Deduplication

The most reliable approach uses your database to track processed events.

### Pattern 1: Processed Events Table

```sql
CREATE TABLE processed_webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(100),
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payload JSONB
);
```

```javascript
async function handleWebhook(event) {
  const eventId = event.id;
  
  // Check if already processed
  const existing = await db.query(
    'SELECT 1 FROM processed_webhook_events WHERE event_id = $1',
    [eventId]
  );
  
  if (existing.rows.length > 0) {
    console.log(`Event ${eventId} already processed, skipping`);
    return { status: 'duplicate' };
  }
  
  // Process the event
  await processEvent(event);
  
  // Mark as processed
  await db.query(
    'INSERT INTO processed_webhook_events (event_id, event_type, payload) VALUES ($1, $2, $3)',
    [eventId, event.type, event]
  );
  
  return { status: 'processed' };
}
```

### Pattern 2: Transactional Processing

For critical operations, use database transactions:

```javascript
async function handlePaymentWebhook(event) {
  const eventId = event.id;
  
  await db.transaction(async (trx) => {
    // Lock to prevent race conditions
    const existing = await trx.query(
      'SELECT 1 FROM processed_webhook_events WHERE event_id = $1 FOR UPDATE SKIP LOCKED',
      [eventId]
    );
    
    if (existing.rows.length > 0) {
      return; // Already processed
    }
    
    // Process payment
    await trx.query(
      'UPDATE orders SET status = $1 WHERE payment_intent_id = $2',
      ['paid', event.data.object.id]
    );
    
    // Record that we processed this event
    await trx.query(
      'INSERT INTO processed_webhook_events (event_id, event_type) VALUES ($1, $2)',
      [eventId, event.type]
    );
  });
}
```

### Pattern 3: Idempotency Keys for Side Effects

For operations with external side effects (emails, API calls), use idempotency keys:

```javascript
async function sendOrderConfirmation(orderId, eventId) {
  // Use event ID as idempotency key
  const idempotencyKey = `order-confirmation-${orderId}-${eventId}`;
  
  const alreadySent = await redis.get(idempotencyKey);
  if (alreadySent) {
    console.log('Confirmation already sent');
    return;
  }
  
  await emailService.send({
    to: order.email,
    template: 'order-confirmation',
    data: order
  });
  
  // Mark as sent with TTL (e.g., 7 days)
  await redis.set(idempotencyKey, '1', 'EX', 7 * 24 * 60 * 60);
}
```

## Handling Race Conditions

When multiple instances of your application receive the same webhook simultaneously:

### Use Database Constraints

```sql
-- Primary key prevents duplicate inserts
INSERT INTO processed_webhook_events (event_id, event_type)
VALUES ($1, $2)
ON CONFLICT (event_id) DO NOTHING
RETURNING event_id;
```

```javascript
const result = await db.query(
  'INSERT INTO processed_webhook_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
  [eventId]
);

if (result.rows.length === 0) {
  // Another instance already processed this
  return;
}

// We won the race, process the event
await processEvent(event);
```

### Use Distributed Locks

For complex processing that can't use transactions:

```javascript
const lock = await redis.set(
  `webhook-lock:${eventId}`,
  '1',
  'NX', // Only set if not exists
  'EX', 300 // Expire after 5 minutes
);

if (!lock) {
  console.log('Another instance is processing this event');
  return;
}

try {
  await processEvent(event);
} finally {
  await redis.del(`webhook-lock:${eventId}`);
}
```

## Cleanup and Retention

Don't keep processed events forever:

```sql
-- Clean up events older than 30 days
DELETE FROM processed_webhook_events
WHERE processed_at < NOW() - INTERVAL '30 days';
```

Or use TTL in Redis:

```javascript
await redis.set(`processed:${eventId}`, '1', 'EX', 30 * 24 * 60 * 60);
```

## Testing Idempotency

Always test that your handlers are idempotent:

```javascript
test('handles duplicate events idempotently', async () => {
  const event = createTestEvent('payment_intent.succeeded');
  
  // Process the event twice
  await handleWebhook(event);
  await handleWebhook(event);
  
  // Verify side effects only happened once
  const orders = await db.query('SELECT * FROM orders WHERE payment_id = $1', [event.data.object.id]);
  expect(orders.rows.length).toBe(1);
  
  const emails = emailMock.getSentEmails();
  expect(emails.length).toBe(1);
});
```
