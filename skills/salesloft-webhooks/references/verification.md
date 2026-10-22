# How to Verify Salesloft Webhook Signatures

## How Does Salesloft Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `x-salesloft-signature` |
| Algorithm | HMAC-SHA1 |
| Key | The subscription's `callback_token` |
| Encoding | Hex digest (40 characters), no prefix |
| Signed content | The raw request body |
| Timestamp / replay protection | None |
| Standard Webhooks | No |
| SDK | None: verify manually with your language's crypto library |

Salesloft's docs describe it as "the HMAC hex digest of the response body", generated using `sha1` with the `callback_token` as the HMAC key.

## Implementation

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifySalesloftSignature(rawBody, signature, callbackToken) {
  if (!signature || !callbackToken) return false;
  const expected = crypto.createHmac('sha1', callbackToken).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature.trim().toLowerCase()), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python (FastAPI)

```python
import hashlib, hmac

def verify_salesloft_signature(raw_body: bytes, signature, callback_token) -> bool:
    if not signature or not callback_token:
        return False
    expected = hmac.new(callback_token.encode(), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.strip().lower().encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes the bytes. In Express use `express.raw({ type: '*/*' })`, in Next.js `await request.text()`, in FastAPI `await request.body()`.
- **Don't depend on Content-Type.** Reading the body as raw bytes for every content type avoids a middleware skipping the body.
- **SHA-1, not SHA-256.** A SHA-256 HMAC will never match.
- **Key is the `callback_token`,** not an OAuth token or API key.
- **No timestamp.** Salesloft doesn't sign one, so use idempotency to cope with replays and retries.
- **Don't trust the echoed token.** The `callback_token` also appears in the payload; the HMAC header is the check.

## Debugging Verification Failures

1. Confirm `SALESLOFT_CALLBACK_TOKEN` equals the `callback_token` on the subscription (fetch it via the Webhook Subscriptions API).
2. Log the length of the raw body and make sure no middleware consumed or re-encoded it.
3. Recompute by hand: `printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$TOKEN"`.
4. Check each subscription: different subscriptions may use different tokens.
