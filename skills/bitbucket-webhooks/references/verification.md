# Bitbucket Signature Verification

## How It Works

When a Bitbucket webhook is configured with a secret token, Bitbucket signs every
request using HMAC SHA-256 and includes the signature in the `X-Hub-Signature`
header in the format:

```
X-Hub-Signature: sha256=<hex-encoded-signature>
```

The prefix names the hashing method (currently `sha256`). The signature is
computed as:

```
HMAC-SHA256(raw_request_body, webhook_secret) → hex encoded
```

> **Note**: Bitbucket does not provide an official SDK for webhook signature
> verification, so verify manually with your language's crypto library (shown
> below). Webhooks configured **without** a secret send no `X-Hub-Signature`
> header — those rely on HTTPS and a hard-to-guess endpoint URL instead.

### Reference Test Vector

From Bitbucket's documentation, these values let you confirm your implementation:

- Secret: `It's a Secret to Everybody`
- Body: `Hello World!`
- Expected: `sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9`

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyBitbucketWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) {
    return false;
  }

  // Header format: sha256=<hex>. Split on "=" to separate method and signature.
  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) {
    return false;
  }

  // Compute expected signature over the raw body
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
app.post('/webhooks/bitbucket',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-hub-signature'];

    if (!verifyBitbucketWebhook(req.body, signature, process.env.BITBUCKET_WEBHOOK_SECRET)) {
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

def verify_bitbucket_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False

    # Header format: sha256=<hex>. Partition on "=" to separate method and signature.
    algo, _, signature = signature_header.partition("=")
    if algo != "sha256" or not signature:
        return False

    # Compute expected signature over the raw body
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(signature, expected_signature)
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed on the raw request body. Re-serializing parsed JSON
will change bytes (key order, whitespace) and fail verification.

**Express:**
```javascript
// WRONG - body is already parsed
app.use(express.json());
app.post('/webhooks/bitbucket', (req, res) => {
  verifyBitbucketWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - use raw body
app.post('/webhooks/bitbucket',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyBitbucketWebhook(req.body, ...); // Works!
  }
);
```

### 2. Timing-Safe Comparison

**Always** use a constant-time comparison to prevent timing attacks:

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

Bitbucket's signature is hex-encoded, not base64:

```javascript
// WRONG - base64 encoding
.digest('base64')

// CORRECT - hex encoding
.digest('hex')
```

### 4. Header Name and Prefix

The header is `X-Hub-Signature` (no `-256` suffix like GitHub's), and the value
is prefixed with the method name `sha256=`. Strip the prefix before comparing:

```javascript
const [algo, signature] = req.headers['x-hub-signature'].split('=');
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

### 6. Unsigned Webhooks

If you did not configure a secret, Bitbucket sends **no** `X-Hub-Signature`
header. Configure a secret so you can verify signatures — treat a missing
signature as a rejected request when a secret is expected.

## Debugging Verification Failures

### Check the Raw Body

```javascript
app.post('/webhooks/bitbucket', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('Signature header:', req.headers['x-hub-signature']);
  console.log('Event key:', req.headers['x-event-key']);
});
```

### Compare Signatures

```javascript
const [, received] = (req.headers['x-hub-signature'] || '').split('=');
const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
console.log('Computed:', computed);
console.log('Received:', received);
```

### Check Your Secret

Ensure the secret matches exactly what you configured in Bitbucket. Watch out for:
- Leading/trailing whitespace
- Copy-paste errors
- Different secrets for different webhooks

## Full Documentation

For complete verification details, see [Manage webhooks](https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/).
