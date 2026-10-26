# How to Verify Prometheus Alertmanager Webhook Requests

## How Does Alertmanager Authenticate Webhooks?

Alertmanager does not sign payloads. The receiver's `http_config` sets the `Authorization` header
on every request, in one of two forms:

```
Authorization: Bearer <credentials>                 # authorization (default type Bearer)
Authorization: Basic base64(username:password)      # basic_auth
```

There is no HMAC, timestamp or signed content. **A static shared credential authenticates the
sender, not the body, and gives no replay protection.** Anyone who captures a request can replay
it, and nothing ties the credential to a particular payload. Use HTTPS, keep the credentials out of
logs, and rotate them if they leak.

## What Does the Handler Check?

It matches Hookdeck's Prometheus Alertmanager source, which offers Basic auth (the default) and
Bearer token (API key on `authorization` with value prefix `Bearer `):

1. **Bearer:** if the header starts with `Bearer ` (any case; auth schemes are case-insensitive per
   RFC 9110), compare the rest with `ALERTMANAGER_WEBHOOK_SECRET` in constant time. A leading
   `Bearer ` in the configured value is stripped; nothing is trimmed.
2. **Basic:** if the header starts with `Basic ` (any case), decode the base64 strictly, split on
   the first colon (a password may contain `:`), and compare the username and the password with
   `ALERTMANAGER_WEBHOOK_USERNAME` and `ALERTMANAGER_WEBHOOK_PASSWORD`, both in constant time.
3. A form that isn't configured is rejected. With neither configured, every request is rejected.
4. Missing header, another scheme, malformed credentials or a mismatch: `401`.

Hookdeck never sends a 401 challenge. That doesn't matter here: Alertmanager sends `basic_auth`
with every request, without waiting to be challenged.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

// Hash both sides: equal-length buffers, so timingSafeEqual never throws.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const BEARER = /^bearer /i; // auth schemes are case-insensitive (RFC 9110)
const BASIC = /^basic +([A-Za-z0-9+/]+={0,2})$/i;

function verifyAlertmanagerRequest(headers, env = process.env) {
  const header = headers['authorization'];
  if (typeof header !== 'string' || !header) return false;

  if (BEARER.test(header)) {                         // http_config.authorization (Bearer)
    const expected = (env.ALERTMANAGER_WEBHOOK_SECRET || '').replace(BEARER, ''); // bare secret
    return Boolean(expected) && safeEqual(header.replace(BEARER, ''), expected);
  }

  const m = BASIC.exec(header);                      // http_config.basic_auth
  const user = env.ALERTMANAGER_WEBHOOK_USERNAME;
  const pass = env.ALERTMANAGER_WEBHOOK_PASSWORD;
  if (!m || !user || !pass) return false;            // not Basic, or basic_auth not configured
  const buf = Buffer.from(m[1], 'base64');
  if (buf.toString('base64') !== m[1]) return false; // canonical base64 only
  const decoded = buf.toString('utf8');
  const i = decoded.indexOf(':');                    // FIRST colon: a password may contain ':'
  if (i === -1) return false;
  const userOk = safeEqual(decoded.slice(0, i), user);
  const passOk = safeEqual(decoded.slice(i + 1), pass); // evaluate both, no short-circuit
  return userOk && passOk;
}
```

### Python

```python
import base64, hashlib, hmac, os, re

BEARER = re.compile(r"^bearer ", re.IGNORECASE)
BASIC = re.compile(r"basic +([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_alertmanager_request(headers, env=os.environ) -> bool:
    header = headers.get("authorization")
    if not header:
        return False

    if BEARER.match(header):  # http_config.authorization (Bearer)
        expected = BEARER.sub("", env.get("ALERTMANAGER_WEBHOOK_SECRET", ""), count=1)
        return bool(expected) and safe_equal(BEARER.sub("", header, count=1), expected)

    m = BASIC.fullmatch(header)  # http_config.basic_auth
    user = env.get("ALERTMANAGER_WEBHOOK_USERNAME")
    password = env.get("ALERTMANAGER_WEBHOOK_PASSWORD")
    if not m or not user or not password:
        return False  # not Basic, or basic_auth not configured
    try:
        raw = base64.b64decode(m.group(1), validate=True)
        decoded = raw.decode("utf-8")
    except ValueError:  # binascii.Error, UnicodeDecodeError
        return False
    if base64.b64encode(raw).decode("ascii") != m.group(1) or ":" not in decoded:
        return False  # canonical base64 only (b64decode ignores stray padding)
    got_user, _, got_password = decoded.partition(":")  # FIRST colon
    user_ok = safe_equal(got_user, user)
    password_ok = safe_equal(got_password, password)  # evaluate both, no short-circuit
    return user_ok and password_ok
```

## Common Gotchas

- **Store the bare secret.** Alertmanager adds `Bearer `; don't put it in `credentials`.
- **Case-insensitive scheme.** `bearer`, `Bearer` and `BEARER` are all valid.
- **Constant-time compare.** Check lengths or hash both sides before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes; passing a non-ASCII
  `str` raises.
- **Fail closed.** A form whose env vars are unset is rejected; with none set, everything is.
- **Pick the matching Hookdeck method.** `basic_auth` needs Basic auth on the source (the default);
  `authorization` needs Bearer token.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Trailing newline in `credentials_file`.** Create the file with `printf '%s'` (no newline) and
  keep your endpoint's copy identical; the handler doesn't trim.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every Bearer request | `ALERTMANAGER_WEBHOOK_SECRET` unset, or differs from the credentials file |
| 401 on every Basic request | `ALERTMANAGER_WEBHOOK_USERNAME` / `ALERTMANAGER_WEBHOOK_PASSWORD` unset or different |
| 401 only behind a proxy | The proxy strips or rewrites `Authorization` |
| 401 after rotating | Alertmanager wasn't reloaded, or the endpoint still has the old secret |
| 400 after authentication | Body isn't a JSON object |
