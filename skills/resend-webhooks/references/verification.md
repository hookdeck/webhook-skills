# Resend Signature Verification

## How It Works

Resend uses [Svix](https://www.svix.com/) for webhook delivery, which means signatures follow the Svix format. Each webhook request includes three headers:

| Header | Description |
|--------|-------------|
| `svix-id` | Unique message identifier |
| `svix-timestamp` | Unix timestamp when the webhook was sent |
| `svix-signature` | HMAC-SHA256 signature(s), base64 encoded |

The signature is computed over: `{svix-id}.{svix-timestamp}.{raw-body}`

## Implementation

### Using the Resend SDK (Recommended)

The official Resend SDK handles signature verification automatically:

**Node.js:**
```javascript
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// IMPORTANT: Use raw body, not parsed JSON
const event = resend.webhooks.verify({
  payload: rawBody,  // Raw request body as string
  headers: {
    id: request.headers['svix-id'],           // Note: use short key names
    timestamp: request.headers['svix-timestamp'],
    signature: request.headers['svix-signature'],
  },
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET  // Your whsec_... secret
});
```

**TypeScript (Next.js):**
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const payload = await request.text();
  
  // Throws an error if invalid, returns parsed payload if valid
  const event = resend.webhooks.verify({
    payload,
    headers: {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
  });
  
  // Process verified event...
}
```

Alternatively, you can use the Svix library directly or verify manually (see below).

### Manual Verification (Python)

If you need to verify manually without the SDK:

```python
import hmac
import hashlib
import base64
import time

def verify_svix_signature(
    payload: bytes,
    headers: dict,
    secret: str,
    tolerance: int = 300
) -> bool:
    """
    Verify Svix signature used by Resend webhooks.
    
    Args:
        payload: Raw request body as bytes
        headers: Request headers dict
        secret: Webhook signing secret (whsec_...)
        tolerance: Maximum age in seconds (default 5 minutes)
    
    Returns:
        True if signature is valid, False otherwise
    """
    msg_id = headers.get("svix-id")
    msg_timestamp = headers.get("svix-timestamp")
    msg_signature = headers.get("svix-signature")
    
    # Check required headers
    if not all([msg_id, msg_timestamp, msg_signature]):
        return False
    
    # Check timestamp tolerance (prevent replay attacks)
    try:
        timestamp = int(msg_timestamp)
        now = int(time.time())
        if abs(now - timestamp) > tolerance:
            return False
    except ValueError:
        return False
    
    # Remove 'whsec_' prefix and decode base64 secret
    if secret.startswith("whsec_"):
        secret = secret[6:]
    secret_bytes = base64.b64decode(secret)
    
    # Create signed content
    signed_content = f"{msg_id}.{msg_timestamp}.{payload.decode()}"
    
    # Compute expected signature
    expected_sig = base64.b64encode(
        hmac.new(
            secret_bytes,
            signed_content.encode(),
            hashlib.sha256
        ).digest()
    ).decode()
    
    # Check against provided signatures (may have multiple versions)
    for sig in msg_signature.split():
        if sig.startswith("v1,"):
            provided_sig = sig[3:]  # Remove "v1," prefix
            if hmac.compare_digest(provided_sig, expected_sig):
                return True
    
    return False
```

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifySvixSignature(payload, headers, secret, tolerance = 300) {
  const msgId = headers['svix-id'];
  const msgTimestamp = headers['svix-timestamp'];
  const msgSignature = headers['svix-signature'];
  
  if (!msgId || !msgTimestamp || !msgSignature) {
    return false;
  }
  
  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  const timestamp = parseInt(msgTimestamp, 10);
  if (Math.abs(now - timestamp) > tolerance) {
    return false;
  }
  
  // Remove 'whsec_' prefix and decode secret
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');
  
  // Create signed content
  const signedContent = `${msgId}.${msgTimestamp}.${payload}`;
  
  // Compute expected signature
  const expectedSig = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  
  // Check against provided signatures
  const signatures = msgSignature.split(' ');
  for (const sig of signatures) {
    if (sig.startsWith('v1,')) {
      const providedSig = sig.slice(3);
      try {
        if (crypto.timingSafeEqual(
          Buffer.from(providedSig),
          Buffer.from(expectedSig)
        )) {
          return true;
        }
      } catch {
        // Length mismatch, continue checking
      }
    }
  }
  
  return false;
}
```

## Common Gotchas

### 1. Raw Body Requirement

The most common cause of verification failures is using a parsed JSON body instead of the raw request body.

**Express:**
```javascript
// WRONG - body is already parsed
app.use(express.json());
app.post('/webhooks/resend', (req, res) => {
  resend.webhooks.verify({ payload: req.body, ... }); // Fails!
});

// CORRECT - use raw body for this route
app.post('/webhooks/resend',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    resend.webhooks.verify({ payload: req.body.toString(), ... }); // Works!
  }
);
```

### 2. Middleware Ordering

If you use a global JSON parser, configure the webhook route BEFORE the parser:

```javascript
// Webhook route with raw body (FIRST)
app.post('/webhooks/resend', express.raw({ type: 'application/json' }), handleWebhook);

// Global JSON parser (AFTER)
app.use(express.json());
```

### 3. Secret Format

The webhook secret starts with `whsec_` and the rest is base64-encoded. When verifying manually, remember to:
1. Strip the `whsec_` prefix
2. Base64-decode the remaining string

### 4. Timestamp Tolerance

Svix rejects requests older than 5 minutes by default. This prevents replay attacks but can cause issues if:
- Your server clock is significantly off
- You're replaying old events for testing

### 5. Multiple Signature Versions

The `svix-signature` header may contain multiple signatures (space-separated), each prefixed with a version like `v1,`. Always check all signatures and accept if any match.

## Debugging Verification Failures

### Error: "Missing required headers"

Check that all three headers are present:
```javascript
console.log('svix-id:', req.headers['svix-id']);
console.log('svix-timestamp:', req.headers['svix-timestamp']);
console.log('svix-signature:', req.headers['svix-signature']);
```

### Error: "Invalid signature"

1. **Check the raw body**: Ensure you're using the unparsed request body
2. **Check the secret**: Ensure you're using the correct `whsec_...` secret
3. **Check for modifications**: Any proxy or middleware that modifies the body will break verification

### Error: "Timestamp too old"

1. **Check server time**: Run `date` and compare to actual time
2. **Increase tolerance**: For testing only, increase the tolerance parameter

### Logging for Debugging

```javascript
app.post('/webhooks/resend', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Body type:', typeof req.body);
  console.log('Body length:', req.body.length);
  console.log('Headers:', {
    'svix-id': req.headers['svix-id'],
    'svix-timestamp': req.headers['svix-timestamp'],
    'svix-signature': req.headers['svix-signature']?.substring(0, 20) + '...'
  });
  
  try {
    const event = resend.webhooks.verify({ ... });
  } catch (err) {
    console.error('Verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
```

## Full Documentation

For complete signature verification details, see [Svix's signature verification documentation](https://docs.svix.com/receiving/verifying-payloads/how).
