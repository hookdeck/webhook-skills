# How to Verify High Mobility Webhook Signatures

## How It Works

- Header: `X-HM-Signature-256`, value `sha256=<lowercase hex digest>`
- Algorithm: HMAC-SHA256
- Key: the configured webhook secret string's UTF-8 bytes, used as-is (not decoded)
- Signed message: the exact raw request body bytes. No timestamp, id or other header is signed.

High Mobility also sends a deprecated `X-HM-Signature` (HMAC-SHA1) so old integrations can migrate. Verify only `X-HM-Signature-256`, as Hookdeck's source does.

## Implementation

High Mobility has no verification SDK, so use the manual check. Both versions strip a leading `sha256=` (the bare digest is accepted too), require exactly 64 hex characters, lowercase, and compare in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verifyHighMobility(rawBody, header, secret) {
  if (!secret || typeof header !== 'string') return false;
  let sig = header.trim();
  if (/^sha256=/i.test(sig)) sig = sig.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(sig.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_high_mobility(raw_body: bytes, header: str, secret: str) -> bool:
    if not secret or not header:
        return False
    sig = header.strip()
    if sig[:7].lower() == "sha256=":
        sig = sig[7:]
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(sig.lower().encode(), expected)
```

## Common Gotchas

- **Raw bytes.** Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`. FastAPI: `await request.body()`. Never `JSON.parse`/`JSON.stringify` (or decode and re-encode) before verifying.
- **The `sha256=` prefix** is part of the header value; comparing the whole value to a bare hex digest always fails.
- **Don't decode the secret.** Even if it looks like hex or base64, use its UTF-8 bytes.
- **Validate the digest before decoding it.** `Buffer.from(sig, 'hex')` silently drops bad characters; the examples check the length and alphabet first, then compare as strings of equal length.
- **No-body requests.** A request with no body is verified over zero bytes. Once it verifies, answer `200`.
- **No replay window.** Nothing time-based is signed, so don't invent a tolerance from unsigned headers or body fields.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong secret, or the body was parsed and re-serialised before verifying |
| 401 only on some requests | Different method or content type reaching a route that parses the body; use the raw body on every method |
| 401 with a valid-looking digest | Comparing against the whole header including `sha256=` |
| Works locally, fails via Hookdeck | The source's secret differs from the one in the High Mobility console |
