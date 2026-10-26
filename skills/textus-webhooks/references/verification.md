# TextUs Signature Verification

## How It Works

TextUs puts a hex HMAC-SHA256 of the request body in `X-TextUs-Signature`:

1. Read the header.
2. Take the **raw request body** as the message.
3. Compute `HMAC-SHA256(key = webhook secret, message = body)` and hex-encode it.
4. Compare with the header in constant time.

The key is the whole secret string (`textus-...`) as UTF-8. The header is bare
hex: no `sha256=` prefix, no timestamp. There is no official verification SDK.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyTextUsSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac

def verify_textus_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), header.lower().encode())
```

## Common Gotchas

- **Raw body.** Parsing and re-serializing JSON changes bytes. In Express use `express.raw({ type: '*/*' })`; in Next.js read `request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Keep the `textus-` prefix** in the key.
- **Validate hex before `Buffer.from(x, 'hex')`.** Invalid hex is silently truncated, so a short or garbage header could compare against a shortened buffer.
- **Compare bytes in Python.** `hmac.compare_digest` raises `TypeError` on non-ASCII `str`; encode both sides so bad headers give `401`, not `500`.
- **No timestamp.** The signature does not cover a timestamp, so it does not prevent replay. Deduplicate using the message identification field.
- **Respond fast.** Slow responses cause retries; acknowledge with `2xx` and process asynchronously.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails | Secret missing the `textus-` prefix, or body parsed before verifying |
| Fails for some content types | Body parser only handles `application/json`; use `type: '*/*'` |
| Fails only in production | A proxy re-encodes the body, or the wrong environment's secret is set |
| Header missing | A proxy stripped it, or the sender is not TextUs |
