# Live Tennis API Signature Verification

## How Does Live Tennis API Sign Webhooks?

Each request carries:

```
X-LTAPI-Signature: sha256=<64 hex chars>
X-LTAPI-Timestamp: 1790000000
X-LTAPI-Event: score
```

The signature is the **hex** HMAC-SHA256 of the **raw request body**, keyed with the webhook `secret` from the `POST /webhooks` response (used as-is, as a string). Only the body is signed. `X-LTAPI-Timestamp` and `X-LTAPI-Event` are **not** covered by the signature.

## Implementation

Live Tennis API has no webhook verification SDK, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

function verifyLiveTennisSignature(rawBody, header, secret) {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(typeof header === 'string' ? header : '');
  if (!match) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}
```

Check the received value is exactly 64 hex characters **before** `Buffer.from(x, 'hex')`: invalid hex is silently truncated, which would make a garbage header compare against a shorter buffer. An alternative is to compare the lowercase hex strings as equal-length UTF-8 buffers after a length check.

### Python

```python
import hashlib
import hmac

def verify_live_tennis_signature(raw_body: bytes, header: str, secret: str) -> bool:
    if not header.startswith("sha256="):
        return False
    received = header[len("sha256="):].lower()
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.encode(), expected.encode())
```

`hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input, so a hostile header would give a 500. Encode both sides to bytes so it simply returns `False` and you answer 401.

## Common Gotchas

- **Use the raw body.** In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Require the `sha256=` prefix.** Reject a header without it.
- **Don't trust the timestamp.** `X-LTAPI-Timestamp` is unsigned, so a replay check built on it can be bypassed by rewriting the header. If you add one anyway, make it opt-in. Note that Hookdeck retries and replays keep the original request headers, so a freshness window would reject legitimate replays. Dedupe instead: `point.seq` for `point` frames and `sequence` for `score` frames.
- **Prefer the body `type` over `X-LTAPI-Event`.** Only the body is signed, so the examples dispatch on `type` and use the header as a fallback.
- **The secret is shown once.** If you lose it, delete the webhook and register a new one.

## Debugging Verification Failures

- **Always 401:** you are probably using a parsed or re-serialized body. Use the exact bytes received.
- **Secret mismatch:** the secret belongs to one webhook registration. A re-registered webhook has a new secret.
- **Works locally, fails behind a proxy:** make sure the proxy doesn't modify the body (decompress, re-encode). Hookdeck forwards the original body.
