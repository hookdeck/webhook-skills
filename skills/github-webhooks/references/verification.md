# GitHub Signature Verification

## How It Works

GitHub signs every webhook request using HMAC SHA-256. The signature is included in the `X-Hub-Signature-256` header in the format:

```
X-Hub-Signature-256: sha256=<hex-encoded-signature>
```

The signature is computed as:
```
HMAC-SHA256(raw_request_body, webhook_secret) → hex encoded
```

> **Note**: GitHub also sends `X-Hub-Signature` (SHA-1) for backwards compatibility, but always use `X-Hub-Signature-256` for security.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyGitHubWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }
  
  // Extract the signature from the header
  const signature = signatureHeader.replace('sha256=', '');
  
  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

// Usage in Express
app.post('/webhooks/github',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-hub-signature-256'];
    
    if (!verifyGitHubWebhook(req.body, signature, process.env.GITHUB_WEBHOOK_SECRET)) {
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

def verify_github_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    
    # Extract the signature from the header
    signature = signature_header.replace('sha256=', '')
    
    # Compute expected signature
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).hexdigest()
    
    # Use timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed on the raw request body. Using parsed JSON will fail.

**Express:**
```javascript
// WRONG - body is already parsed
app.use(express.json());
app.post('/webhooks/github', (req, res) => {
  verifyGitHubWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - use raw body
app.post('/webhooks/github',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyGitHubWebhook(req.body, ...); // Works!
  }
);
```

### 2. Timing-Safe Comparison

**Always** use timing-safe comparison to prevent timing attacks:

```javascript
// WRONG - vulnerable to timing attacks
if (computedSignature === receivedSignature) { ... }

// CORRECT - timing-safe
crypto.timingSafeEqual(
  Buffer.from(computedSignature, 'hex'),
  Buffer.from(receivedSignature, 'hex')
)
```

### 3. Hex Encoding

GitHub's signature is hex-encoded, not base64. Make sure your output matches:

```javascript
// WRONG - base64 encoding
.digest('base64')

// CORRECT - hex encoding
.digest('hex')
```

### 4. Use X-Hub-Signature-256

Always prefer the SHA-256 signature over the deprecated SHA-1:

```javascript
// WRONG - SHA-1 is deprecated
const signature = req.headers['x-hub-signature'];

// CORRECT - use SHA-256
const signature = req.headers['x-hub-signature-256'];
```

### 5. Buffer Length Mismatch

`timingSafeEqual` throws if buffers have different lengths. Handle this:

```javascript
try {
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
} catch {
  return false; // Different lengths means invalid
}
```

## Debugging Verification Failures

### Check the Raw Body

```javascript
app.post('/webhooks/github', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Body type:', typeof req.body);
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('Signature header:', req.headers['x-hub-signature-256']);
});
```

### Compare Signatures

```javascript
const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
console.log('Computed:', computed);
console.log('Received:', signature.replace('sha256=', ''));
```

### Check Your Secret

Ensure the secret matches exactly what you configured in GitHub. Watch out for:
- Leading/trailing whitespace
- Copy-paste errors
- Different secrets for different webhooks

## Handling the Ping Event

When you create a webhook, GitHub sends a `ping` event to verify your endpoint works:

```javascript
if (req.headers['x-github-event'] === 'ping') {
  console.log('Ping received:', JSON.parse(req.body).zen);
  return res.status(200).send('pong');
}
```

## Full Documentation

For complete verification details, see [Validating Webhook Deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).
