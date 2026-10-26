# How to Verify Kibana Webhook Requests

## How Does Kibana Authenticate Webhooks?

Kibana does not sign payloads. With **Basic authentication** selected on the Webhook connector it
sends the credentials on every request:

```
Authorization: Basic base64(username:password)
```

There is no HMAC and no timestamp. Hookdeck's Kibana source verifies this header; it never sends
a 401 challenge, so the header must arrive with each request.

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection.** Anyone who captures a request can replay it. Use HTTPS, and rotate the credential
> if it leaks. Custom headers and OAuth 2.0 are not covered by Hookdeck's Kibana source.

## Implementation

Rules for all languages: scheme case-insensitive; strict base64 only (valid credentials followed
by junk are rejected); split on the first colon; compare username and password each in constant
time and evaluate both; fail closed if unconfigured; `401` for missing, malformed or mismatched,
on every method.

### Node.js

```javascript
const crypto = require('crypto');
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const digest = (s) => crypto.createHash('sha256').update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function verifyBasicAuth(header, username, password) {
  if (!username || !password) return false;
  const m = /^basic\s+(\S+)$/i.exec(header || '');
  if (!m || !STRICT_BASE64.test(m[1])) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i === -1) return false;
  const userOk = safeEqual(decoded.slice(0, i), username);
  const passOk = safeEqual(decoded.slice(i + 1), password);
  return userOk && passOk;
}
```

### Python

```python
import base64, hashlib, hmac, os, re

BASIC = re.compile(r"basic\s+([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify_basic_auth(header):
    username = os.environ.get("KIBANA_WEBHOOK_USERNAME", "").encode()
    password = os.environ.get("KIBANA_WEBHOOK_PASSWORD", "").encode()
    m = BASIC.fullmatch(header or "")
    if not (username and password and m):
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except ValueError:
        return False
    user, sep, pw = decoded.partition(b":")
    if not sep:
        return False
    user_ok = safe_equal(user, username)
    pass_ok = safe_equal(pw, password)
    return user_ok and pass_ok
```

### Next.js

Same logic as the Node.js version, in `lib/verify-kibana.ts`; read the header with
`request.headers.get('authorization')` and the body with `await request.text()`. Export one
handler for each of `GET`, `POST`, `PUT`, `PATCH` and `DELETE`.

## Common Gotchas

- **Every method.** Check the credential first for GET, POST, PUT, PATCH and DELETE alike.
- **Empty body.** GET and DELETE may have none; don't fail on it.
- **Raw body.** Use `express.raw({ type: '*/*' })` so any content type works; parse after the check.
- **Colon in the password.** Split on the first colon only.
- **Bytes in Python.** `hmac.compare_digest` on `str` raises on non-ASCII; encode both sides.
- **No challenge.** Hookdeck never sends a 401 challenge; clients must send credentials upfront.
- **Method on the source.** Hookdeck pre-selects POST; allow other methods on the source too.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or the connector isn't set to Basic authentication |
| 401 after a password change | `KIBANA_WEBHOOK_PASSWORD` wasn't updated |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| Requests rejected before reaching you | The method isn't allowed on the Hookdeck source |
