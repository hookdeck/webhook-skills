# ElevenLabs Signature Verification

## How It Works

ElevenLabs uses HMAC-SHA256 signature verification with a custom header format to ensure webhook authenticity:

1. **Header Format**: `ElevenLabs-Signature: t=timestamp,v0=signature`
2. **Signed Payload**: `timestamp.raw_request_body`
3. **Algorithm**: HMAC-SHA256
4. **Encoding**: Hexadecimal

## SDK Verification (Recommended for Node/TypeScript)

ElevenLabs recommends using the official `@elevenlabs/elevenlabs-js` SDK for webhook verification and event construction. See [Verify the webhook secret and construct the webhook payload](https://elevenlabs.io/docs/agents-platform/guides/integrations/upstash-redis#verify-the-webhook-secret-and-consrtuct-the-webhook-payload).

```javascript
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || 'webhook-only'
});

// In your handler: raw body (string), signature header, webhook secret
const event = await elevenlabs.webhooks.constructEvent(
  rawBody,
  signatureHeader,
  process.env.ELEVENLABS_WEBHOOK_SECRET
);
// Returns parsed event; throws ElevenLabsError on invalid signature or missing header
```

- **Success**: Returns the parsed event object (`event.type`, `event.data`).
- **Failure**: Throws `ElevenLabsError` with `message` and `statusCode` (400). Return 401 and the error message to the client.

## Manual Implementation (Fallback for other languages)

Both the JavaScript/TypeScript SDK (`@elevenlabs/elevenlabs-js`, `webhooks.constructEvent`) and the Python SDK (`elevenlabs` >= 2.4.0, `webhooks.construct_event`) verify incoming webhooks. Use the manual implementation below only for languages without an official SDK helper, or when you need a dependency-free implementation.

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
   - The header format is `t=<unix seconds>,v0=<hex HMAC-SHA256 of "<t>.<rawBody>">`
   - The SDKs read a single `v0=` value (JS: the first, Python: the last) and don't treat multiple `v0=` values as "any match"; ElevenLabs documents one signature per header

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

### FastAPI (Python)

Use the Python SDK's `construct_event` (`elevenlabs` >= 2.4.0). It verifies the signature, checks the timestamp (30-minute tolerance, enforced by the SDK) and returns the parsed event as a `dict`. `raw_body` must be a `str`, so decode the request bytes first. On failure it raises `elevenlabs.errors.BadRequestError`.

```python
import os
from fastapi import FastAPI, HTTPException, Request
from elevenlabs import ElevenLabs
from elevenlabs.errors import BadRequestError

app = FastAPI()
# The API key isn't needed to verify webhooks
elevenlabs = ElevenLabs(api_key=os.environ.get("ELEVENLABS_API_KEY") or "webhook-only")

@app.post("/webhooks/elevenlabs")
async def elevenlabs_webhook(request: Request):
    sig = request.headers.get("elevenlabs-signature")
    if not sig:
        raise HTTPException(status_code=400, detail="Missing signature header")

    raw_body = await request.body()
    try:
        event = elevenlabs.webhooks.construct_event(
            raw_body.decode("utf-8"),
            sig,
            os.environ["ELEVENLABS_WEBHOOK_SECRET"],
        )
    except BadRequestError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle event["type"], event["data"]...
    return {"status": "ok"}
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