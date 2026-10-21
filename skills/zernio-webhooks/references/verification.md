# How to Verify Zernio Webhook Signatures

## How Does Zernio Signing Work?

- Algorithm: HMAC-SHA256
- Key: the secret **you** sent when creating the endpoint (Zernio never generates one)
- Signed content: the **raw request body**, exactly as received (no timestamp, no event id)
- Encoding: lowercase hex
- Header: `X-Zernio-Signature`. `X-Late-Signature` is a legacy alias with the same value.
- Signed only when the endpoint has a secret; otherwise no signature header is sent.

Zernio does not follow the Standard Webhooks format (no `webhook-id`, `webhook-timestamp` or `webhook-signature`). There is no official verification SDK; the docs show manual HMAC verification, which is what the examples use.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyZernioWebhook(rawBody, signatureHeader, secret) {
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

def verify_zernio_webhook(raw_body: bytes, signature_header, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes bytes. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **The secret is yours.** If verification always fails, check that `ZERNIO_WEBHOOK_SECRET` matches what you sent in `POST /v1/webhooks/settings` (update it with the update call if unsure).
- **Unsigned deliveries.** An endpoint created without a secret sends no signature. A handler that requires a signature will reject all of them with 401, which Zernio treats as a failure and retries.
- **Header aliases.** Read `X-Zernio-Signature`, falling back to `X-Late-Signature` for older integrations.
- **No replay protection in the signature.** Deduplicate on `payload.id` (also `X-Zernio-Event-Id`); retries and redeliveries carry the same id and the same signature.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`; `timingSafeEqual` throws on length mismatch, so catch it.
- **Hex case.** Zernio sends lowercase hex; the computed digest is lowercase too.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Wrong secret, or body was parsed before verifying |
| Missing signature header | Endpoint has no secret; add one via the update call |
| Invalid only for some events | A proxy or middleware is modifying the body |
| Test event works, real ones fail | Different endpoint (and secret) is subscribed to the real events |

Check attempts and response bodies in the Zernio webhook logs.
