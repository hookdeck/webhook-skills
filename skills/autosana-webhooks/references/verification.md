# How to Verify Autosana Webhook Signatures

## How It Works

When a signing secret is set, Autosana sends `X-Autosana-Signature-256: sha256=<hex>`:

1. Take the **raw request body** exactly as received.
2. Compute HMAC-SHA256 keyed with the signing secret (UTF-8).
3. Hex-encode the digest.
4. Require the `sha256=` prefix, strip it, and compare in constant time.

There is no signed timestamp and no delivery ID in the documented scheme, so signature checks alone do not protect against replays. Deduplicate on your side if that matters.

## Implementation

Autosana provides no webhook SDK; the docs show manual verification.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  // Buffer.from(x, 'hex') silently truncates invalid hex: validate the shape first
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}
```

An alternative that avoids hex decoding is to lowercase the received value, compare it as an equal-length UTF-8 `Buffer` against the computed hex string, and check the length before calling `timingSafeEqual` (it throws on a length mismatch).

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    received = signature_header[len("sha256="):].lower()
    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.encode("utf-8"), computed.encode("utf-8"))
```

`hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input, which would turn a bad header into a 500. Encoding both sides to bytes avoids that.

## Common Gotchas

- **Raw body:** Parsing and re-serializing JSON changes bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })` so any content type stays raw; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Unsigned deliveries:** If no signing secret was set on the Autosana webhook, there is no signature header and verification fails. Set a secret.
- **Prefix:** The header value is `sha256=<hex>`. Reject values without the prefix.
- **Docs sample:** The Node sample in Autosana's docs passes `Buffer.from(...)` of the strings straight to `timingSafeEqual`, which throws if the lengths differ. Validate the length (or hex shape) first.
- **Secret encoding:** The secret is used as a UTF-8 string, not hex or base64 decoded.
- **Header case:** Header names are case-insensitive.

## Debugging Verification Failures

- Confirm the secret in your env var (and in Hookdeck) matches the one on the Autosana webhook exactly, with no stray whitespace.
- Make sure no middleware (`express.json()`, body parsers) consumed the body first.
- Log the raw body length and compare with what your tunnel or proxy received.
- The Test button sends a payload from Autosana's API; it should still be signed if a secret is set.
