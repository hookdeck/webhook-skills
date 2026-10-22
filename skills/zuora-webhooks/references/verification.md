# How to Verify Zuora Callout Requests

## How Does Zuora Authenticate Callouts?

Zuora does not sign callouts. When the callout template's **Authentication Type** is
`Username/Password`, Zuora sends HTTP Basic credentials (RFC 7617):

```
Authorization: Basic base64(username:password)
```

**Enable Preemptive Authentication must be ticked on the template.** By default Zuora's
sequence is: send the request without `Authorization`, wait for your `401` with a
`WWW-Authenticate` header, then resend with credentials. That flow does not work through Hookdeck,
and a handler that checks the header on the first request would reject it. Preemptive
Authentication puts the credentials in the first request.

The template also has an optional HMAC section, but its algorithm, output format, signed data and
header name are all user-defined, so there is no standard scheme to verify and this skill doesn't
cover it.

## What Does a Static Credential Give You?

A shared username and password authenticate the **sender**, not the **body**. There is no
signature over the payload and no timestamp, so an intercepted request can be replayed and a body
can't be checked for tampering. Mitigate that by:

- Accepting callouts over HTTPS only (Zuora requires an `https://` URL).
- Treating the credential as a secret and **rotating it** (template and env vars) if it leaks.
- Keeping callout bodies to IDs and fetching the details from the Zuora API.
- Deduplicating on `Zuora-Notification-Id`, which is stable across retries.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic') return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(parts[1])) return null;  // reject non-base64
  const decoded = Buffer.from(parts[1], 'base64');
  const colon = decoded.indexOf(0x3a);                  // first colon only
  if (colon === -1) return null;
  return { username: decoded.subarray(0, colon), password: decoded.subarray(colon + 1) };
}

function verifyZuoraRequest(headers, user = process.env.ZUORA_WEBHOOK_USERNAME,
                            pass = process.env.ZUORA_WEBHOOK_PASSWORD) {
  if (!user || !pass) return false;
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(user));
  const passOk = safeEqual(creds.password, Buffer.from(pass));
  return userOk && passOk;                              // both evaluated before deciding
}
```

### Python

```python
import base64, binascii, hashlib, hmac, os

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify_zuora_request(headers, username=None, password=None) -> bool:
    username = username or os.environ.get("ZUORA_WEBHOOK_USERNAME")
    password = password or os.environ.get("ZUORA_WEBHOOK_PASSWORD")
    parts = (headers.get("authorization") or "").split()
    if not (username and password) or len(parts) != 2 or parts[0].lower() != "basic":
        return False
    try:
        user_b, sep, pass_b = base64.b64decode(parts[1], validate=True).partition(b":")
    except (binascii.Error, ValueError):
        return False
    if not sep:
        return False
    user_ok = safe_equal(user_b, username.encode())      # bytes, never str
    pass_ok = safe_equal(pass_b, password.encode())
    return user_ok and pass_ok
```

## Common Gotchas

- **Preemptive Authentication off.** The first request has no `Authorization` header, so the
  check returns `401`. Tick the box on the template.
- **Split on the first colon.** A password may contain `:`; only the first colon separates the
  username.
- **Constant-time, both values.** Compare the username and the password each in constant time and
  evaluate both before deciding (no `&&` short-circuit on the comparisons).
- **Bytes in Python.** `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`; encode both
  sides to bytes first.
- **Length checks.** `crypto.timingSafeEqual` throws on unequal lengths; hash both sides (as above)
  or check lengths first.
- **Fail closed.** If either env var is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, and parse
  JSON only after the credential check. A `GET` has an empty body.
- **Respond `200`.** Zuora counts any other status as a failure; `401` and `400` aren't retried,
  but `403` and `5xx` are.
- **Don't send `WWW-Authenticate` hoping for the challenge flow.** The examples include it on a
  `401` as good HTTP practice, but rely on Preemptive Authentication.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or "Enable Preemptive Authentication" is off |
| 401 and no `Authorization` header in the logs | Preemptive Authentication off; Zuora is waiting for a challenge |
| 401 after rotating the password | Template and `ZUORA_WEBHOOK_PASSWORD` out of sync |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| 400 after authentication | The template body isn't a JSON object, or the body isn't JSON at all |
| 405 | The route is only wired for a subset of methods; accept POST, PUT, PATCH, GET, DELETE |
