# Lago Webhook Signature Verification (HMAC)

## How Does Lago HMAC Verification Work?

- Header: `X-Lago-Signature`
- Algorithm: HMAC-SHA256
- Key: your organization's HMAC Signature Token (Developers > Webhooks)
- Signed content: the **raw request body** only (no timestamp or id prefix)
- Encoding: **base64** (not hex)
- Companion header: `X-Lago-Signature-Algorithm: hmac`

Lago has no official helper for HMAC webhook verification, so verify manually.

## Which Algorithm Is My Endpoint Using?

Lago's default is `jwt`: `X-Lago-Signature` is then an RS256 JWT, verified with the public key from `/api/v1/webhooks/json_public_key`. That mode is **not covered** by this skill. If `X-Lago-Signature-Algorithm` is `jwt`, recreate the endpoint with `hmac`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyLagoSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import base64, hashlib, hmac

def verify_lago_signature(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    digest = hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(signature_header, expected)
```

## Common Gotchas

- **Raw body.** Re-serialized JSON changes bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Base64, not hex.** Compare against the base64 digest.
- **Wrong secret.** Use the HMAC Signature Token, not the API key.
- **Endpoint is `jwt`.** The header is a long JWT, not a short base64 string.
- **No timestamp.** Lago signs only the body, so use `X-Lago-Unique-Key` for deduplication.

## Debugging Verification Failures

1. Check `X-Lago-Signature-Algorithm` is `hmac`.
2. Log the length of the raw body and make sure no middleware parsed it.
3. Confirm `LAGO_HMAC_KEY` matches the token shown in the Lago dashboard, with no stray whitespace.
4. Return `400` on failure; Lago will retry up to 3 times.
