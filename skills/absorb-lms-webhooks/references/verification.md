# How to Verify Absorb LMS Webhook Signatures

## How Does Absorb LMS Sign Webhooks?

| Item | Value |
|------|-------|
| Header | `absorb-signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body only (no timestamp, no message ID) |
| Key | The webhook's Secret Key, used as a UTF-8 string |
| Encoding | Bare lowercase hex (64 characters), no prefix |

Absorb's guidance: use only the request body as input, exactly as received. Any change to
spaces or line breaks changes the signature.

## Implementation

Absorb has no webhook SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAbsorbSignature(rawBody, signature, secret = process.env.ABSORB_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string') return false;
  // Exactly 64 hex chars first: Buffer.from(x, 'hex') silently truncates invalid input.
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python

```python
import hashlib, hmac

def verify_absorb_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500.
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))
```

## Common Gotchas

- **Test Webhook can't be verified.** Test requests use a random signature, not your Secret Key.
- **Use the raw body.** In Express read it with `express.raw({ type: '*/*' })` so any content
  type is verified, not only `application/json`. In Next.js use `request.arrayBuffer()`; in
  FastAPI `await request.body()`. Never re-serialize parsed JSON.
- **Secret Key is a plain string.** Don't hex- or base64-decode it before keying the HMAC.
- **The Secret Key exists only after the first save.** A new, unsaved webhook has none.
- **Each webhook has its own key.** Sandbox and production keys differ.
- **No timestamp.** Signatures never expire, so deduplicate events (the payload includes a
  Correlation ID) rather than relying on a freshness window.
- **Reject when no secret is configured.** An empty key would make the HMAC trivially forgeable.

## How Do I Debug Verification Failures?

1. Is the request a Test Webhook click? It will always fail.
2. Does `ABSORB_WEBHOOK_SECRET` match the Secret Key on that exact (saved) webhook?
3. Is something between Absorb and your code re-encoding the body (a JSON body parser, a proxy
   that reformats)? Log `rawBody.length` and the first bytes.
4. Is the header 64 hex characters? Anything else is rejected before the HMAC is computed.
5. Compute the HMAC locally: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`.
