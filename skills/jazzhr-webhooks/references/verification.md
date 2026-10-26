# JazzHR Signature Verification

## How It Works

- Header: `X-JazzHR-Signature`
- Algorithm: HMAC-SHA256
- Signed content: the raw request body, exactly as sent
- Key: the Secret Key entered on the custom integration
- Encoding: bare lowercase hex (no `sha256=` prefix)
- No timestamp header, so replay protection comes from idempotency (`X-JazzHR-UUID`)

Worked example from the docs (PHP `hash_hmac('sha256', $body, $secret)`):

| Secret | Body | Signature |
|--------|------|-----------|
| `secret-key` | `{"data":"JazzHR Verify Event"}` | `4fdc7dcdcb02bca16c7ec4a15b9d6436de1f186e11ff155d0ab178b5aca4f30e` |

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest((signature_header or "").lower().encode(), expected.encode())
```

## Common Gotchas

- **Raw body**: don't parse and re-serialize JSON. In Express use `express.raw({ type: '*/*' })` so any content type works; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Validate hex before decoding**: `Buffer.from(x, 'hex')` silently truncates at the first invalid character, so check for exactly 64 hex chars first.
- **Bytes in Python**: `hmac.compare_digest` raises `TypeError` on non-ASCII `str`; encode both sides so a bad header gives 401, not 500.
- **`VERIFY` is signed too**: verify it, then return `200`. If it fails, the integration won't save.
- **Event type is a header**: read `X-JazzHR-Event`, not the body.

## Debugging Verification Failures

1. Compute the HMAC of the docs' example and confirm you get `4fdc7d...30e`.
2. Confirm `JAZZHR_WEBHOOK_SECRET` equals the Secret Key on the integration (no trailing whitespace).
3. Log the body length and compare with what JazzHR sent; a body-parsing middleware ahead of your route is the usual culprit.
4. The docs call the Secret Key optional "depending on the partner"; without one there is nothing to verify against, so set one.
