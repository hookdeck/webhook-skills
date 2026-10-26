# Argyle Signature Verification

## How Does Argyle Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `X-Argyle-Signature` |
| Algorithm | HMAC-SHA512 |
| Signed content | The raw request body bytes only |
| Key | The subscription `secret`, as UTF-8 bytes, used as-is |
| Encoding | Lowercase hex, 128 characters, no prefix |
| Timestamp | None signed, so no replay window |

Argyle's docs: "Read the raw request body without parsing or reformatting it. Create an HMAC-SHA512
digest using the subscription secret. Compare the hexadecimal digest with X-Argyle-Signature using a
timing-safe comparison." Compare the **whole** header value as one digest (no list splitting, no prefix).

## Implementation

Argyle publishes no SDK for verification, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyArgyleSignature(rawBody, signature, secret) {
  if (!secret) return false;
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{128}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Never call `Buffer.from(sig, 'hex')` on an unvalidated header: it silently drops bad characters.

### Python

```python
import hashlib, hmac, re

def verify_argyle_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str) or not re.fullmatch(r"[0-9a-fA-F]{128}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))
```

Compare bytes, never `str` (`compare_digest` raises on non-ASCII `str`).

## Common Gotchas

- **Raw body**: Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI:
  `await request.body()`. Parse JSON only after the check. Re-serialized JSON changes the bytes.
- **No body**: a request with no body (for example GET) is verified over zero bytes, and once verified
  is acknowledged with 200, not rejected as invalid JSON.
- **No secret, no signature**: a subscription without a `secret` sends no header, so verification fails.
- **No timestamp**: nothing signed is time-bound. Don't invent a replay window from unsigned fields;
  use idempotency.
- **Method**: all of GET, POST, PUT, PATCH and DELETE are accepted, and Hookdeck's Argyle source
  pre-selects POST without managing the method, so allow other methods on the source.
- **Case**: hex is compared case-insensitively.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401, header missing | The subscription has no `secret` |
| 401, header present | Wrong `ARGYLE_WEBHOOK_SECRET`, or a body parser changed the bytes |
| 401 only on some requests | A proxy or middleware altered the body, or the secret was rotated |
| Header isn't 128 hex characters | Something other than Argyle sent the request |
