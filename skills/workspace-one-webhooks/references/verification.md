# How to Verify Workspace ONE Event Notification Requests

## How Does Workspace ONE Authenticate Event Notifications?

Workspace ONE UEM does not sign payloads. There is no signature header, no HMAC and no
timestamp. Each Event Notifications rule has a User Name and Password, and every request carries
them as HTTP Basic auth:

```
Authorization: Basic base64(username:password)
```

Your endpoint decodes the header and compares both values with the credentials you configured.

## Why Does This Not Protect the Body or Stop Replays?

A static shared credential authenticates the sender, not the body, and gives no replay
protection:

- Nothing ties the credential to the payload, so a valid request can't be told apart from a
  tampered one if the transport is compromised.
- Nothing expires: there is no timestamp, so a captured request can be resent indefinitely.

So: serve the endpoint over HTTPS only, make handlers idempotent, and rotate the user name and
password if they leak.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyWorkspaceOneRequest(headers,
  user = process.env.WORKSPACE_ONE_WEBHOOK_USERNAME,
  pass = process.env.WORKSPACE_ONE_WEBHOOK_PASSWORD) {
  if (!user || !pass) return false;
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec((headers.authorization || '').trim());
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i === -1) return false;
  const userOk = safeEqual(decoded.slice(0, i), user);
  const passOk = safeEqual(decoded.slice(i + 1), pass);
  return userOk && passOk;
}
```

Alternatively check lengths first and call `crypto.timingSafeEqual` on equal-length Buffers.

### Python

```python
import base64, binascii, hmac, os, re

def verify_workspace_one_request(headers, username=None, password=None) -> bool:
    username = username if username is not None else os.environ.get("WORKSPACE_ONE_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("WORKSPACE_ONE_WEBHOOK_PASSWORD")
    if not username or not password:
        return False
    m = re.match(r"^basic\s+(\S+)$", (headers.get("authorization") or "").strip(), re.I)
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False
    user_b, sep, pass_b = decoded.partition(b":")
    if not sep:
        return False
    user_ok = hmac.compare_digest(user_b, username.encode("utf-8"))
    pass_ok = hmac.compare_digest(pass_b, password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **Constant-time compare, both values.** Compare the username and the password each in constant
  time and evaluate both before deciding. Don't use `==`, and don't `return` after the username
  fails.
- **`hmac.compare_digest` needs bytes.** Encode both sides. Passing `str` raises `TypeError` on
  non-ASCII input, which would turn a bad request into a 500.
- **Split on the first colon.** Passwords may contain `:`; the user name may not (RFC 7617).
- **Scheme is case-insensitive.** Accept `Basic`, `basic` and `BASIC`.
- **No challenge flow.** The docs don't say whether credentials are sent preemptively, so the
  credentials must arrive on the first request. A `401` + `WWW-Authenticate` response won't make
  Workspace ONE retry with credentials, and Hookdeck verifies the request as received.
- **Read the body raw.** Use `express.raw({ type: '*/*' })` (or `request.text()` /
  `request.body()`) so JSON and XML both arrive, and parse only after the credential check.
- **Fail closed.** If either environment variable is unset, reject every request.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Env vars unset, or the rule's User Name / Password differ from them |
| `401` only for some passwords | Password contains `:` and the header was split on every colon, or unusual characters were re-encoded |
| `401` through a proxy | The proxy strips or rewrites `Authorization`; check what reaches your app |
| `400` after a successful auth | Body isn't a JSON object or XML; check the rule's Format and the captured body |
| `500` on non-ASCII credentials in Python | `compare_digest` was called with `str`; encode to bytes |
