# How to Authenticate Torii Custom Action Requests

## How Does Torii Authenticate Requests?

It doesn't sign them. There is no HMAC, signature header or timestamp. The workflow author adds a
secret header to the custom action (Step 7, headers as key-value pairs) and your endpoint checks
it. The header name is user-chosen.

```
Authorization: Bearer your-long-random-secret
```

## What Does the Check Guarantee?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection**: there is no signature over the payload and no timestamp, so anyone who captures a
request can resend it. Use HTTPS, keep the secret out of logs, make handlers idempotent, and
rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyToriiRequest(headers, secret = process.env.TORII_WEBHOOK_SECRET,
                            name = process.env.TORII_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_torii_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("TORII_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TORII_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False
    wanted = header_name.lower()
    received = next((v for k, v in headers.items() if k.lower() == wanted), None)
    return bool(received) and safe_equal(received, secret)
```

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc` in Torii, `TORII_WEBHOOK_SECRET` is
  `Bearer abc`. Do not strip or parse the prefix; a bare `abc` must fail.
- **Header name is yours.** Set `TORII_WEBHOOK_HEADER` to match; look it up case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes, never `str`, which
  raises on non-ASCII.
- **Fail closed.** If `TORII_WEBHOOK_SECRET` is unset, reject everything.
- **Not POST-only.** The author chooses the method; accept POST, PUT, PATCH, GET and DELETE, and
  handle an empty body. Allow the method on the Hookdeck source too (it pre-selects POST).
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, then
  parse after the credential check.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `TORII_WEBHOOK_SECRET` unset, or `TORII_WEBHOOK_HEADER` doesn't match the Torii header name |
| 401 with the right secret | Prefix mismatch: Torii value has `Bearer ` but the env var doesn't (or vice versa) |
| 401 only behind a proxy | The proxy strips or renames the header |
| Requests never arrive via Hookdeck | The custom action uses a method other than POST and it isn't allowed on the source |
| 400 after authentication | Non-empty body that isn't valid JSON; check the template's quoting of `@` placeholders |
