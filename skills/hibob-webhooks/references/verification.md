# HiBob Signature Verification

## How Does Bob Sign Webhooks?

- Header: `Bob-Signature`
- Algorithm: HMAC-SHA512
- Signed content: the request payload (raw body)
- Key: the secret from the Bob webhook configuration, used as a raw UTF-8 string
- Encoding: base64 of the raw digest (not hex)
- No timestamp header, no signature prefix, no Standard Webhooks headers
- No official SDK; verify manually

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyBobSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import base64, hashlib, hmac

def verify_bob_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), raw_body, hashlib.sha512).digest()).decode()
    return hmac.compare_digest(signature_header, expected)
```

## Common Gotchas

- **Raw body**: sign the bytes Bob sent. Re-serialising parsed JSON changes whitespace and breaks the digest. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Ping test**: the initial `Ping test` request (plain text or `{"text":"Ping test"}`) must get a `200`. Bob's docs don't say whether it is signed, so the examples answer it before verifying. It has no side effects.
- **Base64, not hex**: compare against the base64 digest.
- **Secret is a raw string**: don't decode it.
- **Length mismatch**: `crypto.timingSafeEqual` throws on different lengths; catch it and return false.
- **No replay protection**: there is no timestamp, so make handlers idempotent (see webhook-handler-patterns). Bob retries failed deliveries.
- **Return 200 fast**: Bob times out at 10 seconds and retries.

## Debugging Verification Failures

1. Log the byte length of the raw body and confirm it matches what Bob sent (for example in Hookdeck or a request inspector).
2. Confirm no middleware (`express.json()`, a proxy that rewrites JSON) touched the body first.
3. Confirm the secret belongs to this webhook (each Bob webhook has its own) and has no trailing whitespace.
4. Confirm you read the header `Bob-Signature` (HTTP headers are case-insensitive; frameworks usually lowercase them).
5. Recompute the signature locally with the documented snippets and compare.
