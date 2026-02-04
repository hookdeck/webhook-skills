# Paddle Signature Verification

## How It Works

Paddle signs every webhook request using HMAC SHA-256. The signature is included in the `Paddle-Signature` header and contains:

1. A timestamp (`ts`) - When Paddle sent the request (Unix timestamp)
2. A signature (`h1`) - HMAC SHA-256 of `timestamp:payload` using your webhook secret

Example header:
```
Paddle-Signature: ts=1671552777;h1=eb4d0dc8853be92b7f063b9f3ba5233eb920a09459b6e6b2c26705b4364db151
```

The `h1` signature is the current version. There may be multiple `h1` signatures during secret rotation.

## Implementation

### Using Paddle SDK (Recommended)

The official Paddle SDKs handle signature verification automatically:

**Node.js (`@paddle/paddle-node-sdk` v3.5.0+):**
```javascript
import { Paddle, EventName } from "@paddle/paddle-node-sdk";

const paddle = new Paddle(process.env.PADDLE_API_KEY);

// Express middleware example
app.post('/webhooks/paddle', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['paddle-signature'];
  const rawBody = req.body.toString();
  const secretKey = process.env.PADDLE_WEBHOOK_SECRET;

  try {
    // The SDK handles verification and parsing in one step
    // Method signature: paddle.webhooks.unmarshal(requestBody, secretKey, signature)
    const event = await paddle.webhooks.unmarshal(rawBody, secretKey, signature);

    // Handle event - note: SDK returns camelCase properties
    console.log(`Received event: ${event.eventType}`);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    res.status(400).send('Invalid signature');
  }
});
```

**Python (`paddle-billing` v1.13.0+):**

The Python SDK uses a `Verifier` class for webhook signature verification. It supports Flask and Django natively:

```python
from paddle_billing.Notifications import Secret, Verifier

# Flask example
@app.route("/webhooks/paddle", methods=["POST"])
def paddle_webhook():
    webhook_secret = os.environ['PADDLE_WEBHOOK_SECRET']
    
    # The Verifier handles signature verification
    # Method signature: Verifier().verify(request, Secret(secret))
    is_valid = Verifier().verify(request, Secret(webhook_secret))
    
    if not is_valid:
        return "Invalid signature", 400
    
    # Parse and handle event
    event = request.get_json()
    print(f"Received event: {event['event_type']}")
    return {"received": True}
```

> **Note for FastAPI users:** The Python SDK's `Verifier` is designed for Flask/Django request objects. For FastAPI, use manual verification (shown below) which is equally secure and more reliable across frameworks.

### Manual Verification

If you need to verify manually:

**Node.js:**
```javascript
const crypto = require('crypto');

function verifyPaddleSignature(payload, signatureHeader, secret) {
  // Parse the signature header
  const parts = signatureHeader.split(';');
  const timestamp = parts.find(p => p.startsWith('ts=')).slice(3);
  const signatures = parts
    .filter(p => p.startsWith('h1='))
    .map(p => p.slice(3));

  // Build the signed payload (timestamp:rawBody)
  const signedPayload = `${timestamp}:${payload}`;

  // Compute the expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Check if any signature matches (handles rotation)
  return signatures.some(sig =>
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature))
  );
}
```

**Python:**
```python
import hmac
import hashlib

def verify_paddle_signature(payload: str, signature_header: str, secret: str) -> bool:
    # Parse the signature header
    parts = signature_header.split(';')
    timestamp = None
    signatures = []

    for part in parts:
        if part.startswith('ts='):
            timestamp = part[3:]
        elif part.startswith('h1='):
            signatures.append(part[3:])

    if not timestamp or not signatures:
        return False

    # Build the signed payload (timestamp:rawBody)
    signed_payload = f"{timestamp}:{payload}"

    # Compute the expected signature
    expected = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    # Check if any signature matches (handles secret rotation)
    return any(hmac.compare_digest(sig, expected) for sig in signatures)
```

## Common Gotchas

### 1. Raw Body Requirement

The most common cause of verification failures is using a parsed JSON body instead of the raw request body.

**Express:**
```javascript
// WRONG - body is already parsed
app.use(express.json());
app.post('/webhooks/paddle', (req, res) => {
  verifyPaddleSignature(JSON.stringify(req.body), ...); // May fail!
});

// CORRECT - use raw body for this route
app.post('/webhooks/paddle',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyPaddleSignature(req.body.toString(), ...); // Works!
  }
);
```

### 2. Payload Transformation

Don't transform or process the raw body, including adding whitespace or applying other formatting. This results in a different signed payload, meaning signatures won't match.

### 3. Timestamp Format

The timestamp in the signature is the separator between `ts` and the signature, joined with a colon (`:`) to the payload, NOT a period (`.`) like some other providers use.

```javascript
// CORRECT
const signedPayload = `${timestamp}:${payload}`;

// WRONG (this is Stripe's format)
const signedPayload = `${timestamp}.${payload}`;
```

### 4. Replay Protection

To prevent replay attacks, check the timestamp (`ts`) against the current time and reject events that are too old. The recommended tolerance is 5 seconds.

```javascript
function isTimestampValid(timestamp, toleranceSeconds = 5) {
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  return Math.abs(now - ts) <= toleranceSeconds; // Compare the difference in seconds to the tolerance
}
```

### 5. Response Time

Paddle requires a response within **5 seconds**. Respond before doing any processing, then handle the event asynchronously.

```javascript
app.post('/webhooks/paddle', async (req, res) => {
  // Verify signature...
  
  // Respond immediately
  res.json({ received: true });
  
  // Then process asynchronously
  processEventAsync(event);
});
```

## Debugging Verification Failures

### Error: Signature mismatch

1. **Check the raw body**: Log `typeof req.body` - it should be `Buffer` or `string`, not `object`
2. **Check the secret**: Ensure you're using the correct secret for this notification destination
3. **Check sandbox vs live**: Sandbox endpoints need sandbox secrets

### Logging for Debugging

```javascript
app.post('/webhooks/paddle', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Body type:', typeof req.body);
  console.log('Body (first 100 chars):', req.body.toString().substring(0, 100));
  console.log('Signature header:', req.headers['paddle-signature']);
  
  // Verify...
});
```

## Retry Behavior

If your server doesn't respond with HTTP 200 within 5 seconds, Paddle automatically retries:

- **Sandbox**: 3 retries within 15 minutes
- **Live**: 60 retries within 3 days (first 20 attempts in the first hour)

Failed webhooks can be replayed manually via the Paddle API or dashboard.

## Full Documentation

For complete signature verification details, see [Paddle's signature verification documentation](https://developer.paddle.com/webhooks/signature-verification).
