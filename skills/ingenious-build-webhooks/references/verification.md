# How to Verify INGENIOUS.BUILD Webhook Requests

## How Does INGENIOUS.BUILD Authenticate Webhooks?

It doesn't sign them. The Custom Accounting Integration lets you add authorization headers to each
webhook URL ("for example: `Authorization: Bearer your-token-here`"). Your endpoint compares the
received header with the value you stored.

Add an auth header, such as Authorization: Bearer <token>, to each webhook URL on the Custom Accounting Integration.

There is no HMAC, signature header or timestamp. The header name is user-chosen, so the examples
read it from `INGENIOUS_BUILD_WEBHOOK_HEADER` (default `Authorization`) and the expected value from
`INGENIOUS_BUILD_WEBHOOK_SECRET`. This matches Hookdeck's INGENIOUS.BUILD source (API key
verification: header name plus exact, whole header value).

**What this does and does not give you:** a static shared credential authenticates the sender, not
the body, and gives no replay protection (no signature, no timestamp). Anyone who captures one
request can resend it. Use HTTPS only, and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyIngeniousBuildRequest(
  headers,
  name = process.env.INGENIOUS_BUILD_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.INGENIOUS_BUILD_WEBHOOK_SECRET
) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))  # bytes, never str

def verify_ingenious_build_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("INGENIOUS_BUILD_WEBHOOK_HEADER") or "Authorization"
    secret = secret or os.environ.get("INGENIOUS_BUILD_WEBHOOK_SECRET")
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc`, the secret is `Bearer abc`. Don't strip or
  parse the prefix on either side.
- **Case-insensitive header name.** Node lowercases incoming names; look up `name.toLowerCase()`.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths, so hash both sides first
  (or check lengths). In Python pass bytes to `hmac.compare_digest`; `str` raises on non-ASCII.
- **Fail closed.** If `INGENIOUS_BUILD_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **One header per URL.** The header is set on each webhook URL separately; make sure every URL you
  filled in carries it.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or the `Bearer ` prefix missing from the secret |
| 401 for one object type only | That URL was saved without the auth header |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object |
