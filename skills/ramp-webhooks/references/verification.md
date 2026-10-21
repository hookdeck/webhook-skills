# How to Verify Ramp Webhook Signatures

## How It Works

Every Ramp webhook request, including the `webhooks.verification` challenge, carries an `X-Ramp-Signature` header: the hex-encoded HMAC-SHA256 of the raw request body, keyed with the `secret` returned when the subscription was created.

- Algorithm: HMAC-SHA256
- Encoding: hex
- Signed content: the raw body bytes only (no timestamp, no prefix)
- Key: the subscription `secret` as a raw string (not base64-decoded)

Ramp documents signature validation as optional but recommended for production.

## Implementation

Ramp provides no SDK for webhook verification, so use manual verification in every framework.

### Node.js

```javascript
const crypto = require('crypto');

function verifyRampSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hashlib, hmac

def verify_ramp_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

- **Raw body:** Recreating the body with `JSON.stringify(req.body)` changes formatting or key order and breaks the signature. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Secret handling:** Use the `secret` string exactly as returned. Do not strip prefixes or base64-decode it.
- **Verification requests too:** The `webhooks.verification` challenge is signed. Verify it like any other event, then return 2xx.
- **No timestamp:** Ramp sends no signed timestamp, so replay protection comes from de-duplicating on the event `id` (constant across retries).
- **Status codes:** Ramp does not retry 4xx responses (except 429), so a mistaken 400 on a valid event is a lost event.

## Debugging Verification Failures

- Log the raw body length and compare it to what you signed in a test.
- Check for body-parsing middleware that runs before your raw-body route.
- Confirm you are using the secret of the subscription that sent the request (each subscription has its own).
- Confirm the digest is 64 hex characters; anything else means the header is not a Ramp signature.
