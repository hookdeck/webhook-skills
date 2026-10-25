# How to Verify Metabase Webhook Requests

## How Does Metabase Authenticate Webhooks?

Metabase does not sign payloads: there is no HMAC and no timestamp. With **Basic** authentication
selected on the webhook, Metabase builds `Authorization: Basic btoa(username:password)` and sends
it on **every request, up front** (preemptively), so your endpoint never needs to issue a
`401` challenge first.

```
Authorization: Basic bWV0YWJhc2UtaG9vazpwYXNzd29yZA==
```

> **A static shared credential authenticates the sender, not the body, and gives no replay
> protection** (no signature, no timestamp). Anyone who captures a request can resend it. Use
> HTTPS, keep the credential out of logs, and rotate it in Metabase and in your environment if it
> leaks.

## Implementation

Rules for both languages: scheme matched case-insensitively; only the strict base64 alphabet
accepted and decoded strictly (so valid credentials followed by junk are rejected); split on the
**first** colon (the password may contain colons); compare username and password each in constant
time and evaluate both before deciding.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyMetabaseRequest(headers, username, password) {
  if (!username || !password) return false;
  const header = headers['authorization'];
  if (typeof header !== 'string') return false;
  const match = /^basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64');
  if (decoded.toString('base64') !== match[1]) return false;
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

def verify_metabase_request(headers, username, password) -> bool:
    if not username or not password:
        return False
    match = re.fullmatch(r"basic +(\S+)", (headers.get("authorization") or "").strip(), re.I)
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False
    user, sep, pwd = decoded.partition(b":")
    if not sep:
        return False
    user_ok = safe_equal(user, username.encode("utf-8"))
    pass_ok = safe_equal(pwd, password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **Choose Basic on the webhook.** Bearer, API key and query-param options send different
  credentials and this check will reject them.
- **Fail closed.** If either environment variable is unset, reject everything.
- **No short-circuit.** Compute both comparisons before combining them, so a wrong username
  doesn't return faster than a wrong password.
- **Bytes, not strings, in Python.** `hmac.compare_digest` raises `TypeError` on a non-ASCII
  `str`; encode both sides.
- **`timingSafeEqual` throws on unequal lengths.** Compare SHA-256 digests (equal length) or check
  lengths first.
- **Raw body and size.** Read the body raw (`express.raw({ type: '*/*', limit: '10mb' })`) so any
  content type is accepted, and raise the default 100kb limit because alerts embed a base64 PNG.
  Parse JSON only after the credential check.
- **Split on the first colon.** A password containing `:` is valid.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Env vars unset, or they differ from the webhook's username and password |
| 401 and no `Authorization` header | The webhook uses None, API key or query-param auth; switch it to Basic |
| 401 only behind a proxy | The proxy strips the `Authorization` header |
| 413 Payload Too Large | Body exceeds the framework limit (Express `raw` defaults to 100kb) |
| 400 after authentication | Body isn't a JSON object |
