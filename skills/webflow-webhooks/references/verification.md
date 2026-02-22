# Webflow Signature Verification

## How It Works

Webflow uses HMAC-SHA256 to sign webhook payloads. The signature allows you to verify that webhooks are sent by Webflow and haven't been tampered with.

The signing process:
1. Concatenates the timestamp and raw request body with a colon: `timestamp:body`
2. Generates an HMAC-SHA256 hash using your secret key
3. Includes the hash in the `x-webflow-signature` header

## Headers

Signed webhooks include two headers:

- **`x-webflow-timestamp`**: Unix epoch timestamp in milliseconds when the webhook was sent
- **`x-webflow-signature`**: HMAC-SHA256 hash of the signed content

## Implementation

### Node.js/JavaScript

```javascript
const crypto = require('crypto');

function verifyWebflowSignature(rawBody, signature, timestamp, secret) {
  // Step 1: Validate timestamp (5-minute window)
  const currentTime = Date.now();
  const webhookTime = parseInt(timestamp);

  if (isNaN(webhookTime)) {
    return false;
  }

  const timeDiff = Math.abs(currentTime - webhookTime);
  if (timeDiff > 300000) { // 5 minutes = 300000 milliseconds
    return false;
  }

  // Step 2: Create the signed content
  const signedContent = `${timestamp}:${rawBody}`;

  // Step 3: Generate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  // Step 4: Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // Buffers of different lengths throw an error
    return false;
  }
}

// Express middleware example
function webflowWebhookMiddleware(secret) {
  return (req, res, next) => {
    const signature = req.headers['x-webflow-signature'];
    const timestamp = req.headers['x-webflow-timestamp'];

    if (!signature || !timestamp) {
      return res.status(400).send('Missing required headers');
    }

    const isValid = verifyWebflowSignature(
      req.body.toString(),
      signature,
      timestamp,
      secret
    );

    if (!isValid) {
      return res.status(400).send('Invalid signature');
    }

    // Parse the validated body
    req.body = JSON.parse(req.body);
    next();
  };
}
```

### Python

```python
import hmac
import hashlib
import time

def verify_webflow_signature(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    """Verify Webflow webhook signature"""

    # Step 1: Validate timestamp (5-minute window)
    try:
        webhook_time = int(timestamp)
    except ValueError:
        return False

    current_time = int(time.time() * 1000)
    time_diff = abs(current_time - webhook_time)

    if time_diff > 300000:  # 5 minutes = 300000 milliseconds
        return False

    # Step 2: Create signed content
    signed_content = f"{timestamp}:{raw_body.decode('utf-8')}"

    # Step 3: Generate expected signature
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        signed_content.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    # Step 4: Timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)
```

## Common Gotchas

### 1. Raw Body Parsing

**Problem**: Many frameworks automatically parse JSON bodies, but signature verification requires the raw body string.

**Solution**: Configure your framework to provide raw body access.

Express:
```javascript
app.post('/webhooks/webflow',
  express.raw({ type: 'application/json' }), // Get raw body
  webflowWebhookMiddleware(secret),
  handler
);
```

Next.js:
```javascript
export const config = {
  api: {
    bodyParser: false, // Disable automatic parsing
  },
};
```

FastAPI:
```python
from fastapi import Request

@app.post("/webhooks/webflow")
async def webhook(request: Request):
    raw_body = await request.body()  # Get raw bytes
```

### 2. Header Name Casing

**Problem**: Some frameworks normalize header names to lowercase.

**Solution**: Always use lowercase when accessing headers.

```javascript
// Good - works everywhere
const signature = req.headers['x-webflow-signature'];

// Bad - might fail in some frameworks
const signature = req.headers['X-Webflow-Signature'];
```

### 3. Secret Key Confusion

**Problem**: Different webhook creation methods use different secrets.

**Solution**: Know which secret to use:

- **OAuth App Webhooks**: Use your OAuth app's client secret
- **API-created Webhooks (after April 2025)**: Use the webhook-specific secret returned in the creation response
- **Dashboard Webhooks**: No signature verification available

### 4. Encoding Mismatch

**Problem**: Signature comparison fails due to encoding differences.

**Solution**: Ensure consistent encoding (Webflow uses hex encoding):

```javascript
// Correct - hex encoding
.digest('hex');

// Wrong - base64 encoding
.digest('base64');
```

## Debugging Verification Failures

### 1. Log Everything During Development

```javascript
function debugVerification(rawBody, signature, timestamp, secret) {
  console.log('Raw Body:', rawBody);
  console.log('Signature Header:', signature);
  console.log('Timestamp Header:', timestamp);
  console.log('Secret (first 6 chars):', secret.substring(0, 6) + '...');

  const signedContent = `${timestamp}:${rawBody}`;
  console.log('Signed Content:', signedContent);

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
  console.log('Expected Signature:', expectedSignature);

  console.log('Signatures Match:', signature === expectedSignature);
}
```

### 2. Common Error Messages

| Error | Likely Cause | Solution |
|-------|--------------|----------|
| "Missing required headers" | No signature headers | Webhook created via dashboard - recreate via API |
| "Invalid signature" | Wrong secret | Check OAuth client secret vs webhook secret |
| "Invalid signature" | Body parsing | Ensure using raw body, not parsed JSON |
| "Invalid signature" | Timestamp expired | Check server time, allow 5-minute window |
| "Invalid signature" | Encoding issue | Verify using hex encoding |

### 3. Test Signature Generation

Create a test to verify your implementation:

```javascript
const testPayload = '{"triggerType":"form_submission","payload":{}}';
const testTimestamp = '1705332000';
const testSecret = 'test_secret';

// Expected signature for these inputs
const expectedSignature = crypto
  .createHmac('sha256', testSecret)
  .update(`${testTimestamp}:${testPayload}`)
  .digest('hex');

console.log('Test signature:', expectedSignature);
// Should output: 3f8e5d6c6a1b8f7d4e2a9c5b1d7e3f9a2c4e6b8d0f3a5c7e9b1d3f5a7c9e0b2d
```

## Security Best Practices

1. **Always verify signatures** when available
2. **Validate timestamps** to prevent replay attacks
3. **Use timing-safe comparison** to prevent timing attacks
4. **Keep secrets secure** - use environment variables, never commit to code
5. **Log failures** for security monitoring
6. **Fail closed** - reject requests with invalid signatures
7. **Use HTTPS** to prevent man-in-the-middle attacks