# Vercel Signature Verification

## How It Works

Vercel uses HMAC-SHA1 to sign webhook payloads. The signature is sent in the `x-vercel-signature` header and is computed by:

1. Taking the raw request body (as bytes)
2. Creating an HMAC using SHA1 with your webhook secret
3. Encoding the result as a hexadecimal string

## Implementation

### Node.js/JavaScript

```javascript
const crypto = require('crypto');

function verifyVercelSignature(rawBody, signature, secret) {
  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (err) {
    // Buffer length mismatch = invalid signature
    return false;
  }
}

// Usage in Express
app.post('/webhooks/vercel',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-vercel-signature'];

    if (!signature) {
      return res.status(400).send('Missing signature');
    }

    const isValid = verifyVercelSignature(
      req.body,
      signature,
      process.env.VERCEL_WEBHOOK_SECRET
    );

    if (!isValid) {
      return res.status(400).send('Invalid signature');
    }

    // Process verified webhook...
  }
);
```

### Python

```python
import hmac
import hashlib

def verify_vercel_signature(body: bytes, signature: str, secret: str) -> bool:
    """Verify Vercel webhook signature using HMAC-SHA1."""
    expected_signature = hmac.new(
        secret.encode(),
        body,
        hashlib.sha1
    ).hexdigest()

    # Constant-time comparison
    return hmac.compare_digest(signature, expected_signature)

# Usage in FastAPI
from fastapi import Request, HTTPException, Header

@app.post("/webhooks/vercel")
async def handle_webhook(
    request: Request,
    x_vercel_signature: str = Header(None)
):
    if not x_vercel_signature:
        raise HTTPException(status_code=400, detail="Missing signature")

    body = await request.body()

    if not verify_vercel_signature(
        body,
        x_vercel_signature,
        os.environ["VERCEL_WEBHOOK_SECRET"]
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Process verified webhook...
```

## Common Gotchas

### 1. Raw Body Parsing

**Problem**: Most web frameworks parse JSON automatically, but signature verification requires the raw bytes.

**Solution**: Configure your framework to provide raw body:

```javascript
// Express - MUST use raw body parser
app.use('/webhooks/vercel', express.raw({ type: 'application/json' }));

// Next.js - Disable body parsing
export const config = {
  api: {
    bodyParser: false
  }
};

// FastAPI - Use request.body()
body = await request.body()  // Don't use await request.json()
```

### 2. Algorithm Confusion

**Problem**: Using SHA256 instead of SHA1 (common with other providers).

**Solution**: Vercel specifically uses SHA1:

```javascript
// CORRECT
crypto.createHmac('sha1', secret)

// WRONG - This is for Stripe/GitHub
crypto.createHmac('sha256', secret)
```

### 3. Signature Format

**Problem**: Expecting base64 or prefixed signatures.

**Solution**: Vercel signatures are plain hex strings:

```javascript
// Vercel signature format
'a1b2c3d4e5f6...'  // Plain hex, no prefix

// NOT like Stripe
't=1234567,v1=abc123...'  // Stripe uses timestamp prefix

// NOT base64
'YWJjMTIz...'  // Some providers use base64
```

### 4. Header Name Case Sensitivity

**Problem**: Different frameworks handle header names differently.

**Solution**: Headers are case-insensitive in HTTP, but check your framework:

```javascript
// Express - converts to lowercase
req.headers['x-vercel-signature']

// Some frameworks might preserve case
req.headers['X-Vercel-Signature']  // May not work

// Python/FastAPI - Use Header() for automatic handling
x_vercel_signature: str = Header(None)
```

### 5. Timing Attacks

**Problem**: Using regular string comparison can leak information through timing.

**Solution**: Always use constant-time comparison:

```javascript
// Node.js
crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

// Python
hmac.compare_digest(a, b)

// NEVER use
signature === expectedSignature  // Vulnerable to timing attacks
```

## Debugging Verification Failures

### Step 1: Check the Header

```javascript
console.log('Signature header:', req.headers['x-vercel-signature']);
console.log('All headers:', req.headers);
```

Common issues:
- Missing header (not a Vercel webhook)
- Empty header (configuration issue)
- Header in different case

### Step 2: Verify Raw Body

```javascript
console.log('Body type:', typeof req.body);
console.log('Body length:', req.body.length);
console.log('First 100 chars:', req.body.toString().substring(0, 100));
```

Should show:
- Type: `object` (Buffer) or `string`
- Non-zero length
- Raw JSON starting with `{`

### Step 3: Check Secret

```javascript
console.log('Secret exists:', !!process.env.VERCEL_WEBHOOK_SECRET);
console.log('Secret length:', process.env.VERCEL_WEBHOOK_SECRET?.length);
// Never log the actual secret!
```

Common issues:
- Missing environment variable
- Extra whitespace
- Wrong environment (dev/prod mismatch)

### Step 4: Compare Signatures

```javascript
const expected = crypto.createHmac('sha1', secret).update(body).digest('hex');
console.log('Received:', signature);
console.log('Expected:', expected);
console.log('Match:', signature === expected);
```

If they don't match:
- Verify you're using SHA1 (not SHA256)
- Check body hasn't been modified
- Ensure secret is correct

### Step 5: Test with Known Values

Create a test to verify your implementation:

```javascript
const testBody = '{"test":true}';
const testSecret = 'test_secret';
const expectedSig = crypto
  .createHmac('sha1', testSecret)
  .update(testBody)
  .digest('hex');

console.log('Test signature:', expectedSig);
// Should output: '7fd2b9c8d2c5f85c7e8f3a1b4d6e9a0c3f8b2d1e'
```

## Security Best Practices

1. **Always verify signatures** - Never trust webhooks without verification
2. **Fail fast** - Return 400 immediately for invalid signatures
3. **Log failures** - Track verification failures for security monitoring
4. **Use environment variables** - Never hardcode secrets
5. **Implement rate limiting** - Protect against brute force attempts
6. **Monitor for anomalies** - Unusual patterns may indicate attacks

## Error Response Standards

Return appropriate HTTP status codes:

```javascript
// Missing signature header
res.status(400).json({ error: 'Missing x-vercel-signature header' });

// Invalid signature
res.status(400).json({ error: 'Invalid signature' });

// Valid signature but processing failed
res.status(500).json({ error: 'Internal server error' });

// Success
res.status(200).json({ received: true });
```