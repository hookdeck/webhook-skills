# How to Verify Northpass Webhook Signatures

## How Does Northpass Sign Webhooks?

Every request includes `X-Northpass-Hmac-SHA256`, generated with your school's shared secret and
the data sent in the body of the request:

- Algorithm: HMAC-SHA256
- Key: the shared secret, as UTF-8 bytes, used as-is
- Message: the raw request body bytes (nothing else: no timestamp, id or other header)
- Encoding: standard base64 with padding (44 characters ending in `=`), no prefix

Northpass's own sample is `base64.b64encode(hmac.new(SHARED_SECRET, data, hashlib.sha256).digest()).decode().strip()`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const SIGNATURE_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

function verifyNorthpassSignature(rawBody, signature, secret) { // rawBody: Buffer
  if (!secret || typeof signature !== 'string' || !SIGNATURE_FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import base64, hashlib, hmac, re

SIGNATURE_FORMAT = re.compile(rb"[A-Za-z0-9+/]{43}=")

def verify_northpass_signature(raw_body: bytes, signature, secret) -> bool:
    if not secret or not signature:
        return False
    try:
        received = signature.encode("ascii")
    except UnicodeEncodeError:
        return False
    if not SIGNATURE_FORMAT.fullmatch(received):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(received, base64.b64encode(digest))
```

Northpass publishes no SDK for this, so the examples verify manually in all three frameworks.

## Common Gotchas

- **Raw body.** Verify the bytes exactly as received. Never `JSON.parse` then `JSON.stringify`,
  and never decode to a string and re-encode. Express: `express.raw({ type: '*/*' })`; Next.js:
  `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Compare the base64 string, not decoded bytes.** A value whose last character carries stray
  low bits decodes to the same bytes but is not the canonical digest. Check the 44-character
  `[A-Za-z0-9+/]{43}=` form, then compare strings in constant time.
- **Validate before decoding.** `Buffer.from(sig, 'base64')` silently drops bad characters, so do
  not call it on an unvalidated header.
- **Constant time.** `crypto.timingSafeEqual` throws on unequal lengths: check lengths first.
  Python `hmac.compare_digest` raises on non-ASCII `str`: compare bytes.
- **Key is not decoded.** Use the secret's UTF-8 bytes; do not base64- or hex-decode it.
- **No replay protection.** No timestamp is signed, so do not invent a tolerance window from
  unsigned headers or body fields. De-duplicate on `data.id` instead.

## Debugging Verification Failures

- **Always 401:** is `NORTHPASS_WEBHOOK_SECRET` the school's shared secret from the Webhooks app,
  with no stray quotes or newline? A middleware that parses JSON before your route changes the bytes.
- **Works in tests, fails live:** a proxy or framework re-serialised the body. Log
  `rawBody.length` and compare with the request's `Content-Length`.
- **Header missing:** header names are case-insensitive; read `x-northpass-hmac-sha256`.
- **Webhooks stopped arriving:** repeated failures for 24 hours disable all of the school's
  webhooks; re-enable them in the Webhooks app.
