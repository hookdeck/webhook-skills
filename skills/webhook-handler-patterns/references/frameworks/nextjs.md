# Next.js Webhook Patterns

## App Router Route Handlers

Next.js 13+ App Router uses Route Handlers for API endpoints. Webhooks work well with this pattern.

### Basic Route Handler

```typescript
// app/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Get raw body as text (for signature verification)
  const body = await request.text();
  
  // Get headers
  const signature = request.headers.get('stripe-signature');
  
  // Verify and process...
  
  return NextResponse.json({ received: true });
}
```

### Reading the Raw Body

Unlike Express, Next.js doesn't pre-parse the body. You can read it as text or bytes:

```typescript
// As text (string)
const body = await request.text();

// As bytes (ArrayBuffer)
const buffer = await request.arrayBuffer();
const body = Buffer.from(buffer);

// As JSON (parsed - DON'T use for signature verification)
const json = await request.json();  // ❌ Can't verify signature
```

## Runtime Configuration

Some webhook operations require Node.js APIs (like `crypto`). Configure the runtime:

```typescript
// app/webhooks/stripe/route.ts

// Force Node.js runtime (not Edge)
export const runtime = 'nodejs';

// Disable body size limit for large payloads
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  // Can now use Node.js crypto
  const crypto = require('crypto');
  // ...
}
```

### Edge Runtime Limitations

If using Edge runtime, these APIs are unavailable:
- `crypto.createHmac()` - Use Web Crypto API instead
- `Buffer` - Use `Uint8Array`
- Node.js-specific modules

```typescript
// Edge-compatible signature verification
export const runtime = 'edge';

async function verifySignatureEdge(body: string, signature: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(body)
  );
  
  const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  return computedSignature === signature;
}
```

## Common Next.js Gotchas

### 1. Don't Call request.json() First

Once you consume the body, you can't read it again:

```typescript
// WRONG
export async function POST(request: NextRequest) {
  const json = await request.json();  // Consumes body
  const text = await request.text();  // Returns empty string!
}

// CORRECT
export async function POST(request: NextRequest) {
  const text = await request.text();  // Get raw body first
  const json = JSON.parse(text);       // Then parse manually
}
```

### 2. Route File Location

Webhook endpoints must be in the correct location:

```
app/
├── webhooks/
│   ├── stripe/
│   │   └── route.ts    → POST /webhooks/stripe
│   ├── shopify/
│   │   └── route.ts    → POST /webhooks/shopify
│   └── github/
│       └── route.ts    → POST /webhooks/github
```

### 3. HTTP Methods

Route handlers export functions named after HTTP methods:

```typescript
// Handles POST requests
export async function POST(request: NextRequest) {}

// Handles GET requests
export async function GET(request: NextRequest) {}

// Webhooks only need POST
```

### 4. Response Timing

Return responses quickly to avoid provider timeouts:

```typescript
export async function POST(request: NextRequest) {
  const body = await request.text();
  
  // Verify signature
  if (!verifySignature(body, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  // Parse event
  const event = JSON.parse(body);
  
  // Return quickly
  const response = NextResponse.json({ received: true });
  
  // Process asynchronously (won't block response)
  processEventAsync(event).catch(console.error);
  
  return response;
}
```

## Complete Next.js Example

```typescript
// app/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Get raw body for signature verification
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  // Log for debugging
  console.log(`Received ${event.type} event: ${event.id}`);

  // Handle specific events
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Payment succeeded:', paymentIntent.id);
      // await fulfillOrder(paymentIntent);
      break;

    case 'customer.subscription.created':
      const subscription = event.data.object as Stripe.Subscription;
      console.log('Subscription created:', subscription.id);
      // await provisionAccess(subscription);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
```

## Pages Router (Legacy)

For Next.js 12 or Pages Router, use API routes:

```typescript
// pages/api/webhooks/stripe.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { buffer } from 'micro';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Disable body parsing to get raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  // Get raw body using micro
  const buf = await buffer(req);
  const signature = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Handle event...
  console.log('Received:', event.type);

  res.json({ received: true });
}
```

## Testing Next.js Webhooks

```typescript
// __tests__/webhooks/stripe.test.ts
import { POST } from '@/app/webhooks/stripe/route';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

function createMockRequest(body: string, signature: string): NextRequest {
  return new NextRequest('http://localhost/webhooks/stripe', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature,
    },
    body,
  });
}

function generateSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('Stripe Webhook', () => {
  it('processes valid webhooks', async () => {
    const payload = JSON.stringify({
      id: 'evt_test',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test' } }
    });
    const signature = generateSignature(payload, process.env.STRIPE_WEBHOOK_SECRET!);
    
    const request = createMockRequest(payload, signature);
    const response = await POST(request);
    
    expect(response.status).toBe(200);
  });
});
```
