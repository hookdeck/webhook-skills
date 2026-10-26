# How to Verify JumpCloud Webhook Requests

## How Does JumpCloud Authenticate Webhooks?

JumpCloud does not sign payloads. With **Basic Authentication** selected on the webhook channel,
every request carries:

```
Authorization: Basic base64(username:password)
```

There is no HMAC and no timestamp. The body is not part of the check, but authenticate before
parsing it.

**What this does and doesn't give you:** a static shared credential authenticates the *sender*,
not the *body*, and gives **no replay protection** (no signature, no timestamp). Use HTTPS, and
rotate the credential if it leaks (change it on the channel and in your environment).

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseBasicAuth(header) {
  const m = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec((header || '').trim());
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  return i < 0 ? null : { username: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

function verifyJumpCloudRequest(headers, user = process.env.JUMPCLOUD_WEBHOOK_USERNAME,
                                pass = process.env.JUMPCLOUD_WEBHOOK_PASSWORD) {
  if (!user || !pass) return false;
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, user);
  const passOk = safeEqual(creds.password, pass);
  return userOk && passOk;
}
```

### Python

```python
import base64, hashlib, hmac, os, re

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify_jumpcloud_request(headers) -> bool:
    user = os.environ.get("JUMPCLOUD_WEBHOOK_USERNAME")
    password = os.environ.get("JUMPCLOUD_WEBHOOK_PASSWORD")
    m = re.match(r"^basic +([A-Za-z0-9+/]+={0,2})$", (headers.get("authorization") or "").strip(), re.I)
    if not (user and password and m):
        return False
    try:
        decoded = base64.b64decode(m.group(1) + "=" * (-len(m.group(1)) % 4), validate=True)
    except ValueError:
        return False
    u, sep, p = decoded.partition(b":")  # split on the first colon
    if not sep:
        return False
    user_ok = safe_equal(u, user.encode())
    pass_ok = safe_equal(p, password.encode())
    return user_ok and pass_ok
```

## Common Gotchas

- **Credentials must arrive on the first request.** The docs don't say whether JumpCloud sends
  Basic credentials preemptively. A `401` + `WWW-Authenticate` challenge flow won't work through
  Hookdeck, which verifies the request as received.
- **Split on the first colon.** The username can't contain a colon, but the password can.
- **Compare both fields, in constant time, without short-circuiting.** Check lengths or hash
  both sides before `timingSafeEqual` (it throws on unequal lengths). In Python encode both sides
  to bytes for `hmac.compare_digest`; passing `str` raises on non-ASCII.
- **Scheme is case-insensitive** (`Basic`, `basic`).
- **Fail closed.** If either environment variable is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Token and custom-header modes are different.** This skill covers Basic only. With Token auth
  or custom headers, check those headers instead.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Environment variables unset, or channel set to None/Token instead of Basic |
| 401 after editing the channel | The username or password changed; update both variables |
| 401 behind a proxy | The proxy strips the `Authorization` header |
| 401 with a challenge flow | The credentials aren't sent until a `WWW-Authenticate` challenge; they must be sent up front |
| 400 after authentication | Body isn't a JSON object |
