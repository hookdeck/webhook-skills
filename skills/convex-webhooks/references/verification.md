# How to Verify Convex Webhook Signatures

## How Does the Signature Work?

Convex signs the webhook log stream request body with HMAC-SHA256, encodes the digest as a lowercase hex string, and sends it in the `x-webhook-signature` header with a `sha256=` prefix:

```
x-webhook-signature: sha256=<lowercase hex>
```

- **Signed content:** the raw request body bytes only. No timestamp, id or other header is signed.
- **Key:** the HMAC secret shown in the dashboard, used as its UTF-8 bytes as-is (not hex- or base64-decoded).
- **Comparison:** constant time (Convex's own sample uses `crypto.subtle.verify`).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const received = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(received.toLowerCase()), Buffer.from(expected));
}
```

### Python

```python
import hashlib, hmac, re

def verify_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    if not signature_header or not secret:
        return False
    received = signature_header.removeprefix("sha256=").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", received):
        return False
    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.encode("ascii"), computed.encode("ascii"))
```

## Common Gotchas

- **Use the raw bytes.** Parsing and re-serializing the JSON changes the bytes. In Express use `express.raw({ type: '*/*' })`, in Next.js `await request.arrayBuffer()`, in FastAPI `await request.body()`.
- **Strip the prefix.** The header value starts with `sha256=`; the bare digest is also accepted here.
- **Validate the hex before decoding.** `Buffer.from(sig, 'hex')` silently drops invalid characters and truncates; check for exactly 64 hex characters first. Hex is compared case-insensitively.
- **Compare bytes in Python.** `hmac.compare_digest` on `str` raises for non-ASCII input; encode both sides.
- **The secret is not decoded.** Don't base64- or hex-decode it.
- **Batches.** The signature covers the whole body, including every event in the array.
- **Replay protection.** Nothing in the signature covers time. Convex's sample optionally rejects a batch whose first event `timestamp` is older than 5 minutes, but because delivery can be delayed and retried, these examples don't enforce a window; deduplicate instead.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails | Wrong secret (dev vs prod deployment), or the body was parsed before verifying |
| Fails only in some frameworks | Body re-encoded as a string, or a proxy changed the bytes |
| Fails on every request after recreating the stream | The secret is new; copy it again from the dashboard |
| Missing header | A request that did not come from Convex; respond `401` |
