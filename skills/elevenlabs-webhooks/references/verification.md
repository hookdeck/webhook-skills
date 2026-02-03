# ElevenLabs Signature Verification

## How It Works

ElevenLabs uses HMAC-SHA256 signature verification with a custom header format to ensure webhook authenticity:

1. **Header Format**: `ElevenLabs-Signature: t=timestamp,v0=signature`
2. **Signed Payload**: `timestamp.raw_request_body`
3. **Algorithm**: HMAC-SHA256
4. **Encoding**: Hexadecimal

## Manual Implementation

```javascript
const crypto = require('crypto');

function verifyElevenLabsWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    throw new Error('No signature header provided');
  }

  // Parse the signature header
  const elements = signatureHeader.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.substring(2);
  const signatures = elements
    .filter(e => e.startsWith('v0='))
    .map(e => e.substring(3));

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid signature header format');
  }

  // Verify timestamp is within tolerance (30 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampAge = Math.abs(currentTime - parseInt(timestamp));

  if (timestampAge > 1800) { // 30 minutes
    throw new Error('Webhook timestamp too old');
  }

  // Create the signed payload
  const signedPayload = `${timestamp}.${rawBody}`;

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Timing-safe comparison
  const isValid = signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      );
    } catch {
      // Different lengths = not equal
      return false;
    }
  });

  if (!isValid) {
    throw new Error('Invalid webhook signature');
  }

  return true;
}
```

## Common Gotchas

1. **Raw Body Required**
   - You MUST use the raw request body for signature verification
   - Don't parse JSON before verifying
   - Express: Use `express.raw()` middleware
   - Next.js: Disable body parsing in route config
   - FastAPI: Access `request.body()` directly

2. **Timestamp Validation**
   - ElevenLabs uses a 30-minute tolerance window
   - Reject webhooks with timestamps outside this window
   - This prevents replay attacks

3. **Header Case Sensitivity**
   - The header name is `ElevenLabs-Signature` (capital E, capital L, capital S)
   - Some frameworks lowercase headers - check for both cases

4. **Multiple Signatures**
   - The header may contain multiple `v0=` signatures
   - Validate if ANY signature matches (not all)

## Framework-Specific Examples

### Express.js
```javascript
app.post('/webhooks/elevenlabs',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['elevenlabs-signature'] ||
                     req.headers['ElevenLabs-Signature'];

    try {
      verifyElevenLabsWebhook(req.body, signature, process.env.WEBHOOK_SECRET);
      // Process webhook...
      res.sendStatus(200);
    } catch (error) {
      console.error('Webhook verification failed:', error.message);
      res.status(400).send('Invalid signature');
    }
  }
);
```

### Next.js (App Router)
```typescript
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('elevenlabs-signature') ||
                   req.headers.get('ElevenLabs-Signature');

  try {
    verifyElevenLabsWebhook(rawBody, signature, process.env.WEBHOOK_SECRET!);
    const event = JSON.parse(rawBody);
    // Process webhook...
    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response('Invalid signature', { status: 400 });
  }
}
```

### FastAPI
```python
import os
import hmac
import hashlib
from fastapi import HTTPException, Header, Request

async def verify_elevenlabs_webhook(
    request: Request,
    elevenlabs_signature: str = Header(None, alias="ElevenLabs-Signature")
):
    if not elevenlabs_signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    # Get webhook secret from environment
    webhook_secret = os.environ.get('ELEVENLABS_WEBHOOK_SECRET')
    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Get raw body
    raw_body = await request.body()

    # Parse signature header
    elements = elevenlabs_signature.split(',')
    timestamp = next((e[2:] for e in elements if e.startswith('t=')), None)
    signatures = [e[3:] for e in elements if e.startswith('v0=')]

    # Verify timestamp
    import time
    current_time = int(time.time())
    if abs(current_time - int(timestamp)) > 1800:
        raise HTTPException(status_code=400, detail="Timestamp too old")

    # Calculate expected signature
    signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}"
    expected_sig = hmac.new(
        webhook_secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    # Verify signature
    if not any(hmac.compare_digest(sig, expected_sig) for sig in signatures):
        raise HTTPException(status_code=400, detail="Invalid signature")

    return raw_body
```

## Debugging Verification Failures

**"Invalid signature header format"**
- Check the header is being passed correctly
- Verify header name casing in your framework
- Log the raw header value to inspect format

**"Webhook timestamp too old"**
- Check server time is synchronized
- Verify you're parsing the timestamp correctly
- Consider network delays in your tolerance

**"Invalid webhook signature"**
- Ensure you're using the raw body (not parsed JSON)
- Verify your secret is correct (no extra whitespace)
- Check encoding (should be hex, not base64)
- Log both expected and received signatures (dev only)

**Testing Tip**: Create a test that generates valid signatures:
```javascript
function generateTestSignature(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v0=${signature}`;
}
```