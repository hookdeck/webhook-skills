# How to Verify Prometheus Alertmanager Webhook Requests

## How Does Alertmanager Authenticate Webhooks?

Alertmanager does not sign payloads. The receiver's `http_config` sets the `Authorization` header
on every request. With `authorization` (default type `Bearer`) and `credentials` or
`credentials_file`, each request carries:

```
Authorization: Bearer <credentials>
```

There is no HMAC, timestamp or signed content. **A static shared credential authenticates the
sender, not the body, and gives no replay protection.** Anyone who captures a request can replay
it, and nothing ties the credential to a particular payload. Use HTTPS, keep the secret out of
logs, and rotate it if it leaks.

## What Does the Handler Check?

Matches Hookdeck's Prometheus Alertmanager source (API key on `authorization`, value prefix
`Bearer `):

1. Read the bare secret from `ALERTMANAGER_WEBHOOK_SECRET`. If the configured value itself starts
   with `Bearer ` (any case), strip that prefix. Don't trim or otherwise alter the secret.
2. Require the `Authorization` header to start with `Bearer ` (compared case-insensitively;
   auth schemes are case-insensitive per RFC 9110).
3. Compare the rest with the secret in constant time.
4. Missing header, wrong scheme or mismatch: `401`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const BEARER = /^bearer /i;

function verifyAlertmanagerRequest(headers, secret = process.env.ALERTMANAGER_WEBHOOK_SECRET) {
  if (!secret) return false;
  const expected = secret.replace(BEARER, '');
  if (!expected) return false; // a configured value of just "Bearer " must not match
  const header = headers['authorization'];
  if (!header || !BEARER.test(header)) return false;
  return safeEqual(header.replace(BEARER, ''), expected);
}
```

### Python

```python
import hashlib, hmac, os, re

BEARER = re.compile(r"^bearer ", re.IGNORECASE)

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_alertmanager_request(headers, secret=None) -> bool:
    secret = secret if secret is not None else os.environ.get("ALERTMANAGER_WEBHOOK_SECRET")
    header = headers.get("authorization")
    if not secret or not header or not BEARER.match(header):
        return False
    expected = BEARER.sub("", secret, count=1)
    if not expected:
        return False  # a configured value of just "Bearer " must not match
    return safe_equal(BEARER.sub("", header, count=1), expected)
```

## Common Gotchas

- **Store the bare secret.** Alertmanager adds `Bearer `; don't put it in `credentials`.
- **Case-insensitive scheme.** `bearer`, `Bearer` and `BEARER` are all valid.
- **Constant-time compare.** Check lengths or hash both sides before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes; passing a non-ASCII
  `str` raises.
- **Fail closed.** If `ALERTMANAGER_WEBHOOK_SECRET` is unset, reject everything.
- **`basic_auth` sends `Basic ...`.** It fails the Bearer check by design; use the Bearer form.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Trailing newline in `credentials_file`.** Create the file with `printf '%s'` (no newline) and
  keep your endpoint's copy identical; the handler doesn't trim.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `ALERTMANAGER_WEBHOOK_SECRET` unset, or differs from the credentials file |
| 401 with `Basic` in logs | The receiver uses `basic_auth`; switch to `authorization` |
| 401 only behind a proxy | The proxy strips or rewrites `Authorization` |
| 401 after rotating | Alertmanager wasn't reloaded, or the endpoint still has the old secret |
| 400 after authentication | Body isn't a JSON object |
