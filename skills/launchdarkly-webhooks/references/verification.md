# LaunchDarkly Signature Verification

## How Does LaunchDarkly Sign Webhooks?

If the webhook has a secret, each POST includes an `X-LD-Signature` header containing the **HMAC-SHA256 hex digest of the raw request body**, using the secret as the key. No prefix, no timestamp, no Standard Webhooks headers. LaunchDarkly publishes no SDK helper for this, so verification is manual.

If no secret is set, **no signature is sent**. Treat a missing header as a failure and require a secret.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
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
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

## Common Gotchas

- **Unsigned deliveries:** signing is opt-in. Enable "Sign this webhook" and fail closed in your handler if the secret is unset.
- **Raw body:** compute the HMAC over the exact bytes received. Re-serializing parsed JSON changes the bytes. In Express use `express.raw({ type: '*/*' })`.
- **No timestamp:** replays can't be rejected by age. Dedupe on `_id`.
- **Header name:** `X-LD-Signature` (case-insensitive; lowercase `x-ld-signature` in Node/Next.js/FastAPI).
- **Length mismatch:** `timingSafeEqual` throws on unequal lengths; catch it.

## Debugging Verification Failures

- Missing header → webhook not signed; edit it and enable signing.
- Mismatch → wrong secret (copy it again), body modified by middleware/proxy, or secret has stray whitespace.
- Compare against `openssl dgst -sha256 -hmac "$SECRET" body.json`.
