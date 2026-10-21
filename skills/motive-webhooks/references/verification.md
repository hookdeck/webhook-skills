# Motive Signature Verification

## How Does Motive Sign Webhooks?

Each webhook has a shared secret. Motive computes the **HMAC-SHA1 hex digest of the JSON payload** with that secret and sends it in the `X-KT-Webhook-Signature` header. You can reply 403 if it doesn't match your computed value.

- Algorithm: HMAC-SHA1
- Encoding: lowercase hex (40 characters)
- Signed content: the request body, exactly as sent
- Key: the webhook's secret as a plain string (20 characters)
- No timestamp, no prefix, no signed headers

## Implementation

Motive has no webhook-verification SDK, so all three examples verify manually with the standard library.

### Node.js

```javascript
const crypto = require('crypto');

function verifyMotiveSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
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

def verify_motive_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)
```

## Test Vector

| | |
|---|---|
| Secret | `d9d36bea41c44ae49d1bfc4a48ba2abe` |
| Body | `["fault_code_closed"]` |
| `X-KT-Webhook-Signature` | `f04a8386a21a6cba0447024e83b3f0983352bb72` |

```bash
printf '%s' '["fault_code_closed"]' | openssl dgst -sha1 -hmac d9d36bea41c44ae49d1bfc4a48ba2abe
```

## Common Gotchas

- **The docs' samples use the wrong key.** Both the bash (`openssl dgst -sha1 -hmac "f04a8386..."`) and Ruby samples pass the *signature* as the HMAC key. Following them gives a different digest. Key with the shared secret.
- **Raw body only.** Re-serializing parsed JSON can change whitespace, key order, or number formatting. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Don't base64-decode the secret.** It is used as the raw string.
- **403, not 400.** Motive documents 403 as "signature could not be verified" and does not retry it. Other 4xx/5xx responses are retried.
- **The activation test body isn't JSON.** `[vehicle_location_updated]` has no quotes, so verify first and don't fail on a parse error.
- **SHA-1 only.** A SHA-256 digest never matches.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret, or the secret changed (changing it also triggers a new test request) |
| Fails only in your own test script | You copied the docs' bash sample, which keys with the signature |
| Computed digest is right in a script but wrong in the app | A body-parser ran before verification |
| Length mismatch exceptions | Compare with a try/catch (Node) or `hmac.compare_digest` (Python) |
| Webhook won't enable | Endpoint didn't answer 200/201 within 3 seconds, or answered 403/400 to the test request |
