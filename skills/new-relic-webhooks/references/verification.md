# How to Verify New Relic Webhook Requests

## How Does New Relic Authenticate Webhooks?

New Relic does not sign payloads. A Webhook destination can send HTTP Basic authentication:

```
Authorization: Basic base64(username:password)
```

There is no HMAC and no timestamp. The check is a comparison of the username and password with
the values you configured on the destination.

> **What this does and doesn't give you.** A static shared credential authenticates the
> *sender*, not the *body*, and gives **no replay protection**: anyone who captures one request
> can resend it, and a body can be altered by anything that can still present the credential.
> Use HTTPS only, and rotate the credential if it leaks. If you need replay protection, dedupe
> on `issueId` plus `state` in your handler.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const digest = (b) => crypto.createHash('sha256').update(b).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function verifyNewRelicRequest(headers, username, password) {
  if (!username || !password) return false;
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers['authorization'] || '');
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64');
  const colon = decoded.indexOf(0x3a);
  if (colon === -1) return false;
  const userOk = safeEqual(decoded.subarray(0, colon), Buffer.from(username));
  const passOk = safeEqual(decoded.subarray(colon + 1), Buffer.from(password));
  return userOk && passOk;
}
```

### Python

```python
import base64, binascii, hashlib, hmac, re

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify_new_relic_request(headers, username, password) -> bool:
    if not username or not password:
        return False
    m = re.match(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", headers.get("authorization") or "", re.IGNORECASE)
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False
    user, sep, pw = decoded.partition(b":")
    if not sep:
        return False
    user_ok = safe_equal(user, username.encode("utf-8"))
    pass_ok = safe_equal(pw, password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **Split on the first colon only.** The password may contain `:`; the username may not.
- **Check both, then decide.** Evaluate the username and the password comparisons before
  combining them, so timing doesn't reveal which one was wrong.
- **Compare bytes in constant time.** Node's `timingSafeEqual` throws on unequal lengths, so
  hash both sides (or check lengths first). Python's `hmac.compare_digest` raises on non-ASCII
  `str`; encode both sides to bytes.
- **Scheme is case-insensitive.** Accept `Basic`, `basic`, `BASIC`.
- **Fail closed.** If either environment variable is unset, reject every request.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted,
  then `JSON.parse` after the credential check. The template controls the body, so don't
  assume `application/json`.
- **Not Bearer or custom headers.** Those are separate destination options; this skill checks
  Basic authentication only.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or Basic authentication is not enabled on the destination |
| 401 only for some passwords | Splitting on every colon instead of the first, or comparing `str` instead of bytes |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| 401 began suddenly | The destination credential was changed; update the environment variables |
| 400 after authentication | The template doesn't render a JSON object (check for unquoted values; use `{{json ...}}`) |
