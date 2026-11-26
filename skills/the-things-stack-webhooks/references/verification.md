# Authenticating The Things Stack Webhooks

## No Signature

The Things Stack doesn't sign webhook requests. The Application Server (`pkg/applicationserver/io/web/request.go`) builds a `POST`, copies the webhook's stored headers onto it, and adds the downlink and domain headers. There's no HMAC anywhere in that package.

## Request Authentication

The Console's **Request authentication** checkbox turns a username and password into a stored header:

```javascript
// lorawan-stack: pkg/webui/console/components/webhook-form/mapping.js
newValues.headers.Authorization = `Basic ${btoa(`${_basic_auth_username}:${_basic_auth_password}`)}`
```

The docs describe it as "Authentication: Basic <credentials> format". That's a typo: the header is `Authorization`.

## Node.js

```javascript
const crypto = require('crypto');

function safeEqual(given, expected) {
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function verifyBasicAuth(authorization, username, password) {
  if (!username || !password) return false;
  const match = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(String(authorization || ''));
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  const userOk = safeEqual(decoded.slice(0, separator), username);
  const passOk = safeEqual(decoded.slice(separator + 1), password);
  return userOk && passOk;
}
```

## Python

```python
import base64, binascii, hashlib, hmac, re

def _safe_equal(given: str, expected: str) -> bool:
    return hmac.compare_digest(hashlib.sha256(given.encode()).digest(), hashlib.sha256(expected.encode()).digest())

def verify_basic_auth(authorization: str, username: str, password: str) -> bool:
    match = re.fullmatch(r"Basic\s+([A-Za-z0-9+/]+={0,2})\s*", authorization or "", re.IGNORECASE)
    if not match or not username or not password:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except (binascii.Error, ValueError):
        return False
    user, sep, pw = decoded.partition(":")
    return bool(sep) & _safe_equal(user, username) & _safe_equal(pw, password)
```

## Details

- Hashing both sides to a fixed length before `timingSafeEqual` keeps the comparison constant-time when the lengths differ.
- Evaluate both comparisons before combining them, so a wrong username takes as long as a wrong password.
- Split at the first `:`. The username can't contain one, the password can.
- The Console encodes with `btoa`, which only accepts Latin-1 characters. Stick to ASCII credentials.

## Debugging

| Symptom | Cause |
|---|---|
| No `Authorization` header | Request authentication is off on the webhook |
| Always `401` | The username or password differs from `TTS_WEBHOOK_USERNAME` / `TTS_WEBHOOK_PASSWORD` |
| `as.webhook.fail` with status 401 in Live data | The same mismatch, seen from The Things Stack's side |
| `as.webhook.fail` with a timeout | Your endpoint took longer than the timeout (5 seconds by default). Answer first, process later |
| Some message types never arrive | They aren't ticked under Enabled event types, or their path points elsewhere |
