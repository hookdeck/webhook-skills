# How to Verify Spike API Webhook Signatures

## How Does Spike API Sign Webhooks?

- Header: `X-Body-Signature`
- Algorithm: HMAC-SHA256 over the **raw request body** only
- Key: the shared secret from the admin console, used as-is (UTF-8 bytes)
- Encoding: bare lowercase hex digest (64 chars), the whole header value, no prefix

No timestamp, id or other header is signed, so there is no replay window to check.
Protect against duplicates with idempotent handling instead.

## Implementation

Spike API publishes no webhook SDK; its docs show the manual comparison in Go,
JavaScript, PHP, Python and TypeScript.

### Node.js

```javascript
const crypto = require('crypto');

function verifySpikeSignature(rawBody, signature, secret) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}
```

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

## Common Gotchas

- **Raw body**: Express needs `express.raw({ type: '*/*' })` so any content type is verified over the exact bytes; Next.js uses `await request.arrayBuffer()`; FastAPI uses `await request.body()`. Never `JSON.parse`/`JSON.stringify` before verifying.
- **Validate hex before `Buffer.from(x, 'hex')`**: invalid characters are silently dropped.
- **`timingSafeEqual` throws on length mismatch**: check lengths first (the 64-hex check does this).
- **Python `compare_digest` with `str`**: raises `TypeError` for non-ASCII input (a 500). Compare bytes.
- **Case**: hex is compared case-insensitively; lowercase both sides.
- **Array body**: the verified body is a JSON array, so loop over it; and check types of everything inside.
- **Status code**: respond with exactly 200 on success; other codes trigger retries.

## Debugging Verification Failures

1. Confirm the secret is the shared key from the admin console, unmodified.
2. Confirm you hash the raw bytes, not parsed or re-serialized JSON.
3. Confirm you read `X-Body-Signature` (not `X-Signature` or similar).
4. Confirm no proxy or middleware altered the body.
