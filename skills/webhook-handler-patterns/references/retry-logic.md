# Retry Logic Patterns

## Provider Retry Schedules

Different providers have different retry behaviors. Understanding these helps you design resilient handlers.

### Stripe

- Retries up to **3 days** with exponential backoff
- Intervals: 1 hour, 2 hours, 4 hours, 8 hours, etc.
- Dashboard shows delivery attempts and allows manual retry
- [Stripe Retry Documentation](https://docs.stripe.com/webhooks#retries)

### Shopify

- Retries for up to **48 hours**
- 19 retry attempts with increasing intervals
- Starts at 10 seconds, increases to hours
- [Shopify Retry Documentation](https://shopify.dev/docs/apps/build/webhooks)

### GitHub

- Retries up to **3 times** within a short window
- Short intervals between retries
- Failed webhooks visible in delivery log
- [GitHub Retry Documentation](https://docs.github.com/en/webhooks)

## Designing Handlers for Retries

### Rule 1: Always Return Quickly

Providers timeout requests after 5-30 seconds. If your handler takes longer:

```javascript
// BAD - synchronous processing
app.post('/webhooks', async (req, res) => {
  await sendEmail(event);        // 2s
  await updateDatabase(event);   // 1s
  await callExternalAPI(event);  // 5s (might timeout)
  res.status(200).send('OK');
});

// GOOD - acknowledge and process async
app.post('/webhooks', async (req, res) => {
  await queue.add('process-webhook', event);
  res.status(200).send('OK');  // Return immediately
});
```

### Rule 2: Be Idempotent

Retries mean duplicate deliveries. Your handler must handle them safely:

```javascript
app.post('/webhooks', async (req, res) => {
  const event = parseEvent(req);
  
  // Check if already processed
  const processed = await db.query(
    'SELECT 1 FROM processed_events WHERE id = $1',
    [event.id]
  );
  
  if (processed.rows.length > 0) {
    // Already processed, but return 200 to stop retries
    return res.status(200).send('OK');
  }
  
  await processEvent(event);
  res.status(200).send('OK');
});
```

### Rule 3: Use Appropriate Status Codes

| Situation | Status Code | Effect |
|-----------|-------------|--------|
| Successfully processed | `200` | No retry |
| Invalid signature | `401` | No retry |
| Invalid payload | `400` | No retry |
| Temporary failure | `503` | Provider retries |
| Processing error | `500` | Provider retries |
| Rate limited | `429` | Provider retries with backoff |

```javascript
app.post('/webhooks', async (req, res) => {
  // Permanent failure - don't retry
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }
  
  try {
    await processEvent(event);
    res.status(200).send('OK');
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      // Bad data, don't retry
      return res.status(400).send('Invalid data');
    }
    
    if (err.code === 'DATABASE_UNAVAILABLE') {
      // Temporary, please retry
      return res.status(503).send('Database unavailable');
    }
    
    // Unknown error, retry
    res.status(500).send('Processing failed');
  }
});
```

## Exponential Backoff

When implementing your own retry logic (e.g., for failed background jobs), use exponential backoff:

### Basic Exponential Backoff

```javascript
function getRetryDelay(attempt, baseDelay = 1000, maxDelay = 3600000) {
  // 2^attempt * baseDelay, with jitter
  const exponentialDelay = Math.pow(2, attempt) * baseDelay;
  const jitter = Math.random() * 1000;
  
  return Math.min(exponentialDelay + jitter, maxDelay);
}

// attempt 1: ~2s
// attempt 2: ~4s
// attempt 3: ~8s
// attempt 4: ~16s
// ...
```

### With Job Queue (Bull/BullMQ)

```javascript
const Queue = require('bull');

const webhookQueue = new Queue('webhooks', {
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000  // Base delay
    }
  }
});

webhookQueue.process(async (job) => {
  const { event } = job.data;
  await processEvent(event);
});

// Add job
await webhookQueue.add('process', { event });
```

## Circuit Breaker Pattern

Prevent cascading failures when dependencies are down:

```javascript
const CircuitBreaker = require('opossum');

const options = {
  timeout: 3000,               // Fail if operation takes > 3s
  errorThresholdPercentage: 50, // Open circuit if 50% fail
  resetTimeout: 30000          // Try again after 30s
};

const breaker = new CircuitBreaker(processEvent, options);

breaker.on('open', () => {
  console.warn('Circuit breaker opened - too many failures');
});

breaker.on('halfOpen', () => {
  console.log('Circuit breaker testing...');
});

breaker.on('close', () => {
  console.log('Circuit breaker closed - service recovered');
});

app.post('/webhooks', async (req, res) => {
  try {
    await breaker.fire(event);
    res.status(200).send('OK');
  } catch (err) {
    if (breaker.opened) {
      // Circuit is open, ask for retry later
      return res.status(503).send('Service temporarily unavailable');
    }
    res.status(500).send('Processing failed');
  }
});
```

## Handling Provider Timeouts

If a provider times out before receiving your response, they'll retry even though you processed successfully. Handle this with idempotency:

```javascript
app.post('/webhooks', async (req, res) => {
  const event = parseEvent(req);
  
  // Start processing
  const startTime = Date.now();
  
  try {
    // Set a timeout warning
    const timeoutWarning = setTimeout(() => {
      console.warn(`Processing ${event.id} taking too long (${Date.now() - startTime}ms)`);
    }, 10000);
    
    await processEvent(event);
    
    clearTimeout(timeoutWarning);
    
    // Check if we're close to timeout
    if (Date.now() - startTime > 25000) {
      console.warn(`Processing ${event.id} completed but may timeout`);
    }
    
    res.status(200).send('OK');
  } catch (err) {
    // Log processing time for debugging
    console.error(`Processing ${event.id} failed after ${Date.now() - startTime}ms:`, err);
    res.status(500).send('Failed');
  }
});
```

## Monitoring Retry Patterns

Track retry metrics to identify issues:

```javascript
const metrics = require('./metrics');

app.post('/webhooks', async (req, res) => {
  const deliveryAttempt = parseInt(req.headers['stripe-webhook-attempt'] || '1');
  
  metrics.increment('webhook.received', {
    provider: 'stripe',
    eventType: event.type,
    attempt: deliveryAttempt
  });
  
  if (deliveryAttempt > 1) {
    console.log(`Retry attempt ${deliveryAttempt} for event ${event.id}`);
    metrics.increment('webhook.retry', {
      provider: 'stripe',
      eventType: event.type,
      attempt: deliveryAttempt
    });
  }
  
  // Process...
});
```
