# How to Authenticate ClickPost Webhook Requests

## How Does ClickPost Authenticate Webhooks?

ClickPost does not sign payloads. With **Simple Token** authentication it sends:

```
Authorization: Token <secret>
```

There is no HMAC and no timestamp. The scheme is `Token`, not `Bearer`.

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, no timestamp). Use HTTPS, and rotate the credential if it leaks.

Choose Simple Token authentication on the ClickPost webhook and paste the token.

Not covered: X-API-Key, Webhook-Key, Basic Auth and Dynamic Token.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyClickPostRequest(headers, configured = process.env.CLICKPOST_WEBHOOK_SECRET) {
  if (!configured) return false;
  const secret = configured.toLowerCase().startsWith('token ') ? configured.slice(6) : configured;
  const header = headers['authorization'];
  if (!header || header.slice(0, 6).toLowerCase() !== 'token ') return false;
  return safeEqual(header.slice(6), secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify_clickpost_request(headers, configured=None) -> bool:
    configured = configured if configured is not None else os.environ.get("CLICKPOST_WEBHOOK_SECRET")
    if not configured:
        return False
    secret = configured[6:] if configured.lower().startswith("token ") else configured
    header = headers.get("authorization")
    if not header or header[:6].lower() != "token ":
        return False
    return safe_equal(header[6:].encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **`Token`, not `Bearer`.** A `Bearer` header is rejected.
- **Scheme is case-insensitive** (RFC 9110); the token itself is case-sensitive.
- **Store the bare secret.** If the configured value starts with `Token `, it is stripped, as Hookdeck does.
- **Don't trim the secret.** Whitespace is part of the value.
- **Bytes, not str, in Python.** `hmac.compare_digest` on non-ASCII `str` raises; encode both sides.
- **Fail closed.** If `CLICKPOST_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then `JSON.parse` after the check.
- **No replay protection.** Dedupe on `waybill` + scan.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `CLICKPOST_WEBHOOK_SECRET` unset, or the dashboard uses a different auth option (X-API-Key, Basic, ...) |
| 401 with a correct token | Handler expects `Bearer`, or the secret has stray whitespace |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| 400 after authentication | Body isn't a JSON scan object with an integer `clickpost_status_code` |
