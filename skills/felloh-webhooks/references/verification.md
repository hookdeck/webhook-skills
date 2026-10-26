# Felloh Signature Verification

## How Does Felloh Sign Webhooks?

Felloh signs the full JSON payload with HMAC-SHA256 and the webhook's signing key, and sends the result in the `X-Signature` header.

| | |
|---|---|
| Header | `X-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body bytes, nothing else |
| Key | The signing key, as UTF-8 bytes |
| Encoding | Hex, bare (no `sha256=` prefix) |
| Timestamp | None signed |

## Implementation

Felloh publishes no webhook-verification SDK, so verify manually. Both examples validate the header's format first, then compare in constant time.

### Node.js

```javascript
const crypto = require('crypto');
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verifyFellohSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !HEX_SHA256.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
```

Don't call `Buffer.from(sig, 'hex')` on an unchecked value: it silently drops invalid characters and truncates.

### Python

```python
import hashlib, hmac, re

def verify_felloh_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode(), expected.encode())
```

Pass bytes to `hmac.compare_digest`: it raises `TypeError` on a non-ASCII `str`.

## Common Gotchas

- **Raw body.** Verify before parsing. In Express use `express.raw({ type: '*/*' })`, in Next.js `await request.arrayBuffer()`, in FastAPI `await request.body()`. `JSON.parse` then `JSON.stringify` changes whitespace and key order, which breaks the digest.
- **Whole header value.** There is no prefix, list or `t=` part to parse.
- **Key encoding.** Don't hex- or base64-decode the signing key.
- **Case.** Hex is compared case-insensitively; lowercase both sides (or compare decoded bytes).
- **No replay window.** No timestamp is signed, so don't invent one from unsigned headers or body fields. Dedupe on the transaction, refund or booking id instead.
- **Test deliveries** (`X-Felloh-Test: true`) are signed with the real key. Verify them like any other.
- **Edit proxies.** Anything that changes the body (re-encoding, compression middleware that rewrites it) invalidates the signature.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Wrong or stale `FELLOH_WEBHOOK_SECRET` (the key is shown once; create a new webhook if lost) |
| `401` only after adding middleware | Body was parsed (`express.json()`) before verification |
| `401` on some requests only | A different webhook's key: each webhook has its own signing key |
| `TypeError` in Python | `str` passed to `compare_digest`; encode both sides to bytes |
| Endpoint never receives anything | URL not public, or non-2xx earlier: check the delivery log (kept 30 days) |

Hookdeck's Felloh source verifies the same signature (HMAC, SHA-256, header `x-signature`, hex), so a request that fails there will fail in your handler too.
