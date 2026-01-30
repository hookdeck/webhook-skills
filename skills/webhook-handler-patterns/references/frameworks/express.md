# Express.js Webhook Patterns

## Raw Body Middleware

The most common issue with Express webhook handlers is body parsing. Signature verification requires the raw request body, not parsed JSON.

### The Problem

```javascript
// WRONG - body is already parsed when handler runs
app.use(express.json());

app.post('/webhooks/stripe', (req, res) => {
  // req.body is an object, not raw bytes
  const event = stripe.webhooks.constructEvent(
    req.body,  // FAILS - this is parsed JSON
    req.headers['stripe-signature'],
    secret
  );
});
```

### The Solution

Use `express.raw()` for webhook routes:

```javascript
// Webhook route with raw body FIRST
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    // req.body is a Buffer
    const event = stripe.webhooks.constructEvent(
      req.body,  // Works - raw bytes
      req.headers['stripe-signature'],
      secret
    );
  }
);

// Global JSON parser AFTER (for other routes)
app.use(express.json());
```

## Middleware Ordering

Express middleware runs in the order it's defined. For webhooks, order matters.

### Pattern 1: Route-Specific Middleware

```javascript
const express = require('express');
const app = express();

// Webhook routes with raw body (defined FIRST)
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler
);

app.post('/webhooks/github',
  express.raw({ type: 'application/json' }),
  githubWebhookHandler
);

// Global middleware (defined AFTER webhooks)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Regular API routes
app.post('/api/users', createUserHandler);
```

### Pattern 2: Conditional Body Parsing

```javascript
// Custom middleware that skips JSON parsing for webhooks
function conditionalJsonParser(req, res, next) {
  if (req.path.startsWith('/webhooks/')) {
    // Don't parse webhook bodies
    return next();
  }
  return express.json()(req, res, next);
}

app.use(conditionalJsonParser);

// Webhook routes handle their own body parsing
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  stripeHandler
);
```

### Pattern 3: Router-Based Separation

```javascript
// webhooks.js
const router = express.Router();

// All webhook routes use raw body
router.use(express.raw({ type: 'application/json' }));

router.post('/stripe', stripeHandler);
router.post('/shopify', shopifyHandler);
router.post('/github', githubHandler);

module.exports = router;

// app.js
const webhooksRouter = require('./webhooks');

// Mount webhook router BEFORE global json parser
app.use('/webhooks', webhooksRouter);

// Global parser for everything else
app.use(express.json());
```

## Common Express Gotchas

### 1. Content-Type Filtering

`express.raw()` only captures bodies with matching content types:

```javascript
// Only captures application/json
express.raw({ type: 'application/json' })

// Captures all content types
express.raw({ type: '*/*' })

// Captures multiple types
express.raw({ type: ['application/json', 'application/octet-stream'] })
```

### 2. Body Size Limits

Default body limit is 100KB. Increase for large payloads:

```javascript
app.post('/webhooks/stripe',
  express.raw({
    type: 'application/json',
    limit: '5mb'  // Increase limit
  }),
  handler
);
```

### 3. Verify Middleware Ran

Check that your middleware captured the raw body:

```javascript
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    console.log('Body type:', typeof req.body);
    console.log('Is Buffer:', Buffer.isBuffer(req.body));
    console.log('Body length:', req.body?.length);
    
    if (!Buffer.isBuffer(req.body)) {
      console.error('Raw body middleware did not run!');
      return res.status(500).send('Server configuration error');
    }
    
    // Continue with verification...
  }
);
```

### 4. Error Handling Middleware

Add error handling for webhook routes:

```javascript
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      await handleStripeWebhook(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// Webhook-specific error handler
app.use('/webhooks', (err, req, res, next) => {
  console.error('Webhook error:', err);
  
  // Don't expose internal errors
  res.status(500).json({
    error: 'Webhook processing failed'
  });
});
```

## Complete Express Example

```javascript
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Webhook routes (raw body, defined first)
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json', limit: '5mb' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle event
    console.log('Received event:', event.type);
    
    // Acknowledge quickly
    res.json({ received: true });
    
    // Process asynchronously if needed
    processEventAsync(event).catch(console.error);
  }
);

// Global middleware (after webhooks)
app.use(express.json());

// Regular routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(3000);
```

## Testing Express Webhooks

```javascript
const request = require('supertest');
const crypto = require('crypto');
const app = require('./app');

function generateStripeSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('Stripe Webhook', () => {
  it('processes valid webhooks', async () => {
    const payload = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded' });
    const signature = generateStripeSignature(payload, process.env.STRIPE_WEBHOOK_SECRET);
    
    const response = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);
    
    expect(response.status).toBe(200);
  });
  
  it('rejects invalid signatures', async () => {
    const response = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 'invalid')
      .send('{}');
    
    expect(response.status).toBe(400);
  });
});
```
