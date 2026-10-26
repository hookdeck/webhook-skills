# How to Verify Tabby Webhook Requests

## Does Tabby Sign Webhooks?

No. Despite the "sign the request" wording in the API reference, there is no HMAC, timestamp or
signature. When you register a webhook you may pass `header: { title, value }`. Tabby then adds
that header to every notification:

```
X-Auth-Key: your_random_signing_secret
```

The header name is arbitrary and user-chosen. Without it, requests carry nothing to verify.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who captures one request can resend it. Use
HTTPS, make your handler idempotent, and rotate the value (`PUT /api/v1/webhooks/{id}`) if it
leaks.

## Implementation

Configuration: `TABBY_WEBHOOK_HEADER` (default `X-Auth-Key`) and `TABBY_WEBHOOK_SECRET`, the
exact, whole header value. This matches Hookdeck's Tabby source (API key verification with
header name and exact whole header value).

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyTabbyRequest(headers, name = process.env.TABBY_WEBHOOK_HEADER || 'X-Auth-Key',
                            secret = process.env.TABBY_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides to bytes: compare_digest raises on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_tabby_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("TABBY_WEBHOOK_HEADER") or "X-Auth-Key"
    secret = secret if secret is not None else os.environ.get("TABBY_WEBHOOK_SECRET")
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** If you registered `Bearer abc`, the secret is `Bearer abc`. Do not
  strip or parse a `Bearer ` prefix.
- **Header names are case-insensitive.** Node lower-cases them; look up `name.toLowerCase()`.
- **Registered without a header?** Then there is nothing to verify. Re-register with one.
- **Masked on read.** Tabby returns `header.value` masked, so keep your own copy of the secret.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python encode to bytes first.
- **Fail closed.** If `TABBY_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type works, then
  `JSON.parse` after the header check.
- **Respond 200 exactly.** Any other status, including 201 or 204, is a delivery error and is
  retried.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `TABBY_WEBHOOK_SECRET` unset, or `TABBY_WEBHOOK_HEADER` differs from `header.title` |
| 401 on every request | Webhook registered without a `header` |
| 401 after `PUT` update | The update omitted `header`, which removes it |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 401 with a `Bearer ` secret | The env var holds only the part after `Bearer ` |
| 400 after authentication | Body isn't a JSON object |
