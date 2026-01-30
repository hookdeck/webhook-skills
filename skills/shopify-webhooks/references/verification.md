# Shopify Signature Verification

## How It Works

Shopify signs every webhook request using HMAC SHA-256. The signature is included in the `X-Shopify-Hmac-SHA256` header as a base64-encoded string.

The signature is computed as:
```
HMAC-SHA256(raw_request_body, client_secret) → base64 encoded
```

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(hmacHeader)
  );
}

// Usage in Express
app.post('/webhooks/shopify', 
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    
    if (!verifyShopifyWebhook(req.body, hmac, process.env.SHOPIFY_API_SECRET)) {
      return res.status(401).send('Invalid signature');
    }
    
    // Process webhook...
  }
);
```

### Python

```python
import hmac
import hashlib
import base64

def verify_shopify_webhook(raw_body: bytes, hmac_header: str, secret: str) -> bool:
    computed_hmac = base64.b64encode(
        hmac.new(
            secret.encode('utf-8'),
            raw_body,
            hashlib.sha256
        ).digest()
    ).decode('utf-8')
    
    return hmac.compare_digest(computed_hmac, hmac_header)
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed on the raw request body, not parsed JSON. Using `req.body` after JSON parsing will fail.

**Express:**
```javascript
// WRONG - body is already parsed
app.use(express.json());
app.post('/webhooks/shopify', (req, res) => {
  verifyShopifyWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - use raw body
app.post('/webhooks/shopify',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyShopifyWebhook(req.body, ...); // Works!
  }
);
```

### 2. Character Encoding

The raw body must be treated as UTF-8. Watch out for encoding issues when:
- Reading the request body
- Storing/retrieving the body
- Comparing signatures

### 3. Base64 Encoding

Shopify's signature is base64-encoded, not hex. Make sure your hash output matches:

```javascript
// WRONG - hex encoding
.digest('hex')

// CORRECT - base64 encoding
.digest('base64')
```

### 4. Timing-Safe Comparison

Always use timing-safe comparison to prevent timing attacks:

```javascript
// WRONG - vulnerable to timing attacks
if (computedHash === hmacHeader) { ... }

// CORRECT - timing-safe
if (crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(hmacHeader))) { ... }
```

## Debugging Verification Failures

### Check the Raw Body

```javascript
app.post('/webhooks/shopify', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Body type:', typeof req.body);
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('Body length:', req.body.length);
  console.log('HMAC header:', req.headers['x-shopify-hmac-sha256']);
});
```

### Compare Hashes

```javascript
const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
console.log('Computed:', computed);
console.log('Received:', hmacHeader);
console.log('Match:', computed === hmacHeader);
```

### Verify Secret

Ensure you're using the correct secret:
- For apps: Client secret from Partner Dashboard
- For custom integrations: The secret you configured

## Handling Multiple API Versions

Shopify may send webhooks using different API versions. The version is included in the `X-Shopify-API-Version` header. Your verification logic doesn't need to change, but your payload parsing might.

## Full Documentation

For complete verification details, see [Shopify HMAC Verification](https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook).
