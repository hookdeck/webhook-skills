# How to Verify Flagsmith Webhook Signatures

## How It Works

When a webhook has a secret, Flagsmith adds `X-Flagsmith-Signature`:

```
hex( HMAC-SHA256( key = secret (UTF-8), message = raw request body (UTF-8) ) )
```

The same applies to environment, identity and audit-log webhooks. There is no timestamp, no prefix (no `sha256=`), and no Standard Webhooks headers. There is no official verification SDK; the docs show plain HMAC code.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyFlagsmithSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signatureHeader.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
}
```

### Python

```python
import hashlib, hmac

def verify_flagsmith_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature_header.strip().lower().encode())
```

## Common Gotchas

- **Use the raw body.** Express: `express.raw({ type: '*/*' })` so any content type verifies. Next.js: `await request.text()`. FastAPI: `await request.body()`. Re-serialising parsed JSON changes the bytes.
- **The secret is optional.** No secret means no header. If your endpoint requires verification, a missing header is a 400.
- **Hex, lowercase.** Not base64, no `sha256=` prefix.
- **No replay protection.** There's no timestamp to check; dedupe with idempotency in your handler.
- **Identity webhooks have no `event_type`.** Verification is identical; only the payload differs.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Header missing | No secret set on the webhook in Flagsmith |
| Always mismatching | Secret in your env differs from the dashboard (whitespace, quotes) |
| Mismatch only sometimes | A body parser or proxy modified the body before verification |
| Length error from `timingSafeEqual` | Compare lengths first (as in the example) |
