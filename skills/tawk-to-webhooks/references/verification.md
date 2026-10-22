# tawk.to Signature Verification

## How Does tawk.to Sign Webhooks?

- Header: `X-Tawk-Signature`
- Algorithm: HMAC-SHA1
- Signed content: the raw request body (no timestamp, no id)
- Key: the webhook's secret key
- Encoding: lowercase hex, no prefix

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyTawkSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac

def verify_tawk_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.encode(), expected.encode())
```

tawk.to publishes no SDK for verification, so manual verification is used in all three examples.

## Common Gotchas

- **Raw body**: re-serialising parsed JSON changes bytes and breaks the HMAC. In Express use `express.raw({ type: '*/*' })` (tawk.to's own sample only reads `application/json`); in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Timing-safe compare**: tawk.to's sample uses `===`; use `timingSafeEqual` / `compare_digest`, guarding for length mismatch.
- **No replay protection**: there is no timestamp. Deduplicate with `X-Hook-Event-Id`.
- **Secret per webhook**: each webhook has its own secret key.

## Debugging Verification Failures

- Confirm the secret matches the webhook that sent the request.
- Log the raw body length and compare with the length tawk.to sent.
- Check that no middleware parsed or re-encoded the body before your handler.
- Check for stray whitespace or quotes in `TAWK_WEBHOOK_SECRET`.
