# Dwolla Signature Verification

## How Does Dwolla Webhook Signing Work?

Before sending a webhook, Dwolla computes `HMAC-SHA256(secret, raw JSON body)` and sends the lowercase hex digest in the `X-Request-Signature-SHA-256` header.

- Header: `X-Request-Signature-SHA-256`
- Algorithm: HMAC-SHA256, hex encoded, no prefix
- Signed content: the raw request body only (no timestamp)
- Key: the `secret` string you supplied when creating the webhook subscription, used as-is (not base64 decoded)
- IP allowlisting: not supported; Dwolla's IPs are dynamic

Dwolla documents manual verification only and does not provide a webhook verification SDK helper.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

Dwolla's own example uses `===` for the comparison; prefer a timing-safe comparison.

## Common Gotchas

- **Raw body**: Never re-encode the JSON. Dwolla warns this breaks the signature. In Express use `express.raw({ type: '*/*' })` (Dwolla sends `application/vnd.dwolla.v1.hal+json`, which `express.json()` would not match by default); in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Secret is yours**: a mismatch usually means the secret differs from the one sent when the subscription was created, or you are mixing Sandbox and Production.
- **Hex case**: the digest is lowercase hex.
- **No timestamp**: nothing in the signature prevents replays, so dedupe on the event `id`.
- **Middleware**: services that cannot read the body (e.g. AWS Lambda Authorizers) cannot authenticate Dwolla webhooks.

## Debugging Verification Failures

1. Log the length of the raw body and confirm it is the unparsed bytes.
2. Compute the HMAC locally with the secret and compare to the header.
3. Confirm the header name is exactly `X-Request-Signature-SHA-256` (frameworks lowercase it).
4. Check for a proxy or gateway that rewrites the body.
5. Re-check the secret by creating a new subscription with a known one.
