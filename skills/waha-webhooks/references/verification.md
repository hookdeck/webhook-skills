# How to Verify WAHA Webhook Signatures

## How It Works

When a webhook has an HMAC key, WAHA sends:

- `X-Webhook-Hmac`: hex-encoded HMAC-SHA512 of the raw HTTP body
- `X-Webhook-Hmac-Algorithm`: `sha512`

The key is used as a plain UTF-8 string (not base64-decoded). The signed content is just the body: no timestamp or id is prepended. `X-Webhook-Timestamp` and `X-Webhook-Request-Id` are sent as separate headers but are not part of the signature.

WAHA has no webhook verification SDK, so verification is manual in every framework.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyWahaSignature(rawBody, signature, secret, algorithm = 'sha512') {
  if (!signature || !secret) return false;
  if (String(algorithm).toLowerCase() !== 'sha512') return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hashlib, hmac

def verify_waha_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(signature.lower().encode(), expected.encode())
```

### Test vector (from the WAHA docs)

- Body: `{"event":"message","session":"default","engine":"WEBJS"}`
- Key: `my-secret-key`
- `X-Webhook-Hmac`: `208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89`

## Common Gotchas

- **HMAC is opt-in.** If you never set `hmac.key`, WAHA sends no signature headers. A handler that requires the header will reject every delivery until a key is set, and one that skips verification accepts forged requests.
- **Use the raw body.** Re-serializing parsed JSON changes whitespace and key order. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Any content type.** Don't gate the raw-body parser on `application/json`.
- **SHA-512, not SHA-256.** The digest is 128 hex characters.
- **No replay protection.** The signature doesn't cover a timestamp, so de-duplicate on the envelope `id` (`evt_…`) or `X-Webhook-Request-Id`; retries resend the same event.
- **Key mismatch across sessions.** The key is per webhook; a multi-session setup may use different keys.

## Debugging Verification Failures

1. Compute the HMAC of the docs test vector with your function; if it doesn't match `208f8a55…`, the bug is in your code.
2. Log `Buffer.byteLength(rawBody)` and compare with `Content-Length`; a mismatch means a middleware changed the body.
3. Confirm the key in your env equals the one in WAHA (`hmac.key` / `WHATSAPP_HOOK_HMAC_KEY`) with no trailing newline or quotes.
4. Check `X-Webhook-Hmac-Algorithm` is `sha512`.
5. Behind a proxy or gateway? Make sure it forwards the body and `X-Webhook-Hmac` unchanged.
