# Circleback Signature Verification

## How Does Circleback Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `x-signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body (bytes as sent) |
| Key | The signing secret from the automation's webhook step, as a UTF-8 string |
| Encoding | Bare lowercase hex (64 characters), no `sha256=` prefix |
| Timestamp / replay protection | None |

Circleback's docs describe verification as optional but recommended.

## Implementation

There is no Circleback SDK for verification, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyCirclebackSignature(rawBody, signature, secret) {
  // Validate before decoding: Buffer.from(x, 'hex') silently truncates invalid hex
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

An alternative that skips decoding is to compare the lowercase hex strings as
equal-length UTF-8 Buffers after a length check, as Circleback's own sample does.

### Python

```python
import hashlib, hmac, re

def verify_circleback_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(expected, signature.lower().encode())
```

## Common Gotchas

- **Raw body only.** Parsing and re-serializing JSON changes bytes. In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Hex validation.** Check for exactly 64 hex characters before `Buffer.from(sig, 'hex')`.
- **Bytes in Python.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str`; encode both sides to bytes so a junk header gives 401, not 500.
- **Secret is a plain string.** Don't base64-decode it or strip a prefix.
- **Header casing.** Node lowercases header names; FastAPI's `request.headers` is case-insensitive.
- **No replay window.** There is no timestamp, so dedupe on the meeting `id`.

## How to Debug Verification Failures

1. Confirm the secret is the one from *this* automation's webhook step (each has its own).
2. Log the raw body length and compare it with the `content-length` header; a mismatch means a middleware changed the body.
3. Recompute the HMAC locally with `openssl dgst -sha256 -hmac "$SECRET" body.json` on the saved raw body and compare it with `x-signature`.
4. Make sure no proxy compresses or rewrites the body.
