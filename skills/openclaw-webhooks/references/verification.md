# OpenClaw Token Verification

## How It Works

OpenClaw uses a shared-secret token for webhook authentication. Unlike HMAC-based signature verification (GitHub, Stripe), OpenClaw sends the token directly in a header:

- `Authorization: Bearer <token>` (recommended)
- `x-openclaw-token: <token>`

Your webhook receiver compares the incoming token against the expected secret using a timing-safe comparison.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyOpenClawWebhook(authHeader, xTokenHeader, secret) {
  const token = extractToken(authHeader, xTokenHeader);
  if (!token || !secret) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}

function extractToken(authHeader, xTokenHeader) {
  if (xTokenHeader) return xTokenHeader;
  if (authHeader && authHeader.startsWith('Bearer '))
    return authHeader.slice(7);
  return null;
}

// Usage in Express
app.post('/webhooks/openclaw',
  express.json(),
  (req, res) => {
    const authHeader = req.headers['authorization'];
    const xToken = req.headers['x-openclaw-token'];

    if (!verifyOpenClawWebhook(authHeader, xToken, process.env.OPENCLAW_HOOK_TOKEN)) {
      return res.status(401).send('Invalid token');
    }

    // Process webhook...
  }
);
```

### Python

```python
import hmac

def verify_openclaw_webhook(auth_header: str | None, x_token: str | None, secret: str) -> bool:
    """Verify OpenClaw webhook token."""
    token = x_token
    if not token and auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token or not secret:
        return False
    return hmac.compare_digest(token, secret)
```

## Why Timing-Safe Comparison?

Even though OpenClaw uses token comparison (not HMAC signatures), timing-safe comparison prevents timing attacks where an attacker measures response times to guess the token character by character.

```javascript
// WRONG — vulnerable to timing attacks
if (receivedToken === expectedToken) { ... }

// CORRECT — timing-safe
crypto.timingSafeEqual(
  Buffer.from(receivedToken),
  Buffer.from(expectedToken)
)
```

In Python:

```python
# WRONG
if received_token == expected_token: ...

# CORRECT
hmac.compare_digest(received_token, expected_token)
```

## Common Gotchas

### 1. Check Both Headers

OpenClaw clients may use either header style. Always check both:

```javascript
// WRONG — only checks one header
const token = req.headers['authorization'];

// CORRECT — check both
const authHeader = req.headers['authorization'];
const xToken = req.headers['x-openclaw-token'];
const token = extractToken(authHeader, xToken);
```

### 2. Strip the "Bearer " Prefix

The `Authorization` header includes a `Bearer ` prefix that must be removed:

```javascript
// WRONG
if (req.headers['authorization'] === secret) { ... }

// CORRECT
const token = req.headers['authorization'].replace('Bearer ', '');
```

### 3. Reject Query-String Tokens

OpenClaw rejects `?token=...` with `400`. Your receiver should do the same:

```javascript
if (req.query.token) {
  return res.status(400).send('Query-string tokens not accepted');
}
```

### 4. Buffer Length Mismatch

`timingSafeEqual` throws if buffers have different lengths:

```javascript
try {
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(secret)
  );
} catch {
  return false;
}
```

### 5. Use JSON Body Parser (Not Raw)

Unlike HMAC-based webhooks (GitHub, Stripe), OpenClaw does not sign the request body. You can safely use `express.json()` instead of `express.raw()`:

```javascript
// OpenClaw webhooks — JSON parser is fine
app.post('/webhooks/openclaw', express.json(), handler);

// GitHub webhooks — MUST use raw body for HMAC verification
app.post('/webhooks/github', express.raw({ type: 'application/json' }), handler);
```

## Debugging Verification Failures

```javascript
app.post('/webhooks/openclaw', express.json(), (req, res) => {
  const authHeader = req.headers['authorization'];
  const xToken = req.headers['x-openclaw-token'];

  console.log('Authorization header:', authHeader);
  console.log('x-openclaw-token header:', xToken);
  console.log('Expected token length:', process.env.OPENCLAW_HOOK_TOKEN?.length);
  console.log('Received token length:', extractToken(authHeader, xToken)?.length);
});
```

## Full Documentation

- [OpenClaw Webhook Documentation](https://docs.openclaw.ai/automation/webhook)
