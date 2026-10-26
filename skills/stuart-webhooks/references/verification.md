# How to Verify Stuart Webhook Requests

## How Does Stuart Authenticate Webhooks?

Stuart does not sign payloads: there is no HMAC, signature header or timestamp. You configure a
*Webhook authentication header* (name must start with `X-`) and a *Webhook authentication key*,
and Stuart adds that header to every webhook:

```
X-Webhook-Secret: 9f2c7e1d5b8a4c3e9f2c7e1d5b8a4c3e
```

Your endpoint compares the received value with the one you configured.

## What This Does and Doesn't Protect

A static shared credential **authenticates the sender, not the body**, and gives **no replay
protection**: nothing ties the value to the payload or to a point in time, so anyone who captures
one request can resend it, or send a different body with the same header. Therefore:

- Serve the endpoint over HTTPS only.
- Keep the value secret and out of logs.
- Rotate it (update Stuart and `STUART_WEBHOOK_SECRET`) if it leaks.
- Deduplicate on `event_id`, which is unique except on retries.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyStuartRequest(headers, name = process.env.STUART_WEBHOOK_HEADER || 'X-Webhook-Secret',
                             secret = process.env.STUART_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode to bytes: compare_digest raises on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_stuart_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("STUART_WEBHOOK_HEADER") or "X-Webhook-Secret"
    secret = secret if secret is not None else os.environ.get("STUART_WEBHOOK_SECRET")
    received = headers.get(name.lower())  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **The header name is yours.** Stuart has no fixed header; use what you entered, and look it up
  case-insensitively.
- **Compare the whole value.** If the key is `Bearer abc`, `STUART_WEBHOOK_SECRET` is
  `Bearer abc`. Don't strip or parse a `Bearer ` prefix.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python encode both sides to bytes for `hmac.compare_digest`.
- **Fail closed.** If `STUART_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Sandbox vs Production.** They are configured separately; use separate secrets.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `STUART_WEBHOOK_SECRET` unset, or `STUART_WEBHOOK_HEADER` doesn't match the name in Stuart |
| 401 with the right secret | Key in Stuart includes a `Bearer ` prefix (or trailing space) that your env var lacks |
| 401 only behind a proxy | The proxy strips or renames the `X-` header |
| 401 on one environment | Sandbox and Production have different keys |
| 400 after authentication | Body isn't a JSON object |
