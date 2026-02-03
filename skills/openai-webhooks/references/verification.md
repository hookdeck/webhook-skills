# OpenAI Signature Verification

## How It Works

OpenAI uses the Standard Webhooks specification for webhook signature verification. The webhook requests include three headers:

- `webhook-id`: A unique message identifier (e.g., `msg_2KWPBgLlAfxdpx2AI54pPJ85f4W`)
- `webhook-timestamp`: Unix timestamp in seconds (e.g., `1674087231`)
- `webhook-signature`: Version and signature (e.g., `v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=`)

The signature is computed using HMAC-SHA256 on the concatenation of:
```
webhook_id.webhook_timestamp.request_body
```

## Implementation

### Manual Verification (Recommended)

Manual verification gives you full control and works consistently across all frameworks:

**Node.js:**
```javascript
const crypto = require('crypto');

function verifyOpenAISignature(payload, webhookId, webhookTimestamp, webhookSignature, secret) {
  if (!webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Check timestamp is within 5 minutes to prevent replay attacks
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (timestampDiff > 300 || timestampDiff < -300) {
    console.error('Webhook timestamp too old or too far in the future');
    return false;
  }

  // Extract version and signature
  const [version, signature] = webhookSignature.split(',');
  if (version !== 'v1') {
    return false;
  }

  // Create signed content: webhook_id.webhook_timestamp.payload
  const payloadStr = payload instanceof Buffer ? payload.toString('utf8') : payload;
  const signedContent = `${webhookId}.${webhookTimestamp}.${payloadStr}`;

  // Decode base64 secret (remove whsec_ prefix if present)
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  // Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  // Timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Usage in Express
app.post('/webhooks/openai',
  express.raw({ type: 'application/json' }), // CRITICAL: Raw body required
  (req, res) => {
    const isValid = verifyOpenAISignature(
      req.body,
      req.headers['webhook-id'],
      req.headers['webhook-timestamp'],
      req.headers['webhook-signature'],
      process.env.OPENAI_WEBHOOK_SECRET
    );

    if (!isValid) {
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(req.body.toString());
    // Process event...
  }
);
```

**Python:**
```python
import hmac
import hashlib
import base64
import time

def verify_openai_signature(
    payload: bytes,
    webhook_id: str,
    webhook_timestamp: str,
    webhook_signature: str,
    secret: str
) -> bool:
    if not webhook_signature or ',' not in webhook_signature:
        return False

    # Check timestamp is within 5 minutes
    current_time = int(time.time())
    timestamp_diff = current_time - int(webhook_timestamp)
    if timestamp_diff > 300 or timestamp_diff < -300:
        return False

    # Extract version and signature
    version, signature = webhook_signature.split(',', 1)
    if version != 'v1':
        return False

    # Create signed content
    signed_content = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"

    # Decode base64 secret (remove whsec_ prefix if present)
    secret_key = secret[6:] if secret.startswith('whsec_') else secret
    secret_bytes = base64.b64decode(secret_key)

    # Generate expected signature
    expected_signature = base64.b64encode(
        hmac.new(
            secret_bytes,
            signed_content.encode('utf-8'),
            hashlib.sha256
        ).digest()
    ).decode('utf-8')

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)

# Usage in FastAPI
@app.post("/webhooks/openai")
async def webhook(
    request: Request,
    webhook_id: str = Header(None, alias="webhook-id"),
    webhook_timestamp: str = Header(None, alias="webhook-timestamp"),
    webhook_signature: str = Header(None, alias="webhook-signature")
):
    payload = await request.body()

    if not verify_openai_signature(
        payload,
        webhook_id,
        webhook_timestamp,
        webhook_signature,
        webhook_secret
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    event = await request.json()
    # Process event...
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is calculated on the raw request body. Using parsed JSON will fail:

**Express:**
```javascript
// WRONG - Body is parsed, signature won't match
app.use(express.json());
app.post('/webhooks/openai', (req, res) => {
  // req.body is an object, not raw bytes!
});

