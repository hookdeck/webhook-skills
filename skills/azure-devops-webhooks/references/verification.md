# How to Verify Azure DevOps Webhook Requests

## How Does Azure DevOps Authenticate Webhooks?

Azure DevOps does not sign payloads. There is no HMAC, signature header or timestamp. The Web Hooks
consumer's `basicAuthCredentials` setting makes every request carry standard HTTP Basic
authentication:

```
Authorization: Basic base64(username:password)
```

Your endpoint decodes the header and compares the username and the password with the values you
configured on the subscription.

## What This Does and Doesn't Protect Against

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection**:

- Anyone who learns the credential can forge any event.
- A captured request can be replayed unchanged, because nothing in it expires or binds to the body.
- Use HTTPS (Azure DevOps requires it for basic auth), keep the credential in a secret store, and
  **rotate it** (edit the subscription, then update your env vars) if it leaks.
- Make handlers idempotent (see webhook-handler-patterns), and treat the payload as a hint: fetch the
  resource from the Azure DevOps API when you need trustworthy data.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) { // Buffers in, constant-time out
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseBasicAuth(header) {
  const m = /^basic +([A-Za-z0-9+/]+={0,2})\s*$/i.exec(header || '');
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64');
  const i = decoded.indexOf(0x3a); // first colon
  return i < 0 ? null : { username: decoded.subarray(0, i), password: decoded.subarray(i + 1) };
}

function verifyAzureDevOpsRequest(headers, user, pass) {
  if (!user || !pass) return false;
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(user));
  const passOk = safeEqual(creds.password, Buffer.from(pass));
  return userOk && passOk; // both evaluated before deciding
}
```

### Python

```python
import base64, binascii, hashlib, hmac, re

BASIC = re.compile(r"^basic +([A-Za-z0-9+/]+={0,2})\s*$", re.IGNORECASE)

def safe_equal(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())

def verify_azure_devops_request(headers, user: str, password: str) -> bool:
    if not user or not password:
        return False
    m = BASIC.match(headers.get("authorization") or "")
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False
    u, sep, p = decoded.partition(b":")  # first colon
    if not sep:
        return False
    user_ok = safe_equal(u, user.encode("utf-8"))
    pass_ok = safe_equal(p, password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **Scheme is case-insensitive.** Accept `Basic`, `basic`, `BASIC`.
- **Split on the first colon only.** The username can't contain a colon, but the password can.
- **Validate the base64.** Node's `Buffer.from(x, 'base64')` and lenient decoders silently accept
  junk; check the alphabet first, and use `validate=True` in Python.
- **Compare bytes in constant time, and compare both fields.** Don't `return userOk && ...` before
  computing the password comparison. `crypto.timingSafeEqual` throws on unequal lengths (hash both
  sides first), and Python's `hmac.compare_digest` raises `TypeError` for a non-ASCII `str`
  (encode to bytes first).
- **Fail closed.** If either env var is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, check
  the credentials, then `JSON.parse`.
- **Malformed doc samples.** The docs' `build.complete` and deployment-approval-pending examples are
  two concatenated JSON objects; they don't parse. Don't copy them into tests.
- **HTTPS only.** Basic auth over HTTP exposes the credential.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or the subscription has no basic auth username/password |
| 401 began suddenly | The credential was changed on the subscription; update the env vars |
| 401 only behind a proxy | The proxy strips or rewrites the `Authorization` header |
| 401 with non-ASCII credentials | Compare as UTF-8 bytes on both sides |
| 400 after authentication | Body isn't a single JSON object |
