# Prive Signature Verification

## How It Works

- Header: `x-prive-hmac-sha256`
- Algorithm: HMAC-SHA256 over the **raw request body**
- Key: the secret token Prive provides to the merchant
- Encoding: bare **base64** of the digest (Shopify-style, no `sha256=` prefix)
- No timestamp, so no replay window; make handlers idempotent

Prive's Node sample calls `.digest()` after `update(body, 'hex')`. Node ignores the third argument of `update()` (it is an input encoding only applied to strings), so the digest is base64 as documented in prose, not hex.

## Implementation

Node:

```javascript
const crypto = require('crypto');

function verifyPriveSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Python:

```python
import base64, hashlib, hmac

def verify_prive_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    ).decode()
    return hmac.compare_digest(header.encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Raw body.** Verify before parsing. In Express use `express.raw({ type: '*/*' })` so any content type is read as a Buffer. In Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Base64, not hex.** A hex comparison never matches.
- **Don't decode the header.** Lenient base64 decoding accepts trailing junk. Compare the base64 strings as equal-length UTF-8 buffers.
- **Length check first.** `crypto.timingSafeEqual` throws on unequal lengths.
- **Python str vs bytes.** `hmac.compare_digest` raises `TypeError` on non-ASCII `str`, which becomes a 500. Encode both sides to bytes so a bad header gives 401.
- **Wrong secret.** Use the secret token Prive provided, not a Shopify or API credential. Ask Prive support if you don't have it.

## Debugging Verification Failures

1. Print the received header and your computed base64 digest side by side.
2. Confirm the body is the unparsed bytes (a re-serialized JSON body changes the HMAC).
3. Confirm the secret has no trailing whitespace or newline.
4. Check a proxy isn't altering the body or lowercasing/duplicating headers.
