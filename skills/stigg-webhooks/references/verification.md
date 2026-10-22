# How to Verify Stigg Webhooks

## How Does Stigg Authenticate Webhooks?

Stigg doesn't sign the payload. Every event carries the webhook's secret in the `Stigg-Webhooks-Secret` header. To verify an event, check that the header matches the secret on the webhook details page. Stigg lists HMAC signature support as being on its roadmap.

Because the secret is a shared token, no HMAC or timestamp is computed and there's no signed body. Treat the secret like a password.

## Implementation

Compare in constant time. `timingSafeEqual` and `compare_digest` need equal-length inputs, so hash both sides first.

### Node.js

```javascript
const crypto = require('crypto');

function verifyStiggSecret(header, secret) {
  if (!header || !secret) return false;
  const a = crypto.createHash('sha256').update(header).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac

def verify_stigg_secret(header, secret):
    if not header or not secret:
        return False
    return hmac.compare_digest(
        hashlib.sha256(header.encode()).digest(),
        hashlib.sha256(secret.encode()).digest(),
    )
```

## Common Gotchas

- **No payload signature.** The raw body isn't signed, so the examples still read it raw (`express.raw({ type: '*/*' })`) and parse JSON afterwards, which works for any content type.
- **Fail closed.** If `STIGG_WEBHOOK_SECRET` isn't set, return `500` rather than accepting everything.
- **Secret per webhook.** Each webhook has its own secret. If you register several, keep a secret per endpoint.
- **Header casing.** HTTP headers are case-insensitive; frameworks usually lowercase them (`stigg-webhooks-secret`).
- **De-duplicate on `messageId`.** Retries re-send the same event.
- **Add the IP.** Optionally restrict to `18.119.35.43` at your firewall as a second layer.

## Debugging Verification Failures

- `401` on every request: the header value doesn't match the secret on the webhook details page. Check for whitespace or a secret from a different webhook or environment.
- `500`: `STIGG_WEBHOOK_SECRET` is missing from the environment.
- Use **Send test event** in Stigg to see the exact request and your response.
