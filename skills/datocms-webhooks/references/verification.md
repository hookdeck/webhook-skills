# How to Verify DatoCMS Webhook Requests

## How Does DatoCMS Authenticate Webhooks?

DatoCMS does not sign payloads and sends no timestamp. If you set `http_basic_user` and
`http_basic_password` on the webhook, every request carries:

```
Authorization: Basic base64(username:password)
```

Your endpoint decodes the header and compares the username and password with the values you
configured. There is no HMAC, and the raw body is not part of the check.

> **What this does and doesn't give you.** A static shared credential authenticates the
> *sender*, not the *body*, and gives **no replay protection** (no signature, no timestamp).
> Anyone who captures one request, or learns the credential, can send any body. Use HTTPS only
> and rotate the credential if it leaks. Make handlers idempotent (key on `webhook_call_id`),
> since retries and manual resends repeat deliveries.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const digest = (v) => crypto.createHash('sha256').update(v).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function verifyDatoCmsRequest(headers, user = process.env.DATOCMS_WEBHOOK_USERNAME,
                              pass = process.env.DATOCMS_WEBHOOK_PASSWORD) {
  if (!user || !pass) return false;
  const m = /^basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(headers['authorization'] || '');
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  const userOk = safeEqual(decoded.slice(0, i), user);
  const passOk = safeEqual(decoded.slice(i + 1), pass);
  return userOk && passOk;
}
```

### Python

```python
import base64, binascii, hmac, os, re

def verify_datocms_request(headers, user=None, password=None) -> bool:
    user = user or os.environ.get("DATOCMS_WEBHOOK_USERNAME")
    password = password or os.environ.get("DATOCMS_WEBHOOK_PASSWORD")
    if not user or not password:
        return False
    m = re.fullmatch(r"basic\s+([A-Za-z0-9+/]+={0,2})\s*", headers.get("authorization", ""), re.I)
    if not m:
        return False
    try:
        decoded = base64.b64decode(m.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False
    got_user, sep, got_pass = decoded.partition(b":")   # split on the first colon
    if not sep:
        return False
    user_ok = hmac.compare_digest(got_user, user.encode("utf-8"))   # bytes, never str
    pass_ok = hmac.compare_digest(got_pass, password.encode("utf-8"))
    return user_ok and pass_ok
```

## Common Gotchas

- **Split on the first colon.** Passwords may contain `:`; usernames can't.
- **Scheme is case-insensitive.** Accept `Basic`, `basic`, `BASIC`.
- **Evaluate both comparisons.** Compute the username and password results before combining
  them, so a wrong username doesn't return faster than a wrong password.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so hash both sides to
  SHA-256 (or check lengths first). In Python use `hmac.compare_digest` on bytes: `str` arguments
  raise `TypeError` on non-ASCII.
- **Fail closed.** If either environment variable is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) because custom payloads may not be
  JSON; `JSON.parse` only after the credential check.
- **Custom headers aren't covered.** A custom header with a secret value is another option in
  DatoCMS but this skill checks Basic auth.
- **Respond fast.** DatoCMS times out at 2 seconds to connect and 8 seconds in total.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Username/password env vars unset, or differ from the webhook's settings |
| 401 after editing the webhook | Credentials changed in DatoCMS but not in your environment |
| 401 only behind a proxy | The proxy strips or rewrites `Authorization` |
| 401 with correct credentials | Password contains non-UTF-8 characters, or whitespace was copied into the env var |
| 400 after authentication | Body isn't JSON (e.g. a non-JSON custom payload) |
| 200 but "Unhandled event" | Custom payload without `entity_type` / `event_type` |
