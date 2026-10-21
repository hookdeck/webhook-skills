# How to Verify Dropbox Webhooks

Dropbox has two checks: the `challenge` GET at registration, and the `X-Dropbox-Signature` on every POST notification.

## How Does the Challenge Verification Work?

When you add or re-check a webhook URI, Dropbox sends:

```
GET /webhooks/dropbox?challenge=abc123
```

Respond `200` with the challenge value as the plain body and these headers:

```
Content-Type: text/plain
X-Content-Type-Options: nosniff
```

The `nosniff` header prevents the echoed value being interpreted as HTML. The GET carries no signature.

## How Does Signature Verification Work?

- Header: `X-Dropbox-Signature`
- Algorithm: HMAC-SHA256
- Signed content: the raw request body (no timestamp or prefix)
- Key: your app secret
- Encoding: lowercase hex

There is no official SDK helper for this check, so all examples verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signature, appSecret) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify_signature(raw_body: bytes, signature: str, app_secret: str) -> bool:
    if not signature:
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes bytes and breaks the HMAC. In Express use `express.raw({ type: '*/*' })`; in FastAPI use `await request.body()`.
- **Key is the app secret**, not an access token.
- **Handle the GET.** A handler that only accepts POST fails registration with a 405.
- **Echo the challenge exactly** with `text/plain` and `nosniff`; returning JSON fails the check.
- **No timestamp** is sent, so replay protection is up to you; make processing idempotent.
- **Respond fast.** Dropbox expects a response within 10 seconds; offload `list_folder/continue` work.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Registration says URI failed verification | GET not handled, wrong content type, or challenge not echoed exactly |
| Every POST fails signature check | Wrong secret (e.g. from another app), or body parsed before verifying |
| Works locally, fails behind a proxy | Proxy altered the body or encoding |
