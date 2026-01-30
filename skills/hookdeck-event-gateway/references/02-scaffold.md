# Scaffolding Your Webhook Handler

## Getting Provider Example Code

For provider-specific examples with signature verification, install the relevant skill:

```bash
npx skills add hookdeck/webhook-skills --skill stripe-webhooks
npx skills add hookdeck/webhook-skills --skill shopify-webhooks
npx skills add hookdeck/webhook-skills --skill github-webhooks
```

Each skill includes runnable examples in `examples/express/`, `examples/nextjs/`, and `examples/fastapi/`.

## Defense-in-Depth: Double Verification

When using Hookdeck Event Gateway, you can verify signatures at two levels:

1. **Hookdeck verifies the provider signature** - Configured via source verification
2. **Your app verifies the Hookdeck signature** - Ensures requests came through Hookdeck

This provides defense-in-depth:
- If someone bypasses Hookdeck, provider verification fails
- If someone spoofs Hookdeck headers, Hookdeck signature fails

### Adding Hookdeck Verification

After Hookdeck verifies the provider signature, it forwards the request with its own signature:

```javascript
const crypto = require('crypto');

function verifyHookdeckSignature(rawBody, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(hash)
  );
}

app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // Step 1: Verify Hookdeck signature
    const hookdeckSignature = req.headers['x-hookdeck-signature'];
    if (!verifyHookdeckSignature(req.body, hookdeckSignature, process.env.HOOKDECK_WEBHOOK_SECRET)) {
      return res.status(401).send('Invalid Hookdeck signature');
    }
    
    // Step 2: (Optional) Also verify provider signature for defense-in-depth
    // Hookdeck already verified this, but you can double-check
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send('Invalid Stripe signature');
    }
    
    // Process the event...
    res.json({ received: true });
  }
);
```

## Environment Variables

Your handler needs these environment variables:

```bash
# .env

# Hookdeck webhook secret (from destination settings)
HOOKDECK_WEBHOOK_SECRET=your_hookdeck_secret

# Provider secrets (optional for defense-in-depth)
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_secret
STRIPE_SECRET_KEY=sk_test_your_api_key
```

**Getting your Hookdeck webhook secret:**
1. Go to Dashboard → Destinations
2. Click on your destination
3. Find **Webhook Secret** in the settings

## Handler Template

Here's a complete handler template with Hookdeck verification:

```javascript
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();

function verifyHookdeckSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(hash)
    );
  } catch {
    return false;
  }
}

app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // Verify Hookdeck signature
    const hookdeckSig = req.headers['x-hookdeck-signature'];
    if (!verifyHookdeckSignature(req.body, hookdeckSig, process.env.HOOKDECK_WEBHOOK_SECRET)) {
      console.error('Invalid Hookdeck signature');
      return res.status(401).send('Unauthorized');
    }
    
    // Parse payload
    const event = JSON.parse(req.body.toString());
    
    // Handle event
    console.log(`Received ${event.type}:`, event.id);
    
    switch (event.type) {
      case 'payment_intent.succeeded':
        // Handle payment success
        break;
      // Add more event handlers...
    }
    
    res.json({ received: true });
  }
);

app.listen(3000, () => {
  console.log('Webhook handler running on port 3000');
});
```

## Framework Guides

For framework-specific patterns (body parsing, middleware ordering), see:

- `webhook-handler-patterns/references/frameworks/express.md`
- `webhook-handler-patterns/references/frameworks/nextjs.md`
- `webhook-handler-patterns/references/frameworks/fastapi.md`

## Next Steps

After scaffolding your handler:
1. [03-listen.md](03-listen.md) - Start local development with Hookdeck CLI

## Full Documentation

- [Hookdeck Signature Verification](https://hookdeck.com/docs/signature-verification)
