# How to Verify Form.io Webhook Requests

## How Does Form.io Authenticate Webhooks?

Form.io does not sign payloads. When **Authorize User** and **Authorize Password** are set on the
Webhook action, every request carries:

```
Authorization: Basic base64(username:password)
```

There is no HMAC, timestamp or event header.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp): anyone who captures a request can resend it or
craft a new one with the same header. Use HTTPS, keep the credential out of logs, and rotate
it (change the action and `FORMIO_WEBHOOK_*`) if it leaks. Make handlers idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const sha = (b) => crypto.createHash('sha256').update(b).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b)); // equal-length digests

function parseBasicAuth(header) {
  const m = /^basic +([A-Za-z0-9+/]+={0,2}) *$/i.exec(header || ''); // scheme is case-insensitive
  if (!m) return null;
  const decoded = Buffer.from(m[1], 'base64');
  const i = decoded.indexOf(0x3a);                                 // first colon
  if (i < 0) return null;
  return { username: decoded.subarray(0, i), password: decoded.subarray(i + 1) };
}

function verifyFormioRequest(headers, user, pass) {
  if (!user || !pass) return false;
  const creds = parseBasicAuth(headers.authorization);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, Buffer.from(user));
  const passOk = safeEqual(creds.password, Buffer.from(pass));
  return userOk && passOk; // no short-circuit: both comparisons always run
}
```

### Python

```python
import base64, hmac, re

def parse_basic_auth(header):
    m = re.match(r"^basic +([A-Za-z0-9+/]+={0,2}) *$", header or "", re.I)
    if not m:
        return None
    decoded = base64.b64decode(m.group(1) + "=" * (-len(m.group(1)) % 4), validate=True)
    user, sep, pwd = decoded.partition(b":")  # first colon
    return (user, pwd) if sep else None

def verify_formio_request(headers, user, pwd):
    creds = parse_basic_auth(headers.get("authorization"))
    if not (user and pwd and creds):
        return False
    # bytes on both sides: compare_digest raises TypeError on non-ASCII str
    user_ok = hmac.compare_digest(creds[0], user.encode())
    pass_ok = hmac.compare_digest(creds[1], pwd.encode())
    return user_ok and pass_ok
```

## Common Gotchas

- **Methods.** The route must accept POST, PUT, PATCH, GET and DELETE. A POST-only route 404s or
  405s every update and delete. The verb is the operation (Match: POST create, PUT update,
  DELETE delete).
- **Empty bodies.** GET and some DELETE requests have no body. Treat an empty body as `{}` after
  authenticating; don't fail on `JSON.parse('')`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Split on the first colon.** Passwords may contain `:`.
- **Constant-time compare.** Hash both sides or check lengths before `timingSafeEqual`, which
  throws on unequal lengths. In Python, pass bytes to `hmac.compare_digest`.
- **Fail closed.** If either environment variable is unset, reject everything.
- **Hookdeck source.** It pre-selects POST only; allow PUT and DELETE too.
- **Transform Payload.** A custom script can change the body shape.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `FORMIO_WEBHOOK_USERNAME`/`PASSWORD` unset, or differ from Authorize User/Password |
| 401, no `Authorization` header | Authorize User/Password left blank, or a proxy strips the header |
| 401 only when password has a colon | Header split on every colon instead of the first |
| Creates work, updates/deletes fail | Route or Hookdeck source allows POST only |
| 405 | Method outside POST, PUT, PATCH, GET, DELETE |
| 400 after authentication | Body is non-empty but isn't a JSON object (check Transform Payload) |
