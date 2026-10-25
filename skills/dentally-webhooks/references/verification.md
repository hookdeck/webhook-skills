# How to Verify Dentally Webhook Signatures

## How It Works

Dentally signs the body of each POST with an HMAC SHA256 hex digest, using the secret of the webhook endpoint the delivery is for. The digest is sent in `X-Dentally-Signature`:

```
X-Dentally-Signature: 63e0b2c79e8b73993777ce312d6b3ad421742d9a8f2657a3e3c14909c6578ab6
```

- Signed content: the **raw request body** only (no timestamp, no ID, no prefix)
- Key: the endpoint's secret string, used as UTF-8 (not base64 or hex decoded)
- Encoding: lowercase hex, 64 characters
- Dentally does not send a timestamp, so there is no built-in replay window; make handlers idempotent

## Implementation

Dentally has no webhook verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDentallySignature(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  // Validate before decoding: Buffer.from(x, 'hex') silently truncates at the first invalid char
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signatureHeader, 'hex'));
}
```

### Python

```python
import hashlib, hmac

def verify_dentally_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(expected, signature_header.lower().encode())
```

## Common Gotchas

- **Use the raw body.** Parsing and re-serialising JSON changes bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Don't decode invalid hex.** `Buffer.from('zz...', 'hex')` truncates instead of throwing; check the 64-hex-char format first, as above.
- **Compare bytes, not str, in Python.** `hmac.compare_digest` raises `TypeError` on non-ASCII `str` arguments, turning a bad header into a 500.
- **Case.** Compare hex case-insensitively (Dentally sends lowercase).
- **The secret is yours.** It is the string you entered when creating the webhook; if it doesn't match, every delivery fails and, after 50 failures, the webhook is disabled.
- **Return 2xx quickly.** Failed signature checks should return 401 so they don't look like successes, but remember each non-2xx counts toward the 50-failure limit.

## Debugging Verification Failures

1. Print the raw body length and compare with the `Content-Length` header.
2. Confirm the secret matches the one on the Dentally webhook (check for trailing whitespace or newlines in `.env`).
3. Confirm no middleware parses the body before your handler.
4. Recompute the digest locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`.
5. Check that a proxy or tunnel isn't altering the body.
