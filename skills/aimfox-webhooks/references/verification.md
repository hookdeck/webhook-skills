# How to Verify Aimfox Webhook Requests

## How Does Aimfox Authenticate Webhooks?

Aimfox does not sign payloads. There is no HMAC, no timestamp and no signature header. When you
add a webhook you can set an **Authentication Header** (Basic, or a custom header such as a Bearer
token). The API stores it as a free-form `headers` object, e.g. `{"Authorization": "Bearer 123"}`.
Aimfox sends that header with every delivery and your endpoint checks it.

```
Authorization: Bearer your-secret
```

The header name is chosen by you. Read it from `AIMFOX_WEBHOOK_HEADER` (default `Authorization`)
and compare the **whole value** with `AIMFOX_WEBHOOK_SECRET`. Don't strip or parse a `Bearer `
or `Basic ` prefix; whatever you typed in Aimfox is the value you compare.

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the **body**. Nothing is signed, so a
modified body from someone who has the credential looks identical to a real one, and there is no
timestamp or nonce, so a captured request can be replayed. Mitigate:

- Serve the endpoint over HTTPS only.
- Rotate the credential if it leaks (change it in Aimfox and in your environment together).
- De-duplicate on the payload `id`, which also covers Aimfox's own retries.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyAimfoxRequest(headers, secret = process.env.AIMFOX_WEBHOOK_SECRET) {
  if (!secret) return false;
  const name = (process.env.AIMFOX_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes: str would raise TypeError on non-ASCII input
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_aimfox_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("AIMFOX_WEBHOOK_SECRET")
    name = os.environ.get("AIMFOX_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name.lower())  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If you entered `Bearer abc` in Aimfox, `AIMFOX_WEBHOOK_SECRET` is
  `Bearer abc`. Likewise a Basic value is the whole `Basic ...` string.
- **Header name is yours.** If you used a custom header, set `AIMFOX_WEBHOOK_HEADER` or the default
  `Authorization` is checked and every request gets 401.
- **Case-insensitive lookup.** HTTP header names are case-insensitive; Node lowercases them.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python pass bytes to `hmac.compare_digest`.
- **Fail closed.** If `AIMFOX_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `AIMFOX_WEBHOOK_SECRET` unset, or `Bearer ` / `Basic ` prefix missing from it |
| 401 with a custom header | `AIMFOX_WEBHOOK_HEADER` not set to that header name |
| 401 after changing the credential | Aimfox webhook and environment variable out of sync |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