// CORRECT - Use raw body for webhook route
app.post('/webhooks/openai',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    // req.body is a Buffer with raw bytes
  }
);
```

**Next.js:**
```typescript
// app/api/webhooks/openai/route.ts
export async function POST(request: Request) {
  const body = await request.text(); // Get raw body
  const webhookId = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSignature = request.headers.get('webhook-signature');

  // Verify using body as string, not parsed JSON
}
```

### 2. Header Case Sensitivity

HTTP header names are case-insensitive, but some frameworks normalize them:

```javascript
// These might all work depending on framework:
req.headers['webhook-id']
req.headers['Webhook-Id']
req.headers['WEBHOOK-ID']

// Best practice: use lowercase
const webhookId = req.headers['webhook-id'];
const webhookTimestamp = req.headers['webhook-timestamp'];
const webhookSignature = req.headers['webhook-signature'];
```

### 3. Secret Format

The webhook secret from OpenAI follows the Standard Webhooks format:

```bash
# Standard format with whsec_ prefix
OPENAI_WEBHOOK_SECRET=whsec_base64encodedkey

# The actual secret is base64 encoded after the prefix
# The verification code handles removing the prefix
```

### 4. Timestamp Validation

Always validate the timestamp to prevent replay attacks:

```javascript
// Webhook timestamp should be within 5 minutes (300 seconds)
const currentTime = Math.floor(Date.now() / 1000);
const timestampDiff = currentTime - parseInt(webhookTimestamp);
if (timestampDiff > 300 || timestampDiff < -300) {
  // Reject the webhook
}
```

### 5. Timing Attacks

Always use timing-safe comparison to prevent attackers from guessing valid signatures:

```javascript
// VULNERABLE - Regular comparison leaks timing info
if (signature === expectedSignature) { }

// SECURE - Timing-safe comparison
if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) { }
```

## Debugging Verification Failures

### Step 1: Log the Basics
```javascript
console.log('Body type:', typeof req.body);
console.log('Body length:', req.body.length);
console.log('First 100 chars:', req.body.toString().substring(0, 100));
console.log('webhook-id:', req.headers['webhook-id']);
console.log('webhook-timestamp:', req.headers['webhook-timestamp']);
console.log('webhook-signature:', req.headers['webhook-signature']);
console.log('Secret starts with:', process.env.OPENAI_WEBHOOK_SECRET?.substring(0, 10));
```

### Step 2: Verify Raw Body
```javascript
// Should be Buffer or string, NOT object
if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
  console.error('ERROR: Body is parsed object, not raw!');
}
```

### Step 3: Test Signature Generation
```javascript
// Log the signed content for debugging
const signedContent = `${webhookId}.${webhookTimestamp}.${req.body.toString()}`;
console.log('Signed content preview:', signedContent.substring(0, 100));

// Generate signature for comparison
const testSig = crypto.createHmac('sha256', secretBytes)
  .update(signedContent, 'utf8')
  .digest('base64');
console.log('Expected:', testSig);
console.log('Received:', webhookSignature?.split(',')[1]);
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid signature" | Wrong secret or parsed body | Check secret format and use raw body |
| "Missing signature header" | Headers not sent or wrong names | Check for webhook-id, webhook-timestamp, webhook-signature |
| "Webhook timestamp too old" | Replay attack or clock skew | Ensure server clock is synchronized |

## Security Best Practices

1. **Environment Variables**: Never hardcode secrets
   ```javascript
   // WRONG
   const secret = 'whsec_1234567890';

   // CORRECT
   const secret = process.env.OPENAI_WEBHOOK_SECRET;
   ```

2. **Early Validation**: Verify signature before any processing
3. **No Logging**: Never log webhook secrets or full signatures
4. **HTTPS Only**: Always use HTTPS in production
5. **Idempotency**: Use webhook-id header to handle duplicates
6. **Timestamp Validation**: Always check timestamp to prevent replay attacks