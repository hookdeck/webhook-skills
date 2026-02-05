# Deepgram Webhook Verification

## Authentication Methods

Deepgram provides two methods to authenticate webhook callbacks:

### 1. dg-token Header (Recommended)

Every webhook request from Deepgram includes a `dg-token` header containing the API Key Identifier that was used to make the original transcription request.

```javascript
// Verify dg-token header
function verifyDeepgramWebhook(req) {
  const dgToken = req.headers['dg-token'];

  if (!dgToken) {
    throw new Error('Missing dg-token header');
  }

  // Compare with your stored API Key ID
  if (dgToken !== process.env.DEEPGRAM_API_KEY_ID) {
    throw new Error('Invalid dg-token');
  }

  return true;
}
```

### 2. Basic Authentication

Embed credentials directly in your callback URL:

```javascript
// When making the request
const callbackUrl = `https://username:password@your-domain.com/webhooks/deepgram`;

// In your webhook handler (Express example)
app.use('/webhooks/deepgram', express.basicAuth('username', 'password'));
```

## Implementation Examples

### Express.js Middleware

```javascript
const verifyDeepgramWebhook = (req, res, next) => {
  try {
    const dgToken = req.headers['dg-token'];
    const expectedToken = process.env.DEEPGRAM_API_KEY_ID;

    if (!dgToken || dgToken !== expectedToken) {
      return res.status(403).json({ error: 'Invalid webhook authentication' });
    }

    next();
  } catch (error) {
    console.error('Webhook verification failed:', error);
    res.status(403).json({ error: 'Webhook verification failed' });
  }
};

// Use the middleware
app.post('/webhooks/deepgram',
  express.raw({ type: 'application/json' }),
  verifyDeepgramWebhook,
  (req, res) => {
    // Process webhook
    const payload = JSON.parse(req.body);
    console.log('Verified webhook received:', payload.request_id);
    res.status(200).send('OK');
  }
);
```

### Next.js API Route

```typescript
export async function POST(request: Request) {
  // Verify dg-token
  const dgToken = request.headers.get('dg-token');

  if (!dgToken || dgToken !== process.env.DEEPGRAM_API_KEY_ID) {
    return new Response('Unauthorized', { status: 403 });
  }

  // Process webhook
  const payload = await request.json();
  console.log('Verified webhook received:', payload.request_id);

  return new Response('OK', { status: 200 });
}
```

### FastAPI Dependency

```python
from fastapi import Header, HTTPException, Depends
import os

async def verify_deepgram_webhook(dg_token: str = Header(None, alias="dg-token")):
    """Verify Deepgram webhook authentication"""
    expected_token = os.environ.get("DEEPGRAM_API_KEY_ID")

    if not dg_token or dg_token != expected_token:
        raise HTTPException(status_code=403, detail="Invalid webhook authentication")

    return True

# Use the dependency
@app.post("/webhooks/deepgram")
async def handle_deepgram_webhook(
    payload: dict,
    authenticated: bool = Depends(verify_deepgram_webhook)
):
    print(f"Verified webhook received: {payload.get('request_id')}")
    return {"status": "ok"}
```

## Security Considerations

### No Signature Verification

Unlike many webhook providers, Deepgram does **not** use cryptographic signatures (HMAC-SHA256) for webhook verification. This means:

- No timestamp validation
- No replay attack protection
- No payload integrity verification

### Best Practices

1. **Always use HTTPS**: Ensures webhook data is encrypted in transit
2. **Validate the dg-token**: Compare against your known API Key ID
3. **Store tokens securely**: Keep API Key IDs in environment variables
4. **Implement idempotency**: Track `request_id` to prevent duplicate processing
5. **Add rate limiting**: Protect against potential abuse
6. **Log authentication failures**: Monitor for suspicious activity

### Additional Security Layers

Consider adding your own security measures:

```javascript
// Add request timestamp validation
app.post('/webhooks/deepgram', (req, res) => {
  const dgToken = req.headers['dg-token'];
  const requestTime = req.headers['x-request-time'];

  // Verify token
  if (dgToken !== process.env.DEEPGRAM_API_KEY_ID) {
    return res.status(403).send('Invalid token');
  }

  // Optional: Add timestamp validation
  if (requestTime) {
    const now = Date.now();
    const requestTimestamp = parseInt(requestTime);
    const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(now - requestTimestamp) > MAX_AGE_MS) {
      return res.status(403).send('Request too old');
    }
  }

  // Process webhook
  res.status(200).send('OK');
});
```

## Debugging Authentication Issues

### Common Problems

1. **Missing dg-token header**
   - Ensure you're checking the correct header name
   - Headers might be lowercase in some frameworks

2. **Token mismatch**
   - Verify you're using the API Key ID (from console), not the API Key itself
   - Check for whitespace or encoding issues

3. **Basic Auth not working**
   - Ensure URL encoding for special characters
   - Verify your framework supports Basic Auth parsing

### Debug Logging

```javascript
app.post('/webhooks/deepgram', (req, res) => {
  console.log('Webhook headers:', req.headers);
  console.log('dg-token:', req.headers['dg-token']);
  console.log('Expected:', process.env.DEEPGRAM_API_KEY_ID);

  // Rest of verification logic
});
```

## Summary

While Deepgram's webhook authentication is simpler than signature-based verification, it's important to:

1. Always verify the `dg-token` header
2. Use HTTPS for all webhook endpoints
3. Implement proper error handling and logging
4. Consider additional security measures based on your requirements