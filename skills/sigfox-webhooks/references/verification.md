# How to Verify Sigfox Webhook Requests

## How Does Sigfox Authenticate Callbacks?

It doesn't sign them. There is no HMAC, signature header or timestamp. Instead you add a header
to the custom callback (Sigfox allows `Authorization` plus any custom name; other standard headers
are forbidden) and your endpoint checks that header on every request.

```
Authorization: Bearer your-long-random-value
```

> A static shared credential authenticates the **sender**, not the **body**, and gives **no
> replay protection**: anyone who captures one request can resend it, and a tampered body is not
> detectable. Use HTTPS, keep the value out of logs, and rotate it if it leaks. Make your handler
> idempotent (see webhook-handler-patterns).

## Implementation

The header name comes from `SIGFOX_WEBHOOK_HEADER` (default `Authorization`) and the expected
value from `SIGFOX_WEBHOOK_SECRET`: the exact, whole header value, including any `Bearer ` prefix.
Look the header up case-insensitively and compare the whole value; don't strip or parse a prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifySigfoxRequest(headers, secret = process.env.SIGFOX_WEBHOOK_SECRET,
                             name = process.env.SIGFOX_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_sigfox_request(headers, secret=None, name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("SIGFOX_WEBHOOK_SECRET", "")
    name = name or os.environ.get("SIGFOX_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)          # Starlette headers are case-insensitive
    if not secret or not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Whole value, no prefix parsing.** If the callback header is `Bearer abc`, set
  `SIGFOX_WEBHOOK_SECRET=Bearer abc`. A secret of `abc` will not match.
- **Header name is yours.** If you used `X-Sigfox-Token`, set `SIGFOX_WEBHOOK_HEADER` to match.
- **Method varies.** `GET`, `POST` and `PUT` are all valid; a `GET` has no body. Authenticate
  every method the same way.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted,
  and parse (JSON or form-encoded) only after the credential check.
- **Constant-time compare.** `crypto.timingSafeEqual` throws on unequal lengths, so check lengths
  first. In Python pass bytes to `hmac.compare_digest`.
- **Fail closed.** If `SIGFOX_WEBHOOK_SECRET` is unset, reject everything.
- **Don't mix with URL credentials.** `login:password@` URLs and an `Authorization` header
  conflict; use one.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `SIGFOX_WEBHOOK_SECRET` unset, or header missing from the callback's Headers |
| 401 with the right secret | Secret omits the `Bearer ` prefix typed in the callback, or header name differs |
| 401 only behind a proxy | The proxy strips or renames the credential header |
| 400 after authentication | Body isn't a JSON object or form-encoded data |
| Nothing arrives | Check the device type's **Callback error log** in the Sigfox backend |
