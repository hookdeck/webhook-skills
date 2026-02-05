# WooCommerce Signature Verification

## How It Works

WooCommerce signs every webhook request using HMAC SHA-256. The signature is included in the `X-WC-Webhook-Signature` header as a base64-encoded string.

The signature is computed as:
```
HMAC-SHA256(raw_request_body, webhook_secret) → base64 encoded
```

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyWooCommerceWebhook(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // Different lengths will throw an error
    return false;
  }
}

// Usage example
const isValid = verifyWooCommerceWebhook(
  req.body,                                    // Raw body as Buffer
  req.headers['x-wc-webhook-signature'],       // Signature header
  process.env.WOOCOMMERCE_WEBHOOK_SECRET       // Your secret
);
```

### Python

```python
import hmac
import hashlib
import base64

def verify_woocommerce_webhook(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    
    # Generate expected signature
    hash_digest = hmac.new(
        secret.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).digest()
    
    expected_signature = base64.b64encode(hash_digest).decode('utf-8')
    
    # Use timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)

# Usage example
is_valid = verify_woocommerce_webhook(
    request.body,                             # Raw body as bytes
    request.headers.get('x-wc-webhook-signature'),  # Signature header
    os.environ['WOOCOMMERCE_WEBHOOK_SECRET']  # Your secret
)
```

### PHP (Reference Implementation)

WooCommerce itself uses this verification method:

```php
function verify_woocommerce_webhook($raw_body, $signature, $secret) {
    if (empty($signature) || empty($secret)) {
        return false;
    }
    
    $expected_signature = base64_encode(
        hash_hmac('sha256', $raw_body, $secret, true)
    );
    
    return hash_equals($signature, $expected_signature);
}

// Usage example
$is_valid = verify_woocommerce_webhook(
    file_get_contents('php://input'),          // Raw body
    $_SERVER['HTTP_X_WC_WEBHOOK_SIGNATURE'],   // Signature header
    $webhook_secret                            // Your secret
);
```

## Common Gotchas

### 1. Use Raw Body, Not Parsed JSON

**❌ Wrong:**
```javascript
// DON'T parse the body first
app.use(express.json());
app.post('/webhook', (req, res) => {
    const signature = req.headers['x-wc-webhook-signature'];
    // req.body is now a JavaScript object, not raw bytes!
    verifyWooCommerceWebhook(JSON.stringify(req.body), signature, secret);
});
```

**✅ Correct:**
```javascript
// Use raw body for signature verification
app.use('/webhooks/woocommerce', express.raw({ type: 'application/json' }));
app.post('/webhooks/woocommerce', (req, res) => {
    const signature = req.headers['x-wc-webhook-signature'];
    // req.body is the raw Buffer
    if (!verifyWooCommerceWebhook(req.body, signature, secret)) {
        return res.status(400).send('Invalid signature');
    }
    
    // Parse JSON after verification
    const payload = JSON.parse(req.body);
});
```

### 2. Header Name Casing

Different frameworks handle header names differently:

```javascript
// These are equivalent:
req.headers['x-wc-webhook-signature']
req.headers['X-WC-Webhook-Signature']
req.get('X-WC-Webhook-Signature')

// FastAPI/Python
request.headers.get('x-wc-webhook-signature')
request.headers.get('X-WC-Webhook-Signature')
```

Always use lowercase in your code for consistency.

### 3. Buffer vs String Handling

**Node.js:**
```javascript
// Express with express.raw() gives you a Buffer
if (Buffer.isBuffer(req.body)) {
    // Use directly
    verifyWooCommerceWebhook(req.body, signature, secret);
} else {
    // Convert string to Buffer
    verifyWooCommerceWebhook(Buffer.from(req.body), signature, secret);
}
```

**Python:**
```python
# FastAPI gives you bytes by default with request.body()
raw_body = await request.body()  # This is bytes
verify_woocommerce_webhook(raw_body, signature, secret)

# If you have a string, encode it
if isinstance(body, str):
    body = body.encode('utf-8')
```

### 4. Missing or Empty Signatures

Always check for missing signatures:

```javascript
function verifyWooCommerceWebhook(rawBody, signature, secret) {
    // Guard against missing values
    if (!signature || !secret || !rawBody) {
        return false;
    }
    
    // Continue with verification...
}
```

### 5. Timing Attack Protection

Always use timing-safe comparison functions:

- **Node.js**: `crypto.timingSafeEqual()`
- **Python**: `hmac.compare_digest()`
- **PHP**: `hash_equals()`

Never use `===` or `==` for signature comparison.

## Debugging Verification Failures

### 1. Log the Details

```javascript
function debugWebhook(rawBody, signature, secret) {
    console.log('Raw body length:', rawBody.length);
    console.log('Signature received:', signature);
    console.log('Secret (first 8 chars):', secret?.substring(0, 8));
    
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');
    
    console.log('Expected signature:', expectedSignature);
    console.log('Signatures match:', signature === expectedSignature);
}
```

### 2. Check WooCommerce Logs

In WooCommerce admin:
1. Go to **WooCommerce > Status > Logs**
2. Select **webhook-delivery** logs
3. Look for HTTP response codes from your endpoint
4. 400 responses indicate signature verification failure

### 3. Test with Known Data

Create a test case with known values:

```javascript
const testSecret = 'test_secret';
const testBody = '{"id":123,"status":"processing"}';
const expectedSignature = crypto
    .createHmac('sha256', testSecret)
    .update(testBody)
    .digest('base64');

console.log('Test signature:', expectedSignature);
// Compare with what your verification function produces
```

### 4. Webhook Delivery Failures

If WooCommerce shows "delivery failures":
- Check your endpoint is reachable
- Verify it returns 200 for valid signatures
- Check for timeouts (WooCommerce has a 60-second limit)
- Look at your server logs for errors

## Security Best Practices

1. **Always verify signatures** before processing webhook data
2. **Use HTTPS** in production to prevent man-in-the-middle attacks
3. **Store secrets securely** in environment variables, not in code
4. **Implement proper error handling** - return 4xx for bad requests, 5xx for server errors
5. **Log security events** - track failed verification attempts
6. **Rate limit** your webhook endpoints to prevent abuse