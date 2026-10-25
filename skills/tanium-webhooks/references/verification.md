# How to Authenticate Tanium Connect HTTP Requests

## How Does Tanium Authenticate Connect Deliveries?

It doesn't sign them. There is no HMAC, timestamp or signature header. Instead, the HTTP
destination's **Header Authentication** option adds an HTTP request header containing the
**Auth Header Name** and **Secret** value you entered:

```
X-Tanium-Secret: your-secret-value
```

(For Splunk the same option is documented as Auth Header Name `Authorization` with value
`Splunk <token>`.) Your endpoint compares that header with the value it has stored.

## What Does a Static Secret Give You?

A shared static credential **authenticates the sender, not the body**, and gives **no replay
protection**: anyone who captures one request can resend it, and nothing ties the secret to the
payload. Mitigate with HTTPS only, a long random secret, and rotation if it leaks. Make handlers
idempotent.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyTaniumRequest(
  headers,
  secret = process.env.TANIUM_WEBHOOK_SECRET,
  headerName = process.env.TANIUM_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # encode both sides to bytes: compare_digest raises on non-ASCII str
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_tanium_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("TANIUM_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TANIUM_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If the Secret is `Bearer abc123`, that entire string is what
  arrives. Do not strip or parse a `Bearer ` prefix.
- **The header name is yours.** It is whatever you typed as Auth Header Name; set
  `TANIUM_WEBHOOK_HEADER` to match. HTTP header names are case-insensitive.
- **Not POST-only.** The method is chosen on the destination and Tanium's docs don't list the
  options; the examples accept `POST`, `PUT` and `PATCH` for illustration, so add any other method
  your destination uses.
  Hookdeck's Tanium source pre-selects `POST` without managing the method, so allow any other
  method on the source too.
- **Raw body, any content type.** Read it raw (`express.raw({ type: '*/*' })`), authenticate, then
  `JSON.parse`. Accept an empty body.
- **Fail closed.** If `TANIUM_WEBHOOK_SECRET` is unset, reject everything.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths; in Python encode both sides to bytes for `compare_digest`.
- **Other auth modes aren't covered.** Basic Authentication and OAuth2 Client Credentials are not
  supported by Hookdeck's Tanium source or these examples.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `TANIUM_WEBHOOK_SECRET` unset, or `TANIUM_WEBHOOK_HEADER` doesn't match the Auth Header Name |
| 401 only with a prefix | The env value omits (or adds) the `Bearer ` prefix typed in Tanium |
| 401 only behind a proxy | The proxy strips or renames the header (common with `Authorization`) |
| 404/405 on delivery | The destination uses a method other than `POST` and the route or Hookdeck source allows only `POST` |
| 400 after authentication | Body is not valid JSON object/array |
