# Cursor Signature Verification

## How It Works

Cursor uses HMAC-SHA256 to sign webhook payloads. The signature is sent in the `X-Webhook-Signature` header with the format `sha256=<hex_digest>`.

The signature is computed by:
1. Taking the raw request body (before parsing)
2. Creating an HMAC-SHA256 hash using your webhook secret
3. Encoding the result as hexadecimal
4. Prefixing with `sha256=`

## Implementation

### Manual Verification (Recommended)

```javascript
const crypto = require('crypto');

function verifyCursorWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Extract algorithm and signature
  const [algorithm, signature] = signatureHeader.split('=');
  if (algorithm !== 'sha256') {
    return false;
  }

  // Calculate expected signature
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;  // Different lengths
  }
}
```

### Python Implementation

```python
import hmac
import hashlib

def verify_cursor_webhook(body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    # Extract algorithm and signature
    parts = signature_header.split('=')
    if len(parts) != 2 or parts[0] != 'sha256':
        return False

    signature = parts[1]

    # Calculate expected signature
    expected = hmac.new(
        secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

### 1. Raw Body Parsing

**Problem**: Using parsed JSON instead of raw body breaks signature verification.

**Solution**: Always use the raw request body:
```javascript
// Express
app.use('/webhooks/cursor', express.raw({ type: 'application/json' }));

// Next.js
export const config = { api: { bodyParser: false } };

// FastAPI
body = await request.body()  # Get raw bytes
```

### 2. Header Case Sensitivity

**Problem**: Some frameworks lowercase headers.

**Solution**: Access headers case-insensitively:
```javascript
// Express normalizes to lowercase
const signature = req.headers['x-webhook-signature'];

// FastAPI preserves case
signature = request.headers.get('X-Webhook-Signature')
```

### 3. Missing Timing-Safe Comparison

**Problem**: Using `===` for comparison is vulnerable to timing attacks.

**Solution**: Always use timing-safe comparison:
```javascript
// Good
crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

// Bad
signature === expected
```

### 4. Incorrect Secret Format

**Problem**: Using the wrong secret or format.

**Solution**: Use the exact secret from Cursor dashboard, no modifications.

## Debugging Verification Failures

If signature verification fails:

1. **Check the raw body**: Log the exact bytes being signed
2. **Verify the secret**: Ensure no extra whitespace or encoding issues
3. **Check headers**: Log the exact signature header value
4. **Compare signatures**: Log both calculated and received signatures (in development only)

### Debug Helper

```javascript
function debugWebhook(rawBody, signatureHeader, secret) {
  console.log('=== Webhook Debug ===');
  console.log('Body length:', rawBody.length);
  console.log('Body preview:', rawBody.toString().substring(0, 100));
  console.log('Signature header:', signatureHeader);

  const [algorithm, signature] = signatureHeader.split('=');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  console.log('Received sig:', signature);
  console.log('Expected sig:', expected);
  console.log('Match:', signature === expected);
  console.log('===================');
}
```

**Important**: Only use debug logging in development. Never log signatures or secrets in production.