# How to Verify Bump.sh Webhook Signatures

## How Does Bump.sh Sign Webhooks?

Bump.sh computes an **HMAC-SHA256** over the **raw request body** using the webhook's secret token as the key, hex-encodes it in lowercase, and sends `sha256=<hex>` in the `X-Bump-Signature-256` header. Bump.sh's own pseudo-code (Ruby) is:

```ruby
signature = "sha256=" + OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new("sha256"), ENV["SECRET_TOKEN"], payload_body)
Rack::Utils.secure_compare(signature, request.env["HTTP_X_BUMP_SIGNATURE_256"])
```

`HTTP_X_BUMP_SIGNATURE_256` is how Rack exposes the `X-Bump-Signature-256` header. Bump.sh's API reference names the header `X_BUMP_SIGNATURE_256` and shows a bare 64-hex example, so the examples here accept the value **with or without** the `sha256=` prefix.

Only the body is signed: no timestamp, id or other header. There is no replay window to check, and you shouldn't invent one from unsigned headers or body fields. Use idempotent handlers instead.

## Implementation

There is no Bump.sh SDK for this, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

function verifyBumpSignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const sig = header.startsWith('sha256=') ? header.slice(7) : header;
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(sig, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_bump_signature(raw_body: bytes, header, secret: str) -> bool:
    if not secret or not header:
        return False
    sig = header.removeprefix("sha256=")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(sig), expected)
```

## Common Gotchas

- **Use the raw bytes.** Build the HMAC over the body bytes exactly as received. Never decode to a string and re-encode, and never `JSON.parse`/`JSON.stringify` before verifying. In Express use `express.raw({ type: '*/*' })` so any content type works; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`.
- **The key is the secret's UTF-8 bytes**, used as-is. Don't hex- or base64-decode it.
- **Validate the signature before decoding it.** `Buffer.from(sig, 'hex')` silently drops invalid characters, so check for exactly 64 hex characters first. Hex is case-insensitive, so `AB..` and `ab..` are the same digest.
- **Compare in constant time**: `crypto.timingSafeEqual` on equal-length Buffers, `hmac.compare_digest` on bytes (not `str`).
- **Missing or empty header, malformed value or mismatch: respond `401`.**
- **Parse only after verifying**, and check the type of the body and of `api`/`diff` before reading into them.
- **Hookdeck:** the Bump.sh source type in Hookdeck verifies this signature (HMAC SHA-256, `x-bump-signature-256`, hex) on its own. Your handler should still verify if it can be reached directly.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret (copy it again from the webhook's confirmation screen), or the body was parsed before verification |
| Fails only for some bodies | The body was re-serialized, or decoded as text with a lossy encoding |
| `401` for a request with no signature | The header is missing: the request didn't come from Bump.sh (or a proxy removed the header) |
| Works locally, fails behind a proxy | A proxy or middleware changed the body bytes |
