# Error Handling Patterns

## Response Codes That Matter

Webhook providers use your HTTP response code to decide what to do next:

| Code | Meaning | Provider Action |
|------|---------|-----------------|
| `200-299` | Success | Mark as delivered, no retry |
| `400` | Bad request | Usually no retry (permanent failure) |
| `401/403` | Auth error | Usually no retry |
| `404` | Not found | Usually no retry |
| `408` | Timeout | Retry |
| `429` | Rate limited | Retry after delay |
| `500-599` | Server error | Retry with backoff |

### Key Principle

**Return 200 quickly, process asynchronously.**

If processing takes more than a few seconds, the provider may timeout and retry, causing duplicate processing.

```javascript
app.post('/webhooks', async (req, res) => {
  // Verify signature
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Quick validation
  const event = parseEvent(req);
  if (!event) {
    return res.status(400).send('Invalid payload');
  }
  
  // Return 200 immediately
  res.status(200).send('OK');
  
  // Process asynchronously
  processEventAsync(event).catch(err => {
    console.error('Background processing failed:', err);
  });
});
```

## Graceful Degradation

Design handlers to fail gracefully when dependencies are unavailable.

### Pattern 1: Circuit Breaker

```javascript
const CircuitBreaker = require('opossum');

const dbBreaker = new CircuitBreaker(async (query) => {
  return await db.query(query);
}, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});

app.post('/webhooks', async (req, res) => {
  try {
    await dbBreaker.fire('INSERT INTO events ...');
    res.status(200).send('OK');
  } catch (err) {
    if (err.message === 'Breaker is open') {
      // Database is down, ask for retry
      return res.status(503).send('Service temporarily unavailable');
    }
    throw err;
  }
});
```

### Pattern 2: Fallback Queue

When primary processing fails, queue for later:

```javascript
app.post('/webhooks', async (req, res) => {
  const event = parseEvent(req);
  
  try {
    await processEvent(event);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Processing failed, queueing for retry:', err);
    
    // Queue for later processing
    await queue.add('webhook-retry', {
      event,
      attempt: 1,
      error: err.message
    });
    
    // Still return 200 - we've accepted responsibility
    res.status(200).send('Queued');
  }
});
```

## Logging Webhook Failures

Good logging is essential for debugging webhook issues.

### What to Log

```javascript
app.post('/webhooks', async (req, res) => {
  const requestId = req.headers['x-request-id'] || uuid();
  const eventId = req.body?.id;
  const eventType = req.body?.type;
  
  console.log({
    level: 'info',
    message: 'Webhook received',
    requestId,
    eventId,
    eventType,
    provider: 'stripe'
  });
  
  try {
    await processEvent(req.body);
    
    console.log({
      level: 'info',
      message: 'Webhook processed successfully',
      requestId,
      eventId,
      eventType,
      duration: Date.now() - startTime
    });
    
    res.status(200).send('OK');
  } catch (err) {
    console.error({
      level: 'error',
      message: 'Webhook processing failed',
      requestId,
      eventId,
      eventType,
      error: err.message,
      stack: err.stack
    });
    
    res.status(500).send('Processing failed');
  }
});
```

### Structured Logging

Use structured logging for easier searching:

```javascript
const logger = require('pino')();

logger.info({
  webhook: {
    provider: 'stripe',
    eventId: event.id,
    eventType: event.type,
    deliveryAttempt: req.headers['stripe-webhook-attempt']
  }
}, 'Processing webhook');
```

## Dead Letter Queues

For events that repeatedly fail, use a dead letter queue (DLQ).

### Pattern: DLQ with Retry Tracking

```javascript
const MAX_RETRIES = 5;

async function processWithRetry(event, attempt = 1) {
  try {
    await processEvent(event);
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      // Move to dead letter queue
      await dlq.add('failed-webhooks', {
        event,
        error: err.message,
        attempts: attempt,
        failedAt: new Date()
      });
      
      // Alert the team
      await alerting.send({
        severity: 'high',
        message: `Webhook failed after ${attempt} attempts`,
        eventId: event.id,
        error: err.message
      });
      
      return;
    }
    
    // Retry with exponential backoff
    const delay = Math.pow(2, attempt) * 1000;
    await queue.add('webhook-retry', { event, attempt: attempt + 1 }, {
      delay
    });
  }
}
```

### Reviewing Failed Events

Build tools to inspect and replay DLQ events:

```javascript
// List failed events
app.get('/admin/dlq', async (req, res) => {
  const failed = await dlq.getJobs(['failed']);
  res.json(failed.map(job => ({
    id: job.id,
    eventId: job.data.event.id,
    eventType: job.data.event.type,
    error: job.data.error,
    failedAt: job.data.failedAt
  })));
});

// Replay a failed event
app.post('/admin/dlq/:jobId/replay', async (req, res) => {
  const job = await dlq.getJob(req.params.jobId);
  
  // Move back to main queue
  await queue.add('webhook-process', job.data.event);
  await job.remove();
  
  res.json({ status: 'replayed' });
});
```

## Timeout Handling

Providers typically timeout after 5-30 seconds. Handle long operations carefully.

### Pattern: Acknowledge and Process

```javascript
app.post('/webhooks', async (req, res) => {
  // Validate and acknowledge immediately
  const event = validateEvent(req);
  if (!event) {
    return res.status(400).send('Invalid');
  }
  
  // Record that we received this event
  await db.query(
    'INSERT INTO webhook_events (id, payload, status) VALUES ($1, $2, $3)',
    [event.id, event, 'received']
  );
  
  // Acknowledge receipt
  res.status(200).send('OK');
  
  // Process in background
  setImmediate(async () => {
    try {
      await processEvent(event);
      await db.query(
        'UPDATE webhook_events SET status = $1 WHERE id = $2',
        ['processed', event.id]
      );
    } catch (err) {
      await db.query(
        'UPDATE webhook_events SET status = $1, error = $2 WHERE id = $3',
        ['failed', err.message, event.id]
      );
    }
  });
});
```

## Health Checks

Expose health endpoints for monitoring:

```javascript
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    queue: await checkQueue(),
    timestamp: new Date()
  };
  
  const healthy = Object.values(checks).every(c => c === true || c instanceof Date);
  
  res.status(healthy ? 200 : 503).json(checks);
});
```
