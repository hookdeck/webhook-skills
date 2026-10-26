# How to Verify Gumlet Webhook Requests

## How Does Gumlet Authenticate Webhooks?

Gumlet does not sign payloads. The optional **Secret Token** you set on the webhook comes back as
plain text in the `x-gumlet-token` header of each request. Compare the whole header value with the
secret you stored.

```
x-gumlet-token: your-secret-token
```

There is no HMAC, timestamp or prefix, and the raw body is not part of the check.

> Set a Secret Token on the Gumlet webhook. Webhooks without one send nothing to verify.

**What this does and doesn't give you:** a static shared credential authenticates the sender, not the
body, and gives no replay protection (no signature, no timestamp). Anyone who captures one request
can replay it or send their own payload. Use HTTPS, make handlers idempotent, and rotate the Secret
Token if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyGumletRequest(headers, secret = process.env.GUMLET_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['x-gumlet-token'];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_gumlet_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("GUMLET_WEBHOOK_SECRET")
    received = headers.get("x-gumlet-token")
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **No Secret Token, nothing to verify.** Without the optional token Gumlet sends no header. The
  examples reject such requests; set a token on the webhook.
- **Compare the whole value.** No prefix is added, so don't strip or split the header.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python, pass bytes to `hmac.compare_digest`, never `str`.
- **Fail closed.** If `GUMLET_WEBHOOK_SECRET` is unset, reject everything rather than comparing
  against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the token check.
- **Retries.** Non-2xx responses are retried every 30 minutes for 24 hours; a 401 caused by a
  misconfigured secret will keep coming back.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `GUMLET_WEBHOOK_SECRET` unset or different from the Secret Token in Gumlet |
| 401, header missing in logs | No Secret Token set on the webhook, or a proxy strips `x-gumlet-token` |
| 401 after editing the webhook | The Secret Token was changed; update `GUMLET_WEBHOOK_SECRET` |
| 400 after authentication | Body isn't a JSON object |
