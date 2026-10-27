# How to Verify Taskade Webhook Signatures

> Only webhooks registered through the Taskade public API (Pro plan and above) are supported. Legacy webhooks are unsigned and fail verification.

## How It Works

Every delivery carries `X-Taskade-Signature: sha256=<hex>`. The hex is the lowercase HMAC-SHA256 of the **raw request body bytes**, keyed with the webhook's signing secret (the UTF-8 bytes of the `secret` returned at registration, not hex- or base64-decoded). Only the body is signed: no timestamp, ID or other header, so there is no replay window to check. Don't invent one from unsigned data.

Accept the header with or without the `sha256=` prefix. Hex is case-insensitive.

## Implementation

Taskade documents no webhook SDK; verify manually. Validate the format (exactly 64 hex characters) before decoding, then compare in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const sig = signatureHeader.trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    sig = re.sub(r"^sha256=", "", signature_header.strip(), flags=re.I)
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sig):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(sig), expected)
```

## Common Gotchas

- **Use the raw bytes.** Never `JSON.parse`/`JSON.stringify` before verifying, and don't decode to a string and re-encode. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check the 64-hex format first. `timingSafeEqual` throws on unequal lengths.
- **Compare bytes, not str, in Python.** `hmac.compare_digest` on `str` raises for non-ASCII input.
- **The secret is shown once.** Lost secret means a new webhook.
- **Legacy webhooks are unsigned** and fail verification.
- **Respond `401`** for a missing, malformed or mismatched signature.

## Debugging Verification Failures

1. Header missing: the webhook is a legacy one, or a proxy stripped the header.
2. Mismatch: confirm `TASKADE_WEBHOOK_SECRET` equals the registration `secret` exactly (no quotes or trailing newline).
3. Mismatch on some requests only: a body parser touched the bytes before verification.
