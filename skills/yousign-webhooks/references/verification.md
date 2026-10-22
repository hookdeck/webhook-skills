# How to Verify Yousign Webhook Signatures

## How It Works

Yousign sends `X-Yousign-Signature-256: sha256=<hex>`:

1. Take the **raw request body** exactly as received.
2. Compute HMAC-SHA256 keyed with the webhook subscription secret (UTF-8).
3. Hex-encode and prefix with `sha256=`.
4. Compare with the header using a timing-safe comparison.

There is no signed timestamp. `x-yousign-issued-at` is a separate, unsigned header, so don't use it for authenticity. Deduplicate with `event_id` instead.

## Implementation

Yousign provides no webhook SDK; the docs show manual verification.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest((signature_header or "").encode(), expected.encode())
```

## Common Gotchas

- **Raw body:** Parsing and re-serializing JSON changes bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Prefix:** The header value includes `sha256=`; compare the full string or strip the prefix consistently.
- **Header case:** Headers are case-insensitive.
- **Timeout:** Respond 2xx within 1 second; process asynchronously.
- **Per-subscription secret:** Each subscription has its own secret, and sandbox and production subscriptions differ.

## Debugging Verification Failures

- Log the raw body length and compare with what your tunnel/proxy received.
- Confirm you are using the secret of the subscription that sent the request.
- Make sure no middleware (`express.json()`, body parsers) consumed the body first.
- Check for stray whitespace in the secret env var.
