# Deepgram Webhook Verification

## Authentication Methods

Deepgram does not sign callbacks. Its [callback docs](https://developers.deepgram.com/docs/callback) describe two ways to authenticate them:

### 1. Basic Authentication (Recommended)

Embed credentials directly in your callback URL. Deepgram sends them to your endpoint as a standard `Authorization: Basic` header, so your handler can check them on every callback.

```javascript
// When making the request (percent-encode special characters in the credentials)
const callbackUrl = `https://username:password@your-domain.com/webhooks/deepgram`;
```

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Verify the Authorization: Basic header
function verifyBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':'); // password may itself contain ':'
  if (sep === -1) return false;
  return (
    safeEqual(decoded.slice(0, sep), process.env.DEEPGRAM_CALLBACK_USERNAME) &&
    safeEqual(decoded.slice(sep + 1), process.env.DEEPGRAM_CALLBACK_PASSWORD)
  );
}
```

### 2. dg-token Header (Supplementary)

The callback request may include a `dg-token` header. When present, it is set to the API Key Identifier of the API key used to submit the original request. Deepgram's docs say:

> The `dg-token` header is not guaranteed on every callback request, so this method is less reliable than Basic Auth or Extra Metadata. Use `dg-token` as a supplementary check rather than your only means of authentication.

So never reject a callback just because `dg-token` is missing. Compare it only when it is present:

```javascript
function verifyDgTokenIfPresent(dgToken) {
  if (!dgToken) return true; // not sent on every callback
  const expected = process.env.DEEPGRAM_API_KEY_ID;
  if (!expected) return true; // supplementary check not configured
  return safeEqual(dgToken, expected);
}
```

## Implementation Examples

### Express.js Middleware

```javascript
const verifyDeepgramWebhook = (req, res, next) => {
  if (!verifyBasicAuth(req.headers['authorization'])) {
    return res.status(401).json({ error: 'Invalid Basic Auth credentials' });
  }

  if (!verifyDgTokenIfPresent(req.headers['dg-token'])) {
    return res.status(403).json({ error: 'Invalid dg-token' });
  }

  next();
};

// Use the middleware
app.post('/webhooks/deepgram',
  express.raw({ type: 'application/json' }),
  verifyDeepgramWebhook,
  (req, res) => {
    // Process webhook: the body is { metadata, results }
    const payload = JSON.parse(req.body);
    console.log('Verified webhook received:', payload.metadata?.request_id);
    res.status(200).send('OK');
  }
);
```

### Next.js API Route

```typescript
export async function POST(request: Request) {
  // Primary check: Basic Auth (see verifyBasicAuth above)
  if (!verifyBasicAuth(request.headers.get('authorization'))) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Supplementary check: dg-token, only when present
  if (!verifyDgTokenIfPresent(request.headers.get('dg-token'))) {
    return new Response('Invalid dg-token', { status: 403 });
  }

  // Process webhook
  const payload = await request.json();
  console.log('Verified webhook received:', payload.metadata?.request_id);

  return new Response('OK', { status: 200 });
}
```

### FastAPI Dependency

```python
import base64
import binascii
import os
import secrets
from typing import Optional

from fastapi import Header, HTTPException, Depends


def _safe_equal(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode(), b.encode())


async def verify_deepgram_webhook(
    authorization: Optional[str] = Header(None),
    dg_token: Optional[str] = Header(None, alias="dg-token"),
):
    """Verify Deepgram webhook authentication"""
    username = os.environ.get("DEEPGRAM_CALLBACK_USERNAME", "")
    password = os.environ.get("DEEPGRAM_CALLBACK_PASSWORD", "")

    if not authorization or not authorization.startswith("Basic "):
        raise HTTPException(status_code=401, detail="Missing Basic Auth credentials")
    try:
        decoded = base64.b64decode(authorization[6:], validate=True).decode()
    except (binascii.Error, UnicodeDecodeError):
        raise HTTPException(status_code=401, detail="Invalid Basic Auth credentials")
    user, sep, pwd = decoded.partition(":")
    if not sep or not (_safe_equal(user, username) and _safe_equal(pwd, password)):
        raise HTTPException(status_code=401, detail="Invalid Basic Auth credentials")

    # dg-token is not sent on every callback: check it only when present
    expected_key_id = os.environ.get("DEEPGRAM_API_KEY_ID")
    if dg_token and expected_key_id and not _safe_equal(dg_token, expected_key_id):
        raise HTTPException(status_code=403, detail="Invalid dg-token")

    return True

# Use the dependency
@app.post("/webhooks/deepgram")
async def handle_deepgram_webhook(
    payload: dict,
    authenticated: bool = Depends(verify_deepgram_webhook)
):
    print(f"Verified webhook received: {payload.get('metadata', {}).get('request_id')}")
    return {"status": "ok"}
```

## Security Considerations

### No Signature Verification

Unlike many webhook providers, Deepgram does **not** use cryptographic signatures (HMAC-SHA256) for webhook verification. This means:

- No timestamp validation
- No replay attack protection
- No payload integrity verification

### Best Practices

1. **Always use HTTPS**: Ensures webhook data and the Basic Auth credentials are encrypted in transit
2. **Require Basic Auth**: Reject any callback without matching credentials, using a timing-safe comparison
3. **Treat dg-token as supplementary**: Check it when present, but don't require it
4. **Store secrets securely**: Keep the callback credentials and API Key ID in environment variables, and keep callback URLs (which contain the credentials) out of shared logs
5. **Implement idempotency**: Track `metadata.request_id` to prevent duplicate processing
6. **Add rate limiting**: Protect against potential abuse
7. **Log authentication failures**: Monitor for suspicious activity

### Additional Security Layers

Because there is no signature, you can also confirm that a callback belongs to work you actually submitted. Store the `request_id` returned when you make the request, and check `metadata.request_id` (or a value you passed with `extra`) against it:

```javascript
app.post('/webhooks/deepgram', express.json(), async (req, res) => {
  // ...Basic Auth check first...

  const requestId = req.body?.metadata?.request_id;
  const job = await db.jobs.findByDeepgramRequestId(requestId); // your own store

  if (!job) {
    return res.status(404).send('Unknown request_id');
  }

  // Process webhook
  res.status(200).send('OK');
});
```

## Debugging Authentication Issues

### Common Problems

1. **Missing Authorization header**
   - Check the callback URL you sent to Deepgram includes `username:password@`
   - Percent-encode special characters in the username or password

2. **dg-token missing**
   - Expected on some callbacks: Deepgram does not guarantee the header. Don't treat its absence as a failure

3. **dg-token mismatch**
   - Verify you're using the API Key ID (from console), not the API Key itself
   - Check for whitespace or encoding issues

### Debug Logging

```javascript
app.post('/webhooks/deepgram', (req, res) => {
  console.log('Authorization header present:', Boolean(req.headers['authorization']));
  console.log('dg-token:', req.headers['dg-token']);
  console.log('Expected API Key ID:', process.env.DEEPGRAM_API_KEY_ID);

  // Rest of verification logic
});
```

## Summary

While Deepgram's webhook authentication is simpler than signature-based verification, it's important to:

1. Always verify the Basic Auth credentials embedded in your callback URL
2. Check the `dg-token` header only as a supplementary signal, when it is present
3. Use HTTPS for all webhook endpoints
4. Implement proper error handling and logging
