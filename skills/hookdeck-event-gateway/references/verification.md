# Hookdeck Signature Verification

## How It Works

When Hookdeck forwards a webhook to your destination, it signs the request using HMAC SHA-256. The signature is included in the `x-hookdeck-signature` header as a base64-encoded string.

The signature is computed as:
```
HMAC-SHA256(raw_request_body, webhook_secret) → base64 encoded
```

## Getting Your Webhook Secret

1. Go to [Hookdeck Dashboard](https://dashboard.hookdeck.com/)
2. Navigate to **Destinations**
3. Click on your destination
4. Find **Webhook Secret** in the settings
5. Click to reveal and copy

Or via CLI:
```bash
hookdeck destination get my-api
```

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyHookdeckSignature(rawBody, signature, secret) {
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

// Express example
app.post('/webhooks',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-hookdeck-signature'];
    
    if (!verifyHookdeckSignature(req.body, signature, process.env.HOOKDECK_WEBHOOK_SECRET)) {
      return res.status(401).send('Invalid signature');
    }
    
    // Process webhook...
    res.json({ received: true });
  }
);
```

### Python

```python
import hmac
import hashlib
import base64

def verify_hookdeck_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    computed = base64.b64encode(
        hmac.new(
            secret.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).digest()
    ).decode('utf-8')
    
    return hmac.compare_digest(computed, signature)

# FastAPI example
@app.post("/webhooks")
async def webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-hookdeck-signature")
    
    if not verify_hookdeck_signature(raw_body, signature, os.environ["HOOKDECK_WEBHOOK_SECRET"]):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Process webhook...
    return {"received": True}
```

### TypeScript (Next.js)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function verifyHookdeckSignature(body: string, signature: string, secret: string): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
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

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-hookdeck-signature');
  
  if (!signature || !verifyHookdeckSignature(body, signature, process.env.HOOKDECK_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  // Process webhook...
  return NextResponse.json({ received: true });
}
```

## Hookdeck Headers

Hookdeck adds several headers to forwarded requests:

| Header | Description |
|--------|-------------|
| `x-hookdeck-signature` | HMAC SHA-256 signature (base64) |
| `x-hookdeck-event-id` | Unique event ID |
| `x-hookdeck-source-id` | Source that received the webhook |
| `x-hookdeck-destination-id` | Destination receiving the webhook |
| `x-hookdeck-connection-id` | Connection routing the event |
| `x-hookdeck-attempt-number` | Delivery attempt number |

### Using Event ID for Idempotency

```javascript
app.post('/webhooks', async (req, res) => {
  const eventId = req.headers['x-hookdeck-event-id'];
  
  // Check if already processed
  const existing = await db.query(
    'SELECT 1 FROM processed_events WHERE hookdeck_event_id = $1',
    [eventId]
  );
  
  if (existing.rows.length > 0) {
    console.log(`Event ${eventId} already processed`);
    return res.json({ received: true, duplicate: true });
  }
  
  // Process and mark as done
  await processWebhook(req.body);
  await db.query(
    'INSERT INTO processed_events (hookdeck_event_id) VALUES ($1)',
    [eventId]
  );
  
  res.json({ received: true });
});
```

## Common Gotchas

### 1. Base64 Encoding

Hookdeck signatures are base64-encoded, not hex:

```javascript
// WRONG - hex encoding
.digest('hex')

// CORRECT - base64 encoding
.digest('base64')
```

### 2. Raw Body Required

Like all webhook signatures, you need the raw body:

```javascript
// WRONG - parsed JSON
app.use(express.json());
app.post('/webhooks', (req, res) => {
  verify(JSON.stringify(req.body), sig, secret); // May fail!
});

// CORRECT - raw body
app.post('/webhooks',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verify(req.body, sig, secret); // Works!
  }
);
```

### 3. Timing-Safe Comparison

Always use timing-safe comparison:

```javascript
// WRONG - vulnerable to timing attacks
if (computed === signature) { ... }

// CORRECT - timing-safe
crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
```

## Debugging Verification Failures

### Log the Details

```javascript
app.post('/webhooks', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-hookdeck-signature'];
  const secret = process.env.HOOKDECK_WEBHOOK_SECRET;
  
  console.log('Signature received:', signature);
  console.log('Secret configured:', secret ? 'yes' : 'NO!');
  console.log('Body type:', typeof req.body);
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  
  const computed = crypto.createHmac('sha256', secret).update(req.body).digest('base64');
  console.log('Computed signature:', computed);
  console.log('Match:', computed === signature);
});
```

### Check Secret Configuration

Ensure the secret matches exactly:
- No leading/trailing whitespace
- Correct secret from Dashboard (not API key)
- Same secret used in all environments

## Full Documentation

- [Hookdeck Signature Verification](https://hookdeck.com/docs/signature-verification)
