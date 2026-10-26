# How to Verify Simpro Webhook Signatures

## How Does Simpro Sign Webhooks?

Per Simpro's Message Verification docs, `X-Response-Signature` contains a hash of the request body, calculated using an SHA1 HMAC hexdigest. Details:

- Header: `X-Response-Signature`
- Algorithm: HMAC-SHA1
- Signed content: the raw request body (no timestamp, no id)
- Key: the subscription's Secret, as UTF-8 bytes
- Encoding: hex (40 characters), no prefix

Simpro's own PHP example: `hash_equals($headers['X-Response-Signature'], hash_hmac('sha1', $requestBody, $secret))`.

There is no SDK for verification, so all examples verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifySimproSignature(rawBody, signature, secret) {
  if (!signature || !secret || !/^[0-9a-fA-F]{40}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_simpro_signature(raw_body: bytes, signature, secret) -> bool:
    if not signature or not secret or not re.fullmatch(r"[0-9a-fA-F]{40}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)
```

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes the bytes. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Validate the hex first.** `Buffer.from(x, 'hex')` silently truncates invalid hex, so require exactly 40 hex characters before decoding.
- **Compare case-insensitively.** Decoding to bytes (Node) or lowercasing (Python) handles uppercase hex.
- **No replay protection.** There is no timestamp in the signature. Rely on HTTPS and de-duplicate on your side.
- **Secret mismatch.** The Secret is whatever you typed into the subscription; there is no generated value.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Secret differs from the subscription's Secret, or trailing whitespace in the env var |
| Fails only in framework | Body parsed before verification, or body re-encoded |
| Header missing | Request did not come from Simpro; or a proxy stripped it |
