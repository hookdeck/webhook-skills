# How to Verify KoboToolbox REST Service Requests

## How Does KoboToolbox Authenticate Webhooks?

KoboToolbox does not sign payloads. When the REST Service has a username and password, every
request carries HTTP Basic authentication, sent preemptively:

```
Authorization: Basic base64(username:password)
```

There is no HMAC, timestamp or signature header. The body is not part of the check.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Implementation

Parse the header (scheme case-insensitive, split the decoded value on the **first** colon, since
passwords may contain colons), then compare the username and the password each in constant time.
Evaluate both comparisons before deciding, so a wrong username takes as long as a wrong password.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) { // Buffers; hashing gives equal lengths so timingSafeEqual never throws
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(a).digest(),
    crypto.createHash('sha256').update(b).digest());
}

function parseBasicAuth(header) {
  const m = /^basic +([A-Za-z0-9+/]+=*)\s*$/i.exec(header || '');
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64');
  const i = decoded.indexOf(0x3a);
  return i < 0 ? null : { username: decoded.subarray(0, i), password: decoded.subarray(i + 1) };
}

function verifyKoboRequest(headers, user = process.env.KOBOTOOLBOX_WEBHOOK_USERNAME,
                           pass = process.env.KOBOTOOLBOX_WEBHOOK_PASSWORD) {
  if (!user || !pass) return false;
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(user));
  const passOk = safeEqual(creds.password, Buffer.from(pass));
  return userOk && passOk;
}
```

### Python

```python
import base64, binascii, hashlib, hmac, os, re

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def parse_basic_auth(header):
    m = re.match(r"^basic +([A-Za-z0-9+/]+=*)\s*$", header or "", re.IGNORECASE)
    if not m:
        return None
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError):
        return None
    user, sep, password = decoded.partition(b":")
    return (user, password) if sep else None

def verify_kobotoolbox_request(headers, username=None, password=None) -> bool:
    username = username if username is not None else os.environ.get("KOBOTOOLBOX_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("KOBOTOOLBOX_WEBHOOK_PASSWORD")
    creds = parse_basic_auth(headers.get("authorization"))
    if not username or not password or creds is None:
        return False
    user_ok = safe_equal(creds[0], username.encode())
    pass_ok = safe_equal(creds[1], password.encode())
    return user_ok and pass_ok
```

## Common Gotchas

- **Authenticates the sender, not the body.** Anyone who learns the credential can post any body
  and replay old requests. Use HTTPS, use a long random password and rotate it if it leaks. Make
  handlers idempotent (deduplicate on `_uuid` / `_id`), since retries re-send the same submission.
- **Compare bytes in Python.** `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`.
  Encode both sides.
- **Node lengths.** `timingSafeEqual` throws on unequal lengths; hash both sides first (or check
  lengths).
- **Fail closed.** If either env var is unset, reject everything.
- **Colons in passwords.** Split on the first colon only.
- **Raw body, any content type.** The body may be JSON or XML. Read it raw
  (`express.raw({ type: '*/*' })`), authenticate, then parse JSON only if it is JSON.
- **No credentials configured on the REST Service.** KoboToolbox then sends no `Authorization`
  header, and this endpoint would reject it. Set a username and password on the service.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or they differ from the REST Service credentials |
| 401 with the right credentials | Proxy strips `Authorization`, or the password has surrounding whitespace |
| 401 only for passwords with `:` | Header split on every colon instead of the first |
| `TypeError` in Python | Passed `str` (non-ASCII) to `compare_digest` |
| Handler rejects XML | JSON parsing before auth or without a fallback; accept non-JSON bodies |
