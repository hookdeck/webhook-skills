# Mistral Webhook Signature Verification

## How Does Mistral Sign Webhooks?

Every delivery has an `x-mistral-signature` header:

```
x-mistral-signature: hmac-sha256=<hex_digest>
```

- **Algorithm:** HMAC-SHA256
- **Signed content:** the raw request body (no timestamp, no id prefix)
- **Key:** the endpoint signing secret, used as a UTF-8 string (no base64 decoding, no prefix stripping)
- **Encoding:** lowercase hex, prefixed with `hmac-sha256=`

Mistral does not publish a webhook verification helper in its SDKs; verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, header, secret) {
  if (!header || !header.startsWith('hmac-sha256=')) return false;
  const received = header.slice('hmac-sha256='.length);
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    if not header or not header.startswith("hmac-sha256="):
        return False
    received = header.removeprefix("hmac-sha256=")
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Re-serialized JSON can change whitespace or key order and break the digest. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Strip the `hmac-sha256=` prefix** before comparing, or the comparison always fails.
- **Secret is a plain string**, not base64 or `whsec_`-style. Don't decode it.
- **Header name casing:** HTTP headers are case-insensitive; Node lowercases them (`req.headers['x-mistral-signature']`).
- **No replay protection in the signature.** There is no timestamp, so deduplicate with `session_id` + `event`.
- **Secrets can't be rotated.** If leaked, delete the endpoint and create a new one.

## Debugging Verification Failures

1. Confirm the secret belongs to the same endpoint that sent the delivery.
2. Log the length of the raw body and compare with what a proxy or tunnel forwarded; middleware that parses JSON first will break verification.
3. Check that the body wasn't modified by a gateway (compression, charset conversion).
4. Compute the digest locally for the captured body and compare to the header value.
