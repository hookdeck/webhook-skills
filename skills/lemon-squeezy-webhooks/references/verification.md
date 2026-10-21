# Lemon Squeezy Signature Verification

## How Does Lemon Squeezy Sign Webhooks?

Lemon Squeezy computes an HMAC-SHA256 of the **raw request body** using your signing secret and sends the **hex digest** in the `X-Signature` header.

| Item | Value |
|------|-------|
| Header | `X-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body (no timestamp, no ID) |
| Encoding | Lowercase hex, no prefix |
| Key | The signing secret you entered (6-40 chars), used as a raw string |
| Standard Webhooks | No |

There is no official webhook verification helper in the Lemon Squeezy SDK, so verify manually as below.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
  const received = Buffer.from(signatureHeader, 'utf8');
  // timingSafeEqual throws if lengths differ
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
```

With Express use `express.raw({ type: '*/*' })`; with Next.js use `await request.text()`.

### Python

```python
import hmac, hashlib

def verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature_header.encode())
```

With FastAPI use `await request.body()`.

## Common Gotchas

- **Raw body**: re-serialising parsed JSON changes whitespace and key order, so the hash won't match. Verify before parsing.
- **Secret is not decoded**: do not base64-decode it or strip a prefix.
- **Compare as hex strings**: the header is already hex. Don't decode it to bytes unless you do it on both sides.
- **Header casing**: HTTP headers are case-insensitive; frameworks may expose `x-signature`.
- **No replay protection**: there's no timestamp, so deduplicate events in your handler.
- **Secret mismatch after editing the webhook**: if you change the signing secret in the dashboard, update your environment variable too.

## How Do I Debug Verification Failures?

1. Log the raw body length and confirm it's the original bytes (not re-parsed).
2. Confirm `LEMON_SQUEEZY_SIGNING_SECRET` exactly matches the dashboard (no trailing newline or quotes).
3. Check that a proxy or middleware isn't altering the body (compression, charset conversion).
4. Resend a delivery from **Settings > Webhooks** after fixing the code.
