# Missive Signature Verification

## How Does Missive Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `X-Hook-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body (bytes as sent) |
| Key | The validation secret set on the rule's webhook action, as a UTF-8 string |
| Encoding | `sha256=` followed by the lowercase hex digest (64 characters) |
| Timestamp / replay protection | None |

The header is only sent when a validation secret is defined on the rule action.
Missive's reference sample (Ruby) is:

```ruby
computed_signature = 'sha256=' + OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new('sha256'), secret, request_body)
valid = Rack::Utils.secure_compare(x_hook_signature, computed_signature)
```

## Implementation

There is no Missive SDK for verification, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyMissiveSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const sig = header.slice('sha256='.length);
  // Validate before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'));
}
```

An alternative that skips decoding is to compare the lowercase hex strings as
equal-length UTF-8 Buffers with `crypto.timingSafeEqual` after a length check.

### Python

```python
import hashlib, hmac, re

def verify_missive_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header or not header.startswith("sha256="):
        return False
    sig = header[len("sha256="):]
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(expected, sig.lower().encode())
```

## Common Gotchas

- **Raw body only.** Parsing and re-serializing JSON changes bytes. In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Require the prefix.** The header is `sha256=<hex>`, not bare hex; reject anything else, then strip the prefix.
- **Hex validation.** Check for exactly 64 hex characters before `Buffer.from(sig, 'hex')`.
- **Bytes in Python.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str`; encode both sides to bytes so a junk header gives 401, not 500.
- **Unsigned rules.** If no validation secret is set on the rule, no header is sent and verification fails. Set one.
- **No replay window.** There is no timestamp, and retries re-send the same body, so dedupe instead.

## How to Debug Verification Failures

1. Confirm the secret equals the validation secret on *this* rule's webhook action.
2. Log the raw body length and compare it with `content-length`; a mismatch means a middleware changed the body.
3. Recompute locally: `openssl dgst -sha256 -hmac "$SECRET" body.json` on the saved raw body, prefix with `sha256=`, and compare with `X-Hook-Signature`.
4. Make sure no proxy compresses or rewrites the body.
