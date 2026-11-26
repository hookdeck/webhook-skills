# Deepgram Webhook Verification

## Authentication Methods

Deepgram does not sign callbacks. Its [callback docs](https://developers.deepgram.com/docs/callback#authenticating-callback-requests) describe two ways to authenticate them:

### 1. Basic Authentication (Recommended)

Embed credentials directly in your callback URL. Deepgram includes them when it sends results to your callback server, and they arrive as a standard `Authorization: Basic` header. This works for speech-to-text, text-to-speech and Text Intelligence callbacks, and it's the only documented check for the last two.

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

### 2. Secret in Extra Metadata (Speech-to-Text only)

Send a random secret as an [`extra`](https://developers.deepgram.com/docs/extra-metadata) key-value pair with your `/v1/listen` request. Deepgram returns every `extra` pair in `metadata.extra` in the callback body, so your handler compares `metadata.extra.callback_secret` with the expected value and rejects a request where it's missing or different.

```bash
# Generate a URL-safe secret. A '+' in an extra value arrives as a space, so avoid base64.
openssl rand -hex 32
```

```bash
curl \
  --request POST \
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \
  --header 'Content-Type: audio/wav' \
  --data-binary @youraudio.wav \
  --url 'https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram&extra=callback_secret:YOUR_SECRET_VALUE'
```

```javascript
function verifyCallbackSecret(payload) {
  const expected = process.env.DEEPGRAM_CALLBACK_SECRET;
  if (!expected) return true; // not configured
  return safeEqual(payload?.metadata?.extra?.callback_secret, expected);
}
```

### The `dg-token` header is retired

Deepgram's [27 October 2026 changelog](https://developers.deepgram.com/changelog/2026/10/27) says the `dg-token` header "is no longer a supported method to verify that callback requests come from Deepgram". If your handler checks `dg-token`, switch to Basic Auth, or the `extra` secret for speech-to-text.

## Implementation Examples

### Express.js

```javascript
app.post('/webhooks/deepgram',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!verifyBasicAuth(req.headers['authorization'])) {
      return res.status(401).json({ error: 'Invalid Basic Auth credentials' });
    }

    // The body is { metadata, results } for a pre-recorded transcription
    const payload = JSON.parse(req.body);
    if (!verifyCallbackSecret(payload)) {
      return res.status(401).json({ error: 'Invalid callback secret' });
    }

    console.log('Verified webhook received:', payload.metadata?.request_id);
    res.status(200).send('OK');
  }
);
```

### Next.js API Route

```typescript
export async function POST(request: Request) {
  if (!verifyBasicAuth(request.headers.get('authorization'))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = await request.json();
  if (!verifyCallbackSecret(payload)) {
    return new Response('Invalid callback secret', { status: 401 });
  }

  console.log('Verified webhook received:', payload.metadata?.request_id);
  return new Response('OK', { status: 200 });
}
```

### FastAPI

```python
import base64
import binascii
import os
import secrets
from typing import Optional

from fastapi import Header, HTTPException, Request


def _safe_equal(a: str, b: str) -> bool:
    return secrets.compare_digest(a.encode(), b.encode())


def verify_basic_auth(authorization: Optional[str]) -> bool:
    username = os.environ.get("DEEPGRAM_CALLBACK_USERNAME", "")
    password = os.environ.get("DEEPGRAM_CALLBACK_PASSWORD", "")
    if not authorization or not authorization.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(authorization[6:], validate=True).decode()
    except (binascii.Error, UnicodeDecodeError):
        return False
    user, sep, pwd = decoded.partition(":")
    return bool(sep) and _safe_equal(user, username) and _safe_equal(pwd, password)


@app.post("/webhooks/deepgram")
async def handle_deepgram_webhook(request: Request, authorization: Optional[str] = Header(None)):
    if not verify_basic_auth(authorization):
        raise HTTPException(status_code=401, detail="Invalid Basic Auth credentials")

    payload = await request.json()
    expected = os.environ.get("DEEPGRAM_CALLBACK_SECRET")
    if expected:
        received = ((payload.get("metadata") or {}).get("extra") or {}).get("callback_secret")
        if not isinstance(received, str) or not _safe_equal(received, expected):
            raise HTTPException(status_code=401, detail="Invalid callback secret")

    print(f"Verified webhook received: {payload.get('metadata', {}).get('request_id')}")
    return {"status": "ok"}
```

## Security Considerations

### No Signature Verification

Deepgram does **not** use cryptographic signatures for callbacks. This means:

- No timestamp validation
- No replay attack protection
- No payload integrity verification

### Best Practices

1. **Always use HTTPS**: Ensures the result and the Basic Auth credentials or `extra` secret are encrypted in transit
2. **Require Basic Auth**: Reject any callback without matching credentials, using a timing-safe comparison
3. **Store secrets securely**: Keep the callback credentials in environment variables, and keep callback URLs (which contain the credentials) out of shared logs
4. **Rotate with overlap**: Credentials belong to each request, so jobs already submitted call back with the old values. Accept old and new until they've finished
5. **Implement idempotency**: Track `metadata.request_id` for pre-recorded results. Streaming callbacks to an `http(s)` URL share one `request_id`, so don't dedupe those on it alone
6. **Log authentication failures**: Monitor for suspicious activity

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

2. **Callback secret mismatch**
   - Check the request sent `extra=callback_secret:...` (speech-to-text only)
   - A `+` in the value arrives as a space; use a hex secret
   - If the request sends `extra` with the same key twice, only the last value comes back

3. **Old handler code checks `dg-token`**
   - Remove the check: Deepgram no longer supports `dg-token` for verification

### Debug Logging

```javascript
app.post('/webhooks/deepgram', (req, res) => {
  console.log('Authorization header present:', Boolean(req.headers['authorization']));
  console.log('callback_secret present:', Boolean(req.body?.metadata?.extra?.callback_secret));

  // Rest of verification logic
});
```

## Summary

While Deepgram's callback authentication is simpler than signature-based verification, it's important to:

1. Always verify the Basic Auth credentials embedded in your callback URL
2. For speech-to-text, optionally check a secret in `metadata.extra.callback_secret`
3. Don't rely on `dg-token`, which Deepgram has retired
4. Use HTTPS for all webhook endpoints
