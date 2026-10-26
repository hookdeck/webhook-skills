# How to Verify Flux CD Webhook Signatures

## How Does Flux CD Signing Work?

A `generic-hmac` Provider adds `X-Signature: <hash-function>=<hash>` to each POST.

- Algorithm: HMAC-SHA256 today. The docs say the hash function "currently defaults to sha256, which may change in the future", and their Go sample also accepts `sha224`, `sha384` and `sha512`. Hookdeck verifies `sha256` only, and these examples do the same.
- Signed content: the raw request body bytes only. No timestamp, id or header is signed.
- Encoding: lowercase hex (compare case-insensitively).
- Key: the `token` of the Secret in the Provider's `spec.secretRef`, as UTF-8 bytes.
- Header value: `sha256=<hex>`. Strip the leading `sha256=`; the bare digest is accepted too.

There is no timestamp in the signature, so there is no replay window to enforce. Do not invent one from unsigned headers or body fields; use idempotency instead.

## Implementation

Flux provides no SDK. Verify manually; see [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/), [examples/fastapi/](../examples/fastapi/).

```javascript
const crypto = require('crypto');

function verify(rawBody /* Buffer */, header, secret) {
  if (!header || !secret) return false;
  const digest = header.startsWith('sha256=') ? header.slice(7) : header;
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return false;   // validate before decoding
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), expected);
}
```

```python
import hmac, hashlib, re

def verify(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header or not secret:
        return False
    digest = header.removeprefix("sha256=")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(digest), expected)
```

Respond `401` for a missing or empty header, a malformed value, or a mismatch.

## Common Gotchas

- **Generic Providers are unsigned.** Use a Flux Provider of type generic-hmac and paste the token from its Secret. Generic providers are unsigned and fail verification.
- **Raw body.** Hash the bytes exactly as received. Never decode to a string and re-encode, and never `JSON.parse`/`JSON.stringify` first. In Express use `express.raw({ type: '*/*' })`; in Next.js `await request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Key is not decoded.** The secret is used as UTF-8 bytes, not hex- or base64-decoded.
- **Length and alphabet first.** Do not call `Buffer.from(sig, 'hex')` on an unvalidated value; it silently drops bad characters. Check for exactly 64 hex characters, then compare equal-length buffers with `crypto.timingSafeEqual` or `hmac.compare_digest` on bytes.
- **Other hash functions.** A delivery signed with `sha512=` or similar fails here, as it does in Hookdeck.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| No `X-Signature` header | The Provider is type `generic`; change it to `generic-hmac` |
| Always mismatched | Wrong `token` (check the Secret key is named `token`, and for stray newlines when created from a file), or the body was parsed before hashing |
| Valid locally, fails behind a proxy | Something rewrote the body; verify against the bytes the proxy forwards |
| Malformed signature | Header value is not `sha256=` plus 64 hex characters |
